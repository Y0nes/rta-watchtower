import { client } from '../zaf';
import { differenceInMinutes, parseISO } from 'date-fns';

// --- CONFIGURATION ---
const THRESHOLDS = {
    WAIT_TIME_BREACH: 30, // Minutes
    HANDLE_TIME_BREACH: 20 // Minutes
};

const CHANNELS = {
    MESSAGING: ['native_messaging', 'chat', 'facebook', 'twitter', 'line', 'whatsapp', 'instagram_direct'],
};

// --- TYPES ---
export interface Ticket {
    id: number;
    subject: string;
    status: string;
    assignee_id: number | null;
    group_id: number | null;
    created_at: string;
    updated_at: string;
    via: {
        channel: string;
    };
}

export interface AgentStatus {
    online: number;
    working: number; // Represents Total Active Agents if Status API fails
}

export interface GroupMetric {
    id: number;
    name: string;
    longestEmailWait: number;
    longestMsgWait: number;
    longestEmailAHT: number;
    longestMsgAHT: number;
    newTickets: number;
    openTickets: number;
    pendingTickets: number;
    breachedTickets: number;
}

export interface DashboardMetrics {
    longestWait: { time: number; ticketId: number };
    longestHandle: { time: number; ticketId: number };
    newCount: number;
    openCount: number;
    pendingCount: number;
    breachedWaitCount: number;
    breachedHandleCount: number;
    agents: AgentStatus;
    groups: GroupMetric[];
}

// --- API FETCH ---
export const fetchTicketData = async (): Promise<DashboardMetrics> => {
    if (!client) throw new Error("ZAF Client not initialized");

    // 1. Fetch ALL Groups
    const groupsResponse: any = await client.request('/api/v2/groups.json?per_page=100');
    const groupMap = new Map<number, GroupMetric>();

    groupsResponse.groups.forEach((g: any) => {
        groupMap.set(g.id, {
            id: g.id,
            name: g.name,
            longestEmailWait: 0,
            longestMsgWait: 0,
            longestEmailAHT: 0,
            longestMsgAHT: 0,
            newTickets: 0,
            openTickets: 0,
            pendingTickets: 0,
            breachedTickets: 0
        });
    });

    // 2. Fetch Tickets (Pagination Loop - Max 1000)
    let allTickets: Ticket[] = [];
    let url = '/api/v2/search.json?query=type:ticket status<solved sort:created_at_asc&per_page=100';
    let pages = 0;

    while (url && pages < 10) {
        const response: any = await client.request(url);
        allTickets = [...allTickets, ...response.results];
        url = response.next_page;
        pages++;
    }

    // 3. Fetch Agents (With Fallback)
    let agentStats = { online: 0, working: 0 };

    try {
        // Attempt A: Unified Status (Preferred for Online/Offline)
        const agentsResponse: any = await client.request('/api/v2/unified_agent_status');
        if (agentsResponse && agentsResponse.agent_statuses) {
            const allAgents = Object.values(agentsResponse.agent_statuses) as any[];
            agentStats.online = allAgents.filter(a => a.status === 'online').length;
            // "Working" here means logged in (not offline)
            agentStats.working = allAgents.filter(a => a.status !== 'offline').length;
        }
    } catch (e) {
        console.warn("Unified Status API failed, trying fallback...", e);
    }

    // Fallback: If "Working" is still 0 (API failed), fetch Total Active Agents via Search
    if (agentStats.working === 0) {
        try {
            // Search for all active agents/admins not suspended
            const agentSearch: any = await client.request('/api/v2/search.json?query=type:user role:agent role:admin suspended:false');
            agentStats.working = agentSearch.count; // This is "Total Staff"
            // "Online" will remain 0 as we can't guess it without the Status API
        } catch (err) {
            console.error("Agent fallback failed", err);
        }
    }

    // --- METRICS ENGINE ---
    const now = new Date();

    const metrics: DashboardMetrics = {
        longestWait: { time: 0, ticketId: 0 },
        longestHandle: { time: 0, ticketId: 0 },
        newCount: 0,
        openCount: 0,
        pendingCount: 0,
        breachedWaitCount: 0,
        breachedHandleCount: 0,
        agents: agentStats,
        groups: []
    };

    allTickets.forEach(t => {
        const gId = t.group_id || 0;
        if (!groupMap.has(gId)) return;

        const gMetric = groupMap.get(gId)!;
        const created = parseISO(t.created_at);
        const updated = parseISO(t.updated_at);
        const waitTime = differenceInMinutes(now, created);
        const handleTime = differenceInMinutes(now, updated);
        const channel = t.via.channel;
        const isMessaging = CHANNELS.MESSAGING.includes(channel);

        // KPI 1: New (All New tickets, regardless of assignment)
        if (t.status === 'new') {
            metrics.newCount++;
            gMetric.newTickets++; // User request: Count all new

            // Logic: Only calculate "Longest Wait" if Unassigned (Standard RTA rule)
            if (t.assignee_id === null) {
                if (waitTime > metrics.longestWait.time) metrics.longestWait = { time: waitTime, ticketId: t.id };

                if (isMessaging) {
                    if (waitTime > gMetric.longestMsgWait) gMetric.longestMsgWait = waitTime;
                } else {
                    if (waitTime > gMetric.longestEmailWait) gMetric.longestEmailWait = waitTime;
                }

                if (waitTime > THRESHOLDS.WAIT_TIME_BREACH) {
                    metrics.breachedWaitCount++;
                    gMetric.breachedTickets++;
                }
            }
        }

        // KPI 2: Open (All Open tickets)
        if (t.status === 'open') {
            metrics.openCount++;
            gMetric.openTickets++;

            if (handleTime > metrics.longestHandle.time) metrics.longestHandle = { time: handleTime, ticketId: t.id };

            if (isMessaging) {
                if (handleTime > gMetric.longestMsgAHT) gMetric.longestMsgAHT = handleTime;
            } else {
                if (handleTime > gMetric.longestEmailAHT) gMetric.longestEmailAHT = handleTime;
            }

            if (handleTime > THRESHOLDS.HANDLE_TIME_BREACH) {
                metrics.breachedHandleCount++;
                gMetric.breachedTickets++;
            }
        }

        if (t.status === 'pending') {
            metrics.pendingCount++;
            gMetric.pendingTickets++;
        }
    });

    metrics.groups = Array.from(groupMap.values());
    return metrics;
};