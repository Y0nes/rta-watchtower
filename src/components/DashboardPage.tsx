import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Clock, AlertCircle, CheckCircle, Filter, UserCheck, Users, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { fetchTicketData, DashboardMetrics, GroupMetric } from '../lib/zendesk';
import { format } from 'date-fns';

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

export const DashboardPage = () => {
    const [rawData, setRawData] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filter State (Initialize from LocalStorage)
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(() => {
        const saved = localStorage.getItem('rta_filter_groups');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filterSearch, setFilterSearch] = useState(""); // New: Search Term

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: keyof GroupMetric; direction: 'asc' | 'desc' } | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const metrics = await fetchTicketData();
            setRawData(metrics);

            // FIXED: Only auto-select ALL if the user has NEVER saved a preference.
            // We check if localStorage is null, not just if the set is empty (user might have deliberately cleared it)
            if (localStorage.getItem('rta_filter_groups') === null && metrics.groups.length > 0) {
                const allIds = new Set(metrics.groups.map(g => g.id));
                setSelectedGroupIds(allIds);
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

    // Persist Filter
    useEffect(() => {
        if (rawData) { // Only save if we actually have data, to prevent overwriting on load
            localStorage.setItem('rta_filter_groups', JSON.stringify(Array.from(selectedGroupIds)));
        }
    }, [selectedGroupIds, rawData]);

    // Calculations
    const processedData = useMemo(() => {
        if (!rawData) return null;
        let activeGroups = rawData.groups.filter(g => selectedGroupIds.has(g.id));

        if (sortConfig) {
            activeGroups = [...activeGroups].sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                if (typeof valA === 'string' && typeof valB === 'string') return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                return sortConfig.direction === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
            });
        } else {
            activeGroups = [...activeGroups].sort((a, b) => Math.max(b.longestEmailWait, b.longestMsgWait) - Math.max(a.longestEmailWait, a.longestMsgWait));
        }

        return {
            ...rawData,
            groups: activeGroups,
            newCount: activeGroups.reduce((acc, g) => acc + g.newTickets, 0),
            openCount: activeGroups.reduce((acc, g) => acc + g.openTickets, 0),
            longestWait: { time: Math.max(...activeGroups.map(g => Math.max(g.longestEmailWait, g.longestMsgWait)), 0), ticketId: 0 },
            longestHandle: { time: Math.max(...activeGroups.map(g => Math.max(g.longestEmailAHT, g.longestMsgAHT)), 0), ticketId: 0 },
            breachedWaitCount: activeGroups.reduce((acc, g) => acc + g.breachedTickets, 0),
            breachedHandleCount: 0 // Placeholder or sum if needed
        };
    }, [rawData, selectedGroupIds, sortConfig]);

    const handleSort = (key: keyof GroupMetric) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
        setSortConfig({ key, direction });
    };

    const toggleGroup = (id: number) => {
        const newSet = new Set(selectedGroupIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedGroupIds(newSet);
    };

    const toggleAll = () => {
        if (!rawData) return;
        if (selectedGroupIds.size === rawData.groups.length) setSelectedGroupIds(new Set());
        else setSelectedGroupIds(new Set(rawData.groups.map(g => g.id)));
    };

    const SortIcon = ({ column }: { column: keyof GroupMetric }) => {
        if (sortConfig?.key !== column) return <ArrowUpDown className="w-3 h-3 text-gray-300 ml-1 inline" />;
        return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 ml-1 inline" /> : <ArrowDown className="w-3 h-3 text-blue-600 ml-1 inline" />;
    };

    // Filter the list displayed in the dropdown
    const filteredDropdownList = rawData?.groups
        .filter(g => g.name.toLowerCase().includes(filterSearch.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (loading && !rawData) return <div className="h-screen flex items-center justify-center text-blue-600">Loading Watchtower...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">RTA Queue Monitor</h1>
                    {lastUpdated && <p className="text-xs text-gray-500 mt-1">Updated: {format(lastUpdated, 'h:mm:ss a')}</p>}
                </div>

                <div className="flex gap-3">
                    <div className="relative">
                        <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
                            <Filter className="w-4 h-4" /> Filter ({selectedGroupIds.size})
                        </button>

                        {isFilterOpen && (
                            <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3">
                                {/* New: Search Input */}
                                <div className="relative mb-2">
                                    <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search groups..."
                                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={filterSearch}
                                        onChange={(e) => setFilterSearch(e.target.value)}
                                    />
                                </div>

                                <div className="flex justify-between items-center mb-2 px-1">
                                    <button onClick={toggleAll} className="text-xs font-bold text-blue-600 hover:text-blue-800">
                                        {selectedGroupIds.size === rawData?.groups.length ? 'Uncheck All' : 'Check All'}
                                    </button>
                                    <span className="text-xs text-gray-400">{filteredDropdownList?.length} groups</span>
                                </div>

                                <div className="max-h-80 overflow-y-auto space-y-1">
                                    {filteredDropdownList?.map(g => (
                                        <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                            <input type="checkbox" checked={selectedGroupIds.has(g.id)} onChange={() => toggleGroup(g.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                            <span className="text-sm text-gray-700 truncate">{g.name}</span>
                                        </label>
                                    ))}
                                    {filteredDropdownList?.length === 0 && <div className="text-center text-gray-400 text-xs py-2">No groups found</div>}
                                </div>
                            </div>
                        )}
                        {isFilterOpen && <div className="fixed inset-0 z-40" onClick={() => setIsFilterOpen(false)} />}
                    </div>

                    <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard title="Longest Wait" value={`${processedData?.longestWait.time} min`} subtext="New & Unassigned" alert={true} icon={Clock} />
                <StatCard title="Longest AHT" value={`${processedData?.longestHandle.time} min`} subtext="Max AHT (All)" icon={Clock} />
                <StatCard title="New Tickets" value={processedData?.newCount} subtext="Total New" icon={AlertCircle} />
                <StatCard title="Open Tickets" value={processedData?.openCount} subtext="Total Open" icon={CheckCircle} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <StatCard title="Agents Online" value={rawData?.agents.online} subtext="Status: Online" icon={UserCheck} />
                <StatCard
                    title="Total Staff"
                    value={rawData?.agents.working}
                    subtext={rawData?.agents.online === 0 && rawData?.agents.working > 0 ? "Registered Agents" : "Active / Working"}
                    icon={Users}
                />
                <StatCard title="Wait Breach" value={processedData?.breachedWaitCount} subtext="> 30 mins" alert={processedData?.breachedWaitCount! > 0} />
                <StatCard title="Handle Breach" value={processedData?.breachedHandleCount} subtext="> 20 mins" alert={processedData?.breachedHandleCount! > 0} />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium cursor-pointer select-none">
                            <tr>
                                <th className="px-6 py-3" onClick={() => handleSort('name')}>Group <SortIcon column="name" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('longestEmailWait')}>Wait (Email) <SortIcon column="longestEmailWait" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('longestMsgWait')}>Wait (Msg) <SortIcon column="longestMsgWait" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('longestEmailAHT')}>AHT (Email) <SortIcon column="longestEmailAHT" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('longestMsgAHT')}>AHT (Msg) <SortIcon column="longestMsgAHT" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('newTickets')}>New <SortIcon column="newTickets" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('openTickets')}>Open <SortIcon column="openTickets" /></th>
                                <th className="px-6 py-3 text-right" onClick={() => handleSort('breachedTickets')}>Breach <SortIcon column="breachedTickets" /></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {processedData?.groups.map((group) => (
                                <tr key={group.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-medium text-gray-900">{group.name}</td>
                                    <td className={`px-6 py-3 font-bold ${group.longestEmailWait > 30 ? 'text-red-600' : 'text-gray-900'}`}>{group.longestEmailWait} m</td>
                                    <td className={`px-6 py-3 font-bold ${group.longestMsgWait > 30 ? 'text-red-600' : 'text-gray-900'}`}>{group.longestMsgWait} m</td>
                                    <td className="px-6 py-3 text-gray-600">{group.longestEmailAHT > 0 ? `${group.longestEmailAHT} m` : '-'}</td>
                                    <td className="px-6 py-3 text-gray-600">{group.longestMsgAHT > 0 ? `${group.longestMsgAHT} m` : '-'}</td>
                                    <td className="px-6 py-3">{group.newTickets}</td>
                                    <td className="px-6 py-3">{group.openTickets}</td>
                                    <td className="px-6 py-3 text-right">
                                        {group.breachedTickets > 0 ? <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">{group.breachedTickets}</span> : <span className="text-gray-300">-</span>}
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