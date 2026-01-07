import { useEffect, useState } from 'react';
import { RefreshCw, Clock, AlertCircle, CheckCircle, Users } from 'lucide-react';
import { fetchTicketData, DashboardMetrics } from '../lib/zendesk';
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
    const [data, setData] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const metrics = await fetchTicketData();
            setData(metrics);
            setLastUpdated(new Date());
        } catch (error) {
            console.error("Failed to load dashboard:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // Auto-refresh every 60 seconds
        const interval = setInterval(loadData, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) return <div className="h-screen flex items-center justify-center text-blue-600">Loading Watchtower...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">RTA Queue Monitor</h1>
                    {lastUpdated && (
                        <p className="text-sm text-gray-500 mt-1">
                            Last updated: {format(lastUpdated, 'h:mm:ss a')}
                        </p>
                    )}
                </div>
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                    title="Longest Wait"
                    value={`${data?.longestWait.time} min`}
                    subtext="Status: New"
                    alert={true}
                    icon={Clock}
                />
                <StatCard
                    title="Longest AHT"
                    value={`${data?.longestHandle.time} min`}
                    subtext="Status: Open"
                    icon={Clock}
                />
                <StatCard
                    title="New Tickets"
                    value={data?.newCount}
                    subtext="Total in queue"
                    icon={AlertCircle}
                />
                <StatCard
                    title="Open Tickets"
                    value={data?.openCount}
                    subtext="In progress"
                    icon={CheckCircle}
                />
            </div>

            {/* Breach Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <StatCard
                    title="Breached Wait Time"
                    value={data?.breachedWaitCount}
                    subtext="Tickets waiting > 30m"
                    alert={data?.breachedWaitCount! > 0}
                />
                <StatCard
                    title="Breached Handle Time"
                    value={data?.breachedHandleCount}
                    subtext="Tickets open > 20m"
                    alert={data?.breachedHandleCount! > 0}
                />
            </div>

            {/* Groups Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="font-semibold text-gray-900">Groups by Longest Wait Time</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">Group Name</th>
                                <th className="px-6 py-3">Longest Wait</th>
                                <th className="px-6 py-3">Longest AHT</th>
                                <th className="px-6 py-3">New</th>
                                <th className="px-6 py-3">Open</th>
                                <th className="px-6 py-3">Breached</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data?.groups.map((group) => (
                                <tr key={group.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-medium text-gray-900">{group.name}</td>
                                    <td className="px-6 py-3 text-red-600 font-bold">{group.longestWait} min</td>
                                    <td className="px-6 py-3 text-gray-600">{group.longestAHT} min</td>
                                    <td className="px-6 py-3">{group.newTickets}</td>
                                    <td className="px-6 py-3">{group.openTickets}</td>
                                    <td className="px-6 py-3">
                                        {group.breachedTickets > 0 ? (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                {group.breachedTickets}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {data?.groups.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                        No active tickets found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};