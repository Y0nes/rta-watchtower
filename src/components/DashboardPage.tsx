import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Clock, AlertCircle, CheckCircle, Filter, UserCheck, Users, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { fetchTicketData, DashboardMetrics, GroupMetric, THRESHOLDS } from '../lib/zendesk';
import { format } from 'date-fns';

// Enhanced StatCard with Dynamic Color Logic
const StatCard = ({ title, value, subtext, icon: Icon, type, threshold = 0 }: any) => {
    let colorClass = "text-gray-900";
    let iconColor = "text-gray-400";
    let bgClass = "bg-white border-gray-200";

    // Logic: 
    // 1. Time based: Green if low, Red if high
    // 2. Breach count: Green if 0, Red if > 0

    if (type === 'time') {
        const numValue = parseInt(value); // assume "45 min" string
        if (numValue > threshold) {
            colorClass = "text-red-600";
            iconColor = "text-red-500";
            bgClass = "bg-red-50 border-red-200";
        } else if (numValue > 0) {
            colorClass = "text-green-600";
            iconColor = "text-green-500";
            bgClass = "bg-green-50 border-green-200";
        }
    }
    else if (type === 'breach') {
        if (value > 0) {
            colorClass = "text-red-600";
            iconColor = "text-red-500";
            bgClass = "bg-red-50 border-red-200";
        } else {
            colorClass = "text-green-600";
            iconColor = "text-green-500";
            bgClass = "bg-green-50 border-green-200";
        }
    }

    return (
        <div className={`p-4 rounded-xl border ${bgClass} shadow-sm transition-colors`}>
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className={`w-4 h-4 ${iconColor}`} />}
                    <span className={`text-sm font-medium ${type === 'breach' || type === 'time' ? 'text-gray-600' : 'text-gray-500'}`}>{title}</span>
                </div>
            </div>
            <div className={`text-3xl font-bold mb-1 ${colorClass}`}>{value}</div>
            <div className="text-xs text-gray-400">{subtext}</div>
        </div>
    );
};

export const DashboardPage = () => {
    const [rawData, setRawData] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(() => {
        const saved = localStorage.getItem('rta_filter_groups');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filterSearch, setFilterSearch] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: keyof GroupMetric; direction: 'asc' | 'desc' } | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const metrics = await fetchTicketData();
            setRawData(metrics);
            if (localStorage.getItem('rta_filter_groups') === null && metrics.groups.length > 0) {
                setSelectedGroupIds(new Set(metrics.groups.map(g => g.id)));
            }
            setLastUpdated(new Date());
        } catch (error) { console.error("Load failed", error); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (rawData) localStorage.setItem('rta_filter_groups', JSON.stringify(Array.from(selectedGroupIds)));
    }, [selectedGroupIds, rawData]);

    // --- Dynamic Calculations based on Filter ---
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
            activeGroups = [...activeGroups].sort((a, b) => b.totalBreached - a.totalBreached || Math.max(b.longestEmailWait, b.longestMsgWait) - Math.max(a.longestEmailWait, a.longestMsgWait));
        }

        return {
            ...rawData,
            groups: activeGroups,
            // Recalculate Totals based on filtered groups
            totalNew: activeGroups.reduce((acc, g) => acc + g.newEmail + g.newMsg, 0),
            totalOpen: activeGroups.reduce((acc, g) => acc + g.openEmail + g.openMsg, 0),

            longestWait: { time: Math.max(...activeGroups.map(g => Math.max(g.longestEmailWait, g.longestMsgWait)), 0), ticketId: 0 },
            longestHandle: { time: Math.max(...activeGroups.map(g => Math.max(g.longestEmailAHT, g.longestMsgAHT)), 0), ticketId: 0 },

            // FIXED: Sum breaches from active groups
            breachedWaitCount: activeGroups.reduce((acc, g) => acc + g.breachedWait, 0),
            breachedHandleCount: activeGroups.reduce((acc, g) => acc + g.breachedAHT, 0),
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
                            <Filter className="w-4 h-4" /> Filter Groups ({selectedGroupIds.size})
                        </button>

                        {isFilterOpen && (
                            <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3">
                                <div className="relative mb-2">
                                    <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                                    <input type="text" placeholder="Search..." className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                </div>
                                <div className="flex justify-between items-center mb-2 px-1">
                                    <button onClick={toggleAll} className="text-xs font-bold text-blue-600 hover:text-blue-800">{selectedGroupIds.size === rawData?.groups.length ? 'Uncheck All' : 'Check All'}</button>
                                    <span className="text-xs text-gray-400">{filteredDropdownList?.length} groups</span>
                                </div>
                                <div className="max-h-80 overflow-y-auto space-y-1">
                                    {filteredDropdownList?.map(g => (
                                        <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                            <input type="checkbox" checked={selectedGroupIds.has(g.id)} onChange={() => toggleGroup(g.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                            <span className="text-sm text-gray-700 truncate">{g.name}</span>
                                        </label>
                                    ))}
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

            {/* CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                    title="Longest Wait"
                    value={`${processedData?.longestWait.time} min`}
                    subtext="New & Unassigned"
                    icon={Clock}
                    type="time"
                    threshold={THRESHOLDS.WAIT_TIME_BREACH}
                />
                <StatCard
                    title="Longest AHT"
                    value={`${processedData?.longestHandle.time} min`}
                    subtext="Max AHT (All)"
                    icon={Clock}
                    type="time"
                    threshold={THRESHOLDS.HANDLE_TIME_BREACH}
                />
                <StatCard title="New Tickets" value={processedData?.totalNew} subtext="Total New" icon={AlertCircle} />
                <StatCard title="Open Tickets" value={processedData?.totalOpen} subtext="Total Open" icon={CheckCircle} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <StatCard title="Agents Online" value={rawData?.agents.online} subtext="Status: Online" icon={UserCheck} />
                <StatCard title="Total Staff" value={rawData?.agents.working} subtext="Active / Working" icon={Users} />
                <StatCard
                    title="Wait Breach"
                    value={processedData?.breachedWaitCount}
                    subtext="> 30 mins"
                    type="breach"
                    threshold={0}
                />
                <StatCard
                    title="Handle Breach"
                    value={processedData?.breachedHandleCount}
                    subtext="> 20 mins"
                    type="breach"
                    threshold={0}
                />
            </div>

            {/* TABLE - Centered & Cleaned */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-500 font-medium cursor-pointer select-none">
                            <tr>
                                <th className="px-6 py-3 text-left" onClick={() => handleSort('name')}>Group <SortIcon column="name" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('longestEmailWait')}>Wait (Email) <SortIcon column="longestEmailWait" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('longestMsgWait')}>Wait (Msg) <SortIcon column="longestMsgWait" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('longestEmailAHT')}>AHT (Email) <SortIcon column="longestEmailAHT" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('longestMsgAHT')}>AHT (Msg) <SortIcon column="longestMsgAHT" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('newEmail')}>New (Email) <SortIcon column="newEmail" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('newMsg')}>New (Msg) <SortIcon column="newMsg" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('openEmail')}>Open (Email) <SortIcon column="openEmail" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('openMsg')}>Open (Msg) <SortIcon column="openMsg" /></th>
                                <th className="px-6 py-3" onClick={() => handleSort('totalBreached')}>Breach <SortIcon column="totalBreached" /></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {processedData?.groups.map((group) => (
                                <tr key={group.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-medium text-gray-900 text-left">{group.name}</td>

                                    <td className={`px-6 py-3 font-bold ${group.longestEmailWait > THRESHOLDS.WAIT_TIME_BREACH ? 'text-red-600' : 'text-gray-900'}`}>{group.longestEmailWait} m</td>
                                    <td className={`px-6 py-3 font-bold ${group.longestMsgWait > THRESHOLDS.WAIT_TIME_BREACH ? 'text-red-600' : 'text-gray-900'}`}>{group.longestMsgWait} m</td>

                                    <td className="px-6 py-3 text-gray-600">{group.longestEmailAHT > 0 ? `${group.longestEmailAHT} m` : '-'}</td>
                                    <td className="px-6 py-3 text-gray-600">{group.longestMsgAHT > 0 ? `${group.longestMsgAHT} m` : '-'}</td>

                                    <td className="px-6 py-3 font-medium">{group.newEmail}</td>
                                    <td className="px-6 py-3 font-medium">{group.newMsg}</td>

                                    <td className="px-6 py-3">{group.openEmail}</td>
                                    <td className="px-6 py-3">{group.openMsg}</td>

                                    <td className="px-6 py-3">
                                        {group.totalBreached > 0 ? <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">{group.totalBreached}</span> : <span className="text-gray-300">-</span>}
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