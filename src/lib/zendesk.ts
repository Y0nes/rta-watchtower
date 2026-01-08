import { client } from '../zaf';
import { differenceInMinutes, parseISO } from 'date-fns';

// --- CONFIGURATION ---
const THRESHOLDS = {
    WAIT_TIME_BREACH: 30, // Minutes
    HANDLE_TIME_BREACH: 20 // Minutes
};

// Messaging Channels vs Email/Web Channels
const CHANNELS = {
    MESSAGING: ['native_messaging', 'chat', 'facebook', 'twitter', 'line', 'whatsapp', 'instagram_direct'],
    // Everything else falls into Email/Web usually
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
    working: number;
}

export interface GroupMetric {
    id: number;
    name: string;
    // Wait Times
    longestEmailWait: number;
    longestMsgWait: number;
    // Handle Times
    longestEmailAHT: number;
    longestMsgAHT: number;
    // Counts
    newTickets: number;     // New & Unassigned
    openTickets: number;    // Open (Assigned or Unassigned)
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

    // 1. Fetch ALL Groups first (to ensure static list)
    const groupsResponse: any = await client.request('/api/v2/groups.json?per_page=100');
    const groupMap = new Map<number, GroupMetric>();

    // Initialize every group with 0 data
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

    // 2. Fetch Tickets (Pagination Loop)
    let allTickets: Ticket[] = [];
    let url = '/api/v2/search.json?query=type:ticket status<solved sort:created_at_asc&per_page=100';
    let pages = 0;

    // Safety Cap: Fetch max 10 pages (1000 tickets) to prevent browser freeze. 
    // Increase 'pages < 10' if you have huge volume.
    while (url && pages < 10) {
        const response: any = await client.request(url);
        allTickets = [...allTickets, ...response.results];
        url = response.next_page; // Get next page URL
        pages++;
    }

    // 3. Fetch Agents
    let agentStats = { online: 0, working: 0 };
    try {
        const agentsResponse: any = await client.request('/api/v2/unified_agent_status');
        if (agentsResponse && agentsResponse.agent_statuses) {
            const allAgents = Object.values(agentsResponse.agent_statuses) as any[];
            agentStats.online = allAgents.filter(a => a.status === 'online').length;
            agentStats.working = allAgents.filter(a => a.status !== 'offline').length;
        }
    } catch (e) {
        console.warn("Agent API error (Ignore if you don't have Omni-channel):", e);
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
        groups: [] // Will be filled from map
    };

    allTickets.forEach(t => {
        // If ticket belongs to a deleted group, skip or add to "Unknown"
        const gId = t.group_id || 0;
        if (!groupMap.has(gId)) return;

        const gMetric = groupMap.get(gId)!;

        const created = parseISO(t.created_at);
        const updated = parseISO(t.updated_at);
        const waitTime = differenceInMinutes(now, created);
        const handleTime = differenceInMinutes(now, updated);
        const channel = t.via.channel;
        const isMessaging = CHANNELS.MESSAGING.includes(channel);

        // --- KPI 1: New & Unassigned ---
        if (t.status === 'new' && t.assignee_id === null) {
            metrics.newCount++;
            gMetric.newTickets++;

            // Wait Time Calculations
            if (waitTime > metrics.longestWait.time) metrics.longestWait = { time: waitTime, ticketId: t.id };

            if (isMessaging) {
                if (waitTime > gMetric.longestMsgWait) gMetric.longestMsgWait = waitTime;
            } else {
                if (waitTime > gMetric.longestEmailWait) gMetric.longestEmailWait = waitTime;
            }

            // Breach Check (Wait)
            if (waitTime > THRESHOLDS.WAIT_TIME_BREACH) {
                metrics.breachedWaitCount++;
                gMetric.breachedTickets++;
            }
        }

        // --- KPI 2: Open (Any Open ticket) ---
        if (t.status === 'open') {
            metrics.openCount++;
            gMetric.openTickets++;

            // Handle Time Calculations (Only if assigned usually, but checking all Open)
            if (handleTime > metrics.longestHandle.time) metrics.longestHandle = { time: handleTime, ticketId: t.id };

            if (isMessaging) {
                if (handleTime > gMetric.longestMsgAHT) gMetric.longestMsgAHT = handleTime;
            } else {
                if (handleTime > gMetric.longestEmailAHT) gMetric.longestEmailAHT = handleTime;
            }

            // Breach Check (Handle)
            if (handleTime > THRESHOLDS.HANDLE_TIME_BREACH) {
                metrics.breachedHandleCount++;
                gMetric.breachedTickets++;
            }
        }

        // --- KPI 3: Pending ---
        if (t.status === 'pending') {
            metrics.pendingCount++;
            gMetric.pendingTickets++;
        }
    });

    // Convert Map back to Array
    metrics.groups = Array.from(groupMap.values());
    return metrics;
};