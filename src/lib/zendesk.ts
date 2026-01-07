import { client } from '../zaf';
import { differenceInMinutes, parseISO } from 'date-fns';

// --- CONFIGURATION ---
const THRESHOLDS = {
    WAIT_TIME_BREACH: 30, // Minutes (Customize this)
    HANDLE_TIME_BREACH: 20 // Minutes (Customize this)
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
}

export interface GroupMetric {
    id: number;
    name: string;
    longestWait: number; // Minutes
    longestAHT: number;  // Minutes
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
    groups: GroupMetric[];
}

// --- API FETCH ---
export const fetchTicketData = async (): Promise<DashboardMetrics> => {
    if (!client) throw new Error("ZAF Client not initialized");

    // 1. Fetch Groups (to map IDs to Names)
    const groupsResponse: any = await client.request('/api/v2/groups.json');
    // We strictly tell Map that it holds <ID, Name>
    const groupMap = new Map<number, string>(
        groupsResponse.groups.map((g: any) => [g.id, g.name])
    );

    // 2. Fetch Active Tickets (New, Open, Pending)
    // We use search to get everything in one go. Max 100 per page (we'll fetch 1 page for speed in V1)
    const searchResponse: any = await client.request('/api/v2/search.json?query=type:ticket status<solved sort:created_at_asc');
    const tickets: Ticket[] = searchResponse.results;

    // --- CALCULATION ENGINE ---
    const now = new Date();
    const metrics: DashboardMetrics = {
        longestWait: { time: 0, ticketId: 0 },
        longestHandle: { time: 0, ticketId: 0 },
        newCount: 0,
        openCount: 0,
        pendingCount: 0,
        breachedWaitCount: 0,
        breachedHandleCount: 0,
        groups: []
    };

    const groupData = new Map<number, GroupMetric>();

    tickets.forEach(t => {
        const created = parseISO(t.created_at);
        const updated = parseISO(t.updated_at); // Using updated_at as proxy for "Assignment/Last Action"
        const waitTime = differenceInMinutes(now, created);
        const handleTime = differenceInMinutes(now, updated);

        // Initialize Group Data if missing
        const gId = t.group_id || 0;
        if (!groupData.has(gId)) {
            groupData.set(gId, {
                id: gId,
                name: groupMap.get(gId) || "No Group",
                longestWait: 0,
                longestAHT: 0,
                newTickets: 0,
                openTickets: 0,
                pendingTickets: 0,
                breachedTickets: 0
            });
        }
        const gMetric = groupData.get(gId)!;

        // --- KPI 1: Longest Wait (Status = New & Unassigned) ---
        if (t.status === 'new' && t.assignee_id === null) {
            metrics.newCount++;
            gMetric.newTickets++;

            if (waitTime > metrics.longestWait.time) {
                metrics.longestWait = { time: waitTime, ticketId: t.id };
            }
            if (waitTime > gMetric.longestWait) {
                gMetric.longestWait = waitTime;
            }
        }

        // --- KPI 2: Longest Handle (Status = Open & Assigned) ---
        // User Requirement: "Assignee != 0" (Assigned)
        if (t.status === 'open') {
            metrics.openCount++; // User point 4: Countif(status = open)
            gMetric.openTickets++;

            if (t.assignee_id !== null) {
                if (handleTime > metrics.longestHandle.time) {
                    metrics.longestHandle = { time: handleTime, ticketId: t.id };
                }
                if (handleTime > gMetric.longestAHT) {
                    gMetric.longestAHT = handleTime;
                }
            }
        }

        // --- KPI: Pending ---
        if (t.status === 'pending') {
            metrics.pendingCount++;
            gMetric.pendingTickets++;
        }

        // --- KPI 5 & 6: Breaches ---
        // Wait Time Breach (Applies to New tickets)
        if (t.status === 'new' && waitTime > THRESHOLDS.WAIT_TIME_BREACH) {
            metrics.breachedWaitCount++;
            gMetric.breachedTickets++;
        }
        // Handle Time Breach (Applies to Open tickets)
        if (t.status === 'open' && handleTime > THRESHOLDS.HANDLE_TIME_BREACH) {
            metrics.breachedHandleCount++;
            gMetric.breachedTickets++;
        }
    });

    // Convert Map to Array for the Table
    metrics.groups = Array.from(groupData.values()).sort((a, b) => b.longestWait - a.longestWait);

    return metrics;
};