import { useEffect, useState } from 'react';
import axios from 'axios';
import { Building2, FileCheck, ArrowUpRight, Upload, CheckCircle2, TrendingUp, Download, FileText, Clock, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            let banksCount = 0;
            let flatFilesList = [];

            // 1. Fetch Banks count
            try {
                const res = await axios.get(`${API_URL}/banks`);
                if (res.data && Array.isArray(res.data)) {
                    banksCount = res.data.length;
                }
            } catch {
                try {
                    const { data: supaBanks } = await supabase.from('banks').select('id');
                    if (supaBanks) banksCount = supaBanks.length;
                } catch (e) {
                    console.error("Supabase banks fallback query error:", e);
                }
            }

            // 2. Fetch File Library files for recent activity & counts
            try {
                const libRes = await axios.get(`${API_URL}/library`);
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
            } catch {
                // Fallback to Supabase bills table
                try {
                    const { data: supaBills } = await supabase
                        .from('bills')
                        .select('*, banks(name)')
                        .order('created_at', { ascending: false });

                    if (supaBills) {
                        flatFilesList = supaBills.map(b => ({
                            name: b.filename,
                            bankName: b.banks?.name || 'Bank Institution',
                            createdAt: b.created_at,
                            docxUrl: `${API_URL}/download/${b.filename}`,
                            hasPdf: false
                        }));
                    }
                } catch (supaErr) {
                    console.error("Supabase bills fallback query error:", supaErr);
                }
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
        <div className="space-y-8 pb-10 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h2>
                    <p className="text-xs text-slate-500 mt-1">Welcome back, Advocate • <span className="font-semibold text-slate-700">{todayStr}</span></p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        to="/library"
                        className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-2xl border border-slate-200 text-xs transition-all"
                    >
                        <FileText size={15} /> File Library
                    </Link>
                    <Link
                        to="/billing"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-5 py-2.5 rounded-2xl shadow-lg shadow-amber-500/20 transition-all duration-200 hover:scale-[1.01] text-xs"
                    >
                        <Upload size={15} /> Start Billing Process
                    </Link>
                </div>
            </div>

            {/* 3 Stat Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Active Banks Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-100 transition-colors border border-amber-100">
                            <Building2 size={22} />
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Active
                        </span>
                    </div>
                    <div>
                        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{stats.banks}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Registered Institutions</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span>Configured pricing & templates</span>
                        <Link to="/banks" className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-0.5">
                            Manage Banks <ArrowUpRight size={12} />
                        </Link>
                    </div>
                </div>

                {/* Total Generated Bills Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-100 transition-colors border border-emerald-100">
                            <FileCheck size={22} />
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <TrendingUp size={12} /> {stats.todayBills > 0 ? `+${stats.todayBills} Today` : 'Live System'}
                        </span>
                    </div>
                    <div>
                        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{stats.totalBills}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Total Generated Bills</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span>Archived in file library</span>
                        <Link to="/library" className="text-emerald-700 font-semibold flex items-center gap-0.5 hover:underline">
                            View Library <ArrowUpRight size={12} />
                        </Link>
                    </div>
                </div>

                {/* Quick Automation Banner */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-md relative overflow-hidden flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
                            <Sparkles size={20} />
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Batch Generator
                        </span>
                    </div>
                    <div>
                        <h4 className="text-base font-bold text-white tracking-tight">Legal Opinion Billing</h4>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            Drop CSV/Excel to auto-compute categories, merge branches, and generate DOCX & PDF bills.
                        </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-700/60">
                        <Link
                            to="/billing"
                            className="inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md"
                        >
                            <Upload size={14} /> Process Batch File
                        </Link>
                    </div>
                </div>
            </div>

            {/* Recent Billing Activity Section */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Recent Billing Activity</h3>
                            <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                                {recentBills.length} Recent Files
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Overview of generated legal opinion bill documents</p>
                    </div>
                    <Link to="/library" className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1">
                        View All Files <ArrowUpRight size={14} />
                    </Link>
                </div>

                {isLoading ? (
                    <div className="py-16 text-center text-slate-400">
                        <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-xs font-medium">Loading recent billing activity...</p>
                    </div>
                ) : recentBills.length === 0 ? (
                    <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4 border border-amber-100 shadow-sm">
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
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
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
                                                        href={bill.docxUrl.startsWith('http') ? bill.docxUrl : `${API_URL.replace('/api', '')}${bill.docxUrl}`}
                                                        download
                                                        className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition-colors"
                                                        title="Download DOCX Bill"
                                                    >
                                                        <Download size={13} /> DOCX
                                                    </a>
                                                )}
                                                {bill.hasPdf && bill.pdfUrl && (
                                                    <a
                                                        href={bill.pdfUrl.startsWith('http') ? bill.pdfUrl : `${API_URL.replace('/api', '')}${bill.pdfUrl}`}
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
                )}
            </div>
        </div>
    );
}

