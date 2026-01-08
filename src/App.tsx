import { useEffect, useState } from 'react';
import { openModal } from './zaf';
import { DashboardPage } from './components/DashboardPage';
import { LayoutDashboard, Loader2 } from 'lucide-react';

const SmallWidget = () => (
    <div className="p-4 flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center w-full">
            <div className="bg-blue-100 p-3 rounded-full inline-flex mb-4">
                <LayoutDashboard className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Watchtower</h2>
            <p className="text-sm text-gray-500 mb-6">Real-Time Monitor</p>
            <button onClick={openModal} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg">
                Open Dashboard
            </button>
        </div>
    </div>
);

export default function App() {
    const [isModal, setIsModal] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'modal') setIsModal(true);
        setLoading(false);
    }, []);

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
    return isModal ? <DashboardPage /> : <SmallWidget />;
}