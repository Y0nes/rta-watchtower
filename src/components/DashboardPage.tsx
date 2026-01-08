import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Clock, AlertCircle, CheckCircle, Filter, UserCheck, Users } from 'lucide-react';
import { fetchTicketData, DashboardMetrics, GroupMetric } from '../lib/zendesk';
import { format } from 'date-fns';

// --- COMPONENTS ---

const StatCard = ({ title, value, subtext, alert = false, icon: Icon }: any) => (
    <div className={`p-4 rounded-xl border ${alert ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} shadow-sm`}>
        <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
                {Icon && <Icon className={`w-4 h-4 ${alert ? 'text-red-500' : 'text-gray-400'}`} />}
                <span className={`text-sm font-medium ${alert ? 'text-red-700' : 'text-gray-500'}`}>{title}</span>
            </div>
        </div>
        <div className={`text-3xl font-bold mb-1 ${alert ? 'text-red-700' : 'text-gray-900'}`}>{value}</div>
        <div className={`text-xs ${alert ? 'text-red-600' : 'text-gray-400'}`}>{subtext}</div>
    </div>
);

// --- MAIN PAGE ---

export const DashboardPage = () => {
    const [rawData, setRawData] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filter State
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // 1. Load Data
    const loadData = async () => {
        setLoading(true);
        try {
            const metrics = await fetchTicketData();
            setRawData(metrics);

            // If it's the first load, select ALL groups by default
            if (selectedGroupIds.size === 0 && metrics.groups.length > 0) {
                setSelectedGroupIds(new Set(metrics.groups.map(g => g.id)));
            }

            setLastUpdated(new Date());
        } catch (error) {
            console.error("Failed to load dashboard:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 60000);
        return () => clearInterval(interval);
    }, []);

    // 2. Filter Logic (Recalculate Totals based on selection)
    const filteredData = useMemo(() => {
        if (!rawData) return null;

        // Filter the groups array
        const activeGroups = rawData.groups.filter(g => selectedGroupIds.has(g.id));

        // Recalculate the "Big Numbers" based ONLY on active groups
        return {
            ...rawData,
            groups: activeGroups,
            newCount: activeGroups.reduce((acc, g) => acc + g.newTickets, 0),
            openCount: activeGroups.reduce((acc, g) => acc + g.openTickets, 0),
            // We take the worst (Max) wait time from the active groups
            longestWait: {
                time: Math.max(...activeGroups.map(g => g.longestWait), 0),
                ticketId: 0
            },
            // We take the worst (Max) handle time from active groups
            longestHandle: {
                time: Math.max(...activeGroups.map(g => Math.max(g.longestEmailAHT, g.longestMsgAHT)), 0),
                ticketId: 0
            },
            breachedWaitCount: activeGroups.reduce((acc, g) => g.breachedTickets, 0), // Simplified approximation
        };
    }, [rawData, selectedGroupIds]);

    // Toggle Handler
    const toggleGroup = (id: number) => {
        const newSet = new Set(selectedGroupIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedGroupIds(newSet);
    };

    const toggleAll = () => {
        if (!rawData) return;
        if (selectedGroupIds.size === rawData.groups.length) {
            setSelectedGroupIds(new Set()); // Deselect All
        } else {
            setSelectedGroupIds(new Set(rawData.groups.map(g => g.id))); // Select All
        }
    };

    if (loading && !rawData) return <div className="h-screen flex items-center justify-center text-blue-600">Loading Watchtower...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            {/* Header & Controls */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">RTA Queue Monitor</h1>
                    {lastUpdated && <p className="text-xs text-gray-500 mt-1">Updated: {format(lastUpdated, 'h:mm:ss a')}</p>}
                </div>

                <div className="flex gap-3">
                    {/* Filter Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                        >
                            <Filter className="w-4 h-4" />
                            Filter Groups ({selectedGroupIds.size})
                        </button>

                        {isFilterOpen && (
                            <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-2">
                                <div className="max-h-60 overflow-y-auto space-y-1">
                                    <button
                                        onClick={toggleAll}
                                        className="w-full text-left px-2 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded"
                                    >
                                        {selectedGroupIds.size === rawData?.groups.length ? 'Uncheck All' : 'Check All'}
                                    </button>
                                    <hr className="my-1" />
                                    {rawData?.groups.map(g => (
                                        <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedGroupIds.has(g.id)}
                                                onChange={() => toggleGroup(g.id)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700 truncate">{g.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Backdrop to close filter */}
                        {isFilterOpen && <div className="fixed inset-0 z-40" onClick={() => setIsFilterOpen(false)} />}
                    </div>

                    <button
                        onClick={loadData}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* 1. Main KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                    title="Longest Wait"
                    value={`${filteredData?.longestWait.time} min`}
                    subtext="Status: New (Unassigned)"
                    alert={true}
                    icon={Clock}
                />
                <StatCard
                    title="Longest AHT"
                    value={`${filteredData?.longestHandle.time} min`}
                    subtext="Max of Msg/Email"
                    icon={Clock}
                />
                <StatCard
                    title="New Tickets"
                    value={filteredData?.newCount}
                    subtext="Total Queue"
                    icon={AlertCircle}
                />
                <StatCard
                    title="Open Tickets"
                    value={filteredData?.openCount}
                    subtext="Total Workload"
                    icon={CheckCircle}
                />
            </div>

            {/* 2. Secondary Row: Agents & Breaches (Request #4) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <StatCard
                    title="Agents Online"
                    value={rawData?.agents.online}
                    subtext="Unified Status"
                    icon={UserCheck}
                />
                <StatCard
                    title="Active Staff"
                    value={rawData?.agents.working}
                    subtext="Online + Away"
                    icon={Users}
                />
                {/* We combined breaches into the table, but if you want cards, here they are: */}
                <StatCard
                    title="Wait Breach"
                    value={filteredData?.breachedWaitCount}
                    subtext="> 30 mins"
                    alert={filteredData?.breachedWaitCount! > 0}
                />
                <StatCard
                    title="Handle Breach"
                    value={filteredData?.breachedHandleCount}
                    subtext="> 20 mins"
                    alert={filteredData?.breachedHandleCount! > 0}
                />
            </div>

            {/* 3. Detailed Table (Request #3) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between">
                    <h3 className="font-semibold text-gray-900">Group Performance</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">Group</th>
                                <th className="px-6 py-3">Wait Time</th>
                                <th className="px-6 py-3">Msg AHT</th>
                                <th className="px-6 py-3">Email AHT</th>
                                <th className="px-6 py-3">New (All)</th>
                                <th className="px-6 py-3">Open (All)</th>
                                <th className="px-6 py-3 text-right">Breached</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredData?.groups.map((group) => (
                                <tr key={group.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-medium text-gray-900">{group.name}</td>

                                    {/* Wait Time */}
                                    <td className={`px-6 py-3 font-bold ${group.longestWait > 30 ? 'text-red-600' : 'text-gray-900'}`}>
                                        {group.longestWait} m
                                    </td>

                                    {/* Messaging AHT */}
                                    <td className="px-6 py-3 text-gray-600">
                                        {group.longestMsgAHT > 0 ? `${group.longestMsgAHT} m` : '-'}
                                    </td>

                                    {/* Email AHT */}
                                    <td className="px-6 py-3 text-gray-600">
                                        {group.longestEmailAHT > 0 ? `${group.longestEmailAHT} m` : '-'}
                                    </td>

                                    <td className="px-6 py-3">{group.newTickets}</td>
                                    <td className="px-6 py-3">{group.openTickets}</td>

                                    <td className="px-6 py-3 text-right">
                                        {group.breachedTickets > 0 ? (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                {group.breachedTickets}
                                            </span>
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};