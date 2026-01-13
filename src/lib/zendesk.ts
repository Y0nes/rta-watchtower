import { client } from '../zaf';
import { differenceInMinutes, parseISO } from 'date-fns';

export const THRESHOLDS = {
    WAIT_TIME_BREACH: 30,
    HANDLE_TIME_BREACH: 20
};

// Full Channel List
const CHANNELS = {
    MESSAGING: [
        'messaging', 'native_messaging', 'chat', 'facebook', 'facebook_messenger',
        'instagram_direct', 'line', 'whatsapp', 'twitter', 'twitter_dm',
        'sms', 'sunshine_conversations_api', 'any_channel'
    ]
};

export interface Ticket {
    id: number; subject: string; status: string; assignee_id: number | null; group_id: number | null;
    created_at: string; updated_at: string; via: { channel: string; };
}

export interface GroupMetric {
    id: number; name: string;
    longestEmailWait: number; longestMsgWait: number;
    longestEmailAHT: number; longestMsgAHT: number;
    newEmail: number; newMsg: number; openEmail: number; openMsg: number;
    pendingTickets: number;
    breachedWait: number; breachedAHT: number; totalBreached: number;
}

export interface DashboardMetrics {
    longestWait: { time: number; ticketId: number };
    longestHandle: { time: number; ticketId: number };
    totalNew: number; totalOpen: number;
    breachedWaitCount: number; breachedHandleCount: number;
    groups: GroupMetric[];
    isCapped: boolean;
}

export const fetchAllGroups = async () => {
    if (!client) return [];
    try {
        const response: any = await client.request('/api/v2/groups.json?per_page=100');
        return response.groups || [];
    } catch (e) { return []; }
};

export const fetchTicketData = async (targetGroupIds: number[] = []): Promise<DashboardMetrics> => {
    if (!client) throw new Error("ZAF Client not initialized");

    // 1. Setup Groups
    const allGroups = await fetchAllGroups();
    const groupMap = new Map<number, GroupMetric>();

    allGroups.forEach((g: any) => {
        if (targetGroupIds.length > 0 && !targetGroupIds.includes(g.id)) return;

        groupMap.set(g.id, {
            id: g.id, name: g.name,
            longestEmailWait: 0, longestMsgWait: 0, longestEmailAHT: 0, longestMsgAHT: 0,
            newEmail: 0, newMsg: 0, openEmail: 0, openMsg: 0,
            pendingTickets: 0, breachedWait: 0, breachedAHT: 0, totalBreached: 0
        });
    });

    // 2. Fetch Tickets
    let rawQuery = 'type:ticket status<pending';
    if (targetGroupIds.length > 0) {
        const groupString = targetGroupIds.map(id => `group_id:${id}`).join(' ');
        rawQuery += ` ${groupString}`;
    }
    rawQuery += ' sort:created_at_asc';

    let allTickets: Ticket[] = [];
    let url = `/api/v2/search.json?query=${encodeURIComponent(rawQuery)}&per_page=100`;
    let pages = 0;

    while (url && pages < 50) {
        try {
            const response: any = await client.request(url);
            allTickets = [...allTickets, ...response.results];
            url = response.next_page;
            pages++;
        } catch (e) { break; }
    }

    const isCapped = allTickets.length >= 1000;

    // 3. Calculate Metrics
    const now = new Date();
    const metrics: DashboardMetrics = {
        longestWait: { time: 0, ticketId: 0 }, longestHandle: { time: 0, ticketId: 0 },
        totalNew: 0, totalOpen: 0, breachedWaitCount: 0, breachedHandleCount: 0,
        groups: [],
        isCapped: isCapped
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
                    gMetric.breachedWait++;
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
                gMetric.breachedAHT++;
                gMetric.totalBreached++;
            }
        }
    });

    metrics.groups = Array.from(groupMap.values());
    return metrics;
};