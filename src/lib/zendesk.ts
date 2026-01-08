import { client } from '../zaf';
import { differenceInMinutes, parseISO } from 'date-fns';

export const THRESHOLDS = {
    WAIT_TIME_BREACH: 30,
    HANDLE_TIME_BREACH: 20
};

const CHANNELS = {
    MESSAGING: ['native_messaging', 'chat', 'facebook', 'twitter', 'line', 'whatsapp', 'instagram_direct']
};

export interface Ticket {
    id: number; subject: string; status: string; assignee_id: number | null; group_id: number | null;
    created_at: string; updated_at: string; via: { channel: string; };
}

export interface AgentStatus { online: number; working: number; }

export interface GroupMetric {
    id: number; name: string;
    longestEmailWait: number; longestMsgWait: number;
    longestEmailAHT: number; longestMsgAHT: number;
    newEmail: number; newMsg: number; openEmail: number; openMsg: number;
    pendingTickets: number;

    // NEW: Split Breaches so we can sum them up for cards
    breachedWait: number;
    breachedAHT: number;
    totalBreached: number; // Sum of both
}

export interface DashboardMetrics {
    longestWait: { time: number; ticketId: number };
    longestHandle: { time: number; ticketId: number };
    totalNew: number; totalOpen: number;
    breachedWaitCount: number; breachedHandleCount: number;
    agents: AgentStatus; groups: GroupMetric[];
}

export const fetchAllGroups = async () => {
    if (!client) return [];
    try {
        const response: any = await client.request('/api/v2/groups.json?per_page=100');
        return response.groups || [];
    } catch (e) { return []; }
};

export const fetchTicketData = async (): Promise<DashboardMetrics> => {
    if (!client) throw new Error("ZAF Client not initialized");

    const allGroups = await fetchAllGroups();
    const groupMap = new Map<number, GroupMetric>();

    allGroups.forEach((g: any) => {
        groupMap.set(g.id, {
            id: g.id, name: g.name,
            longestEmailWait: 0, longestMsgWait: 0, longestEmailAHT: 0, longestMsgAHT: 0,
            newEmail: 0, newMsg: 0, openEmail: 0, openMsg: 0, pendingTickets: 0,
            breachedWait: 0, breachedAHT: 0, totalBreached: 0
        });
    });

    let allTickets: Ticket[] = [];
    let url = `/api/v2/search.json?query=type:ticket status<solved sort:created_at_asc&per_page=100`;
    let pages = 0;

    while (url && pages < 50) {
        try {
            const response: any = await client.request(url);
            allTickets = [...allTickets, ...response.results];
            url = response.next_page;
            pages++;
        } catch (e) { break; }
    }

    let agentStats = { online: 0, working: 0 };
    try {
        const agentsResponse: any = await client.request('/api/v2/unified_agent_status');
        if (agentsResponse?.agent_statuses) {
            const allAgents = Object.values(agentsResponse.agent_statuses) as any[];
            agentStats.online = allAgents.filter(a => a.status === 'online').length;
            agentStats.working = allAgents.filter(a => a.status !== 'offline').length;
        }
    } catch (e) { }

    if (agentStats.working === 0) {
        try {
            const agentSearch: any = await client.request('/api/v2/search.json?query=type:user role:agent suspended:false');
            agentStats.working = agentSearch.count;
        } catch (e) { }
    }

    const now = new Date();
    const metrics: DashboardMetrics = {
        longestWait: { time: 0, ticketId: 0 }, longestHandle: { time: 0, ticketId: 0 },
        totalNew: 0, totalOpen: 0, breachedWaitCount: 0, breachedHandleCount: 0,
        agents: agentStats, groups: []
    };

    allTickets.forEach(t => {
        const gId = t.group_id || 0;
        if (!groupMap.has(gId)) return;

        const gMetric = groupMap.get(gId)!;
        const created = parseISO(t.created_at); const updated = parseISO(t.updated_at);
        const waitTime = differenceInMinutes(now, created); const handleTime = differenceInMinutes(now, updated);
        const isMessaging = CHANNELS.MESSAGING.includes(t.via.channel);

        if (t.status === 'new') {
            metrics.totalNew++;
            isMessaging ? gMetric.newMsg++ : gMetric.newEmail++;

            if (t.assignee_id === null) {
                if (waitTime > metrics.longestWait.time) metrics.longestWait = { time: waitTime, ticketId: t.id };
                if (isMessaging) { if (waitTime > gMetric.longestMsgWait) gMetric.longestMsgWait = waitTime; }
                else { if (waitTime > gMetric.longestEmailWait) gMetric.longestEmailWait = waitTime; }

                if (waitTime > THRESHOLDS.WAIT_TIME_BREACH) {
                    metrics.breachedWaitCount++;
                    gMetric.breachedWait++; // Track per group
                    gMetric.totalBreached++;
                }
            }
        }

        if (t.status === 'open') {
            metrics.totalOpen++;
            isMessaging ? gMetric.openMsg++ : gMetric.openEmail++;
            if (handleTime > metrics.longestHandle.time) metrics.longestHandle = { time: handleTime, ticketId: t.id };

            if (isMessaging) { if (handleTime > gMetric.longestMsgAHT) gMetric.longestMsgAHT = handleTime; }
            else { if (handleTime > gMetric.longestEmailAHT) gMetric.longestEmailAHT = handleTime; }

            if (handleTime > THRESHOLDS.HANDLE_TIME_BREACH) {
                metrics.breachedHandleCount++;
                gMetric.breachedAHT++; // Track per group
                gMetric.totalBreached++;
            }
        }

        if (t.status === 'pending') gMetric.pendingTickets++;
    });

    metrics.groups = Array.from(groupMap.values());
    return metrics;
};