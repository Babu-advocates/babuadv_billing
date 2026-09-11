import { useEffect, useState } from 'react';
import api, { API_URL, SERVER_URL } from '../api';
import { Building2, FileCheck, ArrowUpRight, Upload, CheckCircle2, TrendingUp, Download, FileText, Clock, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const [stats, setStats] = useState({ banks: 0, totalBills: 0, todayBills: 0 });
    const [recentBills, setRecentBills] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const getInitials = (name) => {
        if (!name) return 'BK';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const getDownloadUrl = (url) => {
        if (!url) return '#';
        if (url.startsWith('http')) return url;
        return `${SERVER_URL}${url}`;
    };

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            let banksCount = 0;
            let flatFilesList = [];

            // 1. Fetch Banks count
            try {
                const res = await api.get('/banks');
                if (res.data && Array.isArray(res.data)) {
                    banksCount = res.data.length;
                }
            } catch (e) {
                console.error('Error fetching banks count:', e);
            }

            // 2. Fetch File Library files for recent activity & counts
            try {
                const libRes = await api.get('/library');
                if (libRes.data && libRes.data.success && Array.isArray(libRes.data.data)) {
                    const libraryData = libRes.data.data;

                    libraryData.forEach(bank => {
                        if (bank.months && Array.isArray(bank.months)) {
                            bank.months.forEach(month => {
                                if (month.files && Array.isArray(month.files)) {
                                    month.files.forEach(file => {
                                        flatFilesList.push({
                                            ...file,
                                            bankName: bank.bankName,
                                            monthLabel: month.label
                                        });
                                    });
                                }
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('Error fetching library data:', e);
            }

            // Sort files newest first
            flatFilesList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

            // Count bills created today
            const today = new Date().toDateString();
            const todayCount = flatFilesList.filter(f => new Date(f.createdAt || 0).toDateString() === today).length;

            setStats({
                banks: banksCount,
                totalBills: flatFilesList.length,
                todayBills: todayCount
            });

            setRecentBills(flatFilesList.slice(0, 7));
            setIsLoading(false);
        };

        fetchDashboardData();
    }, []);

    const todayStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return (
        <div className="space-y-6 sm:space-y-8 pb-10 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Welcome back, Advocate • <span className="font-semibold text-slate-700">{todayStr}</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Link
                        to="/library"
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 sm:px-4 py-2.5 rounded-2xl border border-slate-200 text-xs transition-all min-h-[42px]"
                    >
                        <FileText size={15} /> File Library
                    </Link>
                    <Link
                        to="/billing"
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-4 sm:px-5 py-2.5 rounded-2xl shadow-lg shadow-amber-500/20 transition-all duration-200 hover:scale-[1.01] text-xs min-h-[42px]"
                    >
                        <Upload size={15} /> Start Billing Process
                    </Link>
                </div>
            </div>

            {/* 3 Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Active Banks Card */}
                <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 group relative overflow-hidden">
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-100 transition-colors border border-amber-100">
                            <Building2 size={22} />
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Active
                        </span>
                    </div>
                    <div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{stats.banks}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Registered Institutions</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span>Configured pricing & templates</span>
                        <Link to="/banks" className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-0.5">
                            Manage Banks <ArrowUpRight size={12} />
                        </Link>
                    </div>
                </div>

                {/* Total Bills Generated Card */}
                <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 group relative overflow-hidden">
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-100 transition-colors border border-blue-100">
                            <FileCheck size={22} />
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <Sparkles size={12} /> Total Records
                        </span>
                    </div>
                    <div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{stats.totalBills}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Generated Bill Documents</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span>Archived in File Library</span>
                        <Link to="/library" className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5">
                            View Archive <ArrowUpRight size={12} />
                        </Link>
                    </div>
                </div>

                {/* Today's Activity Card */}
                <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 group relative overflow-hidden sm:col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-100 transition-colors border border-emerald-100">
                            <TrendingUp size={22} />
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Today
                        </span>
                    </div>
                    <div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{stats.todayBills}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Invoices Created Today</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span>Ready for download & dispatch</span>
                        <Link to="/billing" className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-0.5">
                            New Batch <ArrowUpRight size={12} />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Recent Billing Activity Section */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Recent Billing Activity</h3>
                            <span className="bg-slate-100 text-slate-600 text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full">
                                {recentBills.length} Recent
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Overview of generated legal opinion bill documents</p>
                    </div>
                    <Link to="/library" className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 flex-shrink-0">
                        View All <ArrowUpRight size={14} />
                    </Link>
                </div>

                {isLoading ? (
                    <div className="py-16 text-center text-slate-400">
                        <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-xs font-medium">Loading recent billing activity...</p>
                    </div>
                ) : recentBills.length === 0 ? (
                    <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4 border border-amber-100 shadow-xs">
                            <FileCheck size={30} />
                        </div>
                        <h4 className="text-slate-900 font-bold text-base mb-1">No Recent Bills Found</h4>
                        <p className="text-slate-500 text-xs max-w-sm mx-auto mb-6">
                            Upload your client CSV/Excel file to automatically compute pricing, combine multi-property opinions, and export DOCX bills.
                        </p>
                        <Link
                            to="/billing"
                            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all"
                        >
                            <Upload size={14} /> Upload Billing File
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* Mobile Cards View (< sm) */}
                        <div className="block sm:hidden divide-y divide-slate-100">
                            {recentBills.map((bill, idx) => (
                                <div key={idx} className="p-4 space-y-3 hover:bg-slate-50/60 transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-8 h-8 rounded-xl bg-amber-100/80 text-amber-900 font-extrabold text-xs flex items-center justify-center border border-amber-200 flex-shrink-0">
                                                {getInitials(bill.bankName)}
                                            </div>
                                            <span className="font-bold text-slate-900 text-xs truncate">
                                                {bill.bankName}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                            {bill.sizeKB ? `${bill.sizeKB} KB` : ''}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100 font-mono break-all">
                                        <FileText size={14} className="text-amber-600 flex-shrink-0" />
                                        <span className="truncate">{bill.name}</span>
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                                        <div className="flex items-center gap-1">
                                            <Clock size={12} className="text-slate-400" />
                                            <span>{formatDate(bill.createdAt)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {bill.docxUrl && (
                                                <a
                                                    href={getDownloadUrl(bill.docxUrl)}
                                                    download
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200"
                                                >
                                                    <Download size={12} /> DOCX
                                                </a>
                                            )}
                                            {bill.hasPdf && bill.pdfUrl && (
                                                <a
                                                    href={getDownloadUrl(bill.pdfUrl)}
                                                    download
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200"
                                                >
                                                    <Download size={12} /> PDF
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View (>= sm) */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[620px]">
                                <thead>
                                    <tr className="bg-slate-50/80 text-slate-400 uppercase text-[11px] font-bold tracking-wider border-b border-slate-100">
                                        <th className="px-6 py-3.5">Bank Institution</th>
                                        <th className="px-6 py-3.5">Generated File Name</th>
                                        <th className="px-6 py-3.5">Date & Time</th>
                                        <th className="px-6 py-3.5">Size</th>
                                        <th className="px-6 py-3.5 text-right">Downloads</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {recentBills.map((bill, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-amber-100/80 text-amber-900 font-extrabold text-xs flex items-center justify-center border border-amber-200 flex-shrink-0">
                                                        {getInitials(bill.bankName)}
                                                    </div>
                                                    <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                                        {bill.bankName}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <FileText size={15} className="text-amber-600 flex-shrink-0" />
                                                    <span className="font-mono text-xs text-slate-800 font-medium truncate max-w-xs" title={bill.name}>
                                                        {bill.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                                                <div className="flex items-center gap-1">
                                                    <Clock size={13} className="text-slate-400" />
                                                    {formatDate(bill.createdAt)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-slate-400 font-medium">
                                                {bill.sizeKB ? `${bill.sizeKB} KB` : 'N/A'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {bill.docxUrl && (
                                                        <a
                                                            href={getDownloadUrl(bill.docxUrl)}
                                                            download
                                                            className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition-colors"
                                                            title="Download DOCX Bill"
                                                        >
                                                            <Download size={13} /> DOCX
                                                        </a>
                                                    )}
                                                    {bill.hasPdf && bill.pdfUrl && (
                                                        <a
                                                            href={getDownloadUrl(bill.pdfUrl)}
                                                            download
                                                            className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
                                                            title="Download Signed PDF Bill"
                                                        >
                                                            <Download size={13} /> PDF
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
