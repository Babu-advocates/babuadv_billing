import { useEffect, useState } from 'react';
import axios from 'axios';
import { Folder, FolderOpen, Search, Download, FileText, ChevronRight, HardDrive, RefreshCw, LayoutGrid, List, Home, ArrowLeft, Trash2, ShieldAlert, X, AlertCircle, KeyRound } from 'lucide-react';
import { supabase } from '../supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

const handleFileDownload = (e, file, type = 'docx') => {
    const rawUrl = type === 'pdf' ? file.pdfUrl : file.docxUrl;
    const dataStr = type === 'pdf' ? file.pdf_data : file.file_data;

    if (dataStr && dataStr.startsWith('DATA:')) {
        e.preventDefault();
        try {
            const parts = dataStr.slice(5).split(':');
            const originalName = parts.length > 1 ? parts[0] : file.name;
            const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];

            const byteCharacters = atob(base64Str);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const mimeType = type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            const blob = new Blob([byteArray], { type: mimeType });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return;
        } catch (err) {
            console.error('Error downloading file from Data URL:', err);
        }
    }

    if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        e.preventDefault();
        const fullUrl = rawUrl.startsWith('/') ? `${SERVER_URL}${rawUrl}` : `${SERVER_URL}/${rawUrl}`;
        window.open(fullUrl, '_blank');
    }
};

export default function FileLibrary() {
    const [library, setLibrary] = useState([]);
    const [stats, setStats] = useState({ totalBanks: 0, totalDocxFiles: 0 });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Google Drive style navigation state
    const [currentBank, setCurrentBank] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(null);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

    // Delete Modal State
    const [deletingFile, setDeletingFile] = useState(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteConfirm = async (e) => {
        e.preventDefault();
        setDeleteError('');

        if (!deletePassword) {
            setDeleteError('Please enter the admin password.');
            return;
        }

        if (deletePassword !== 'admin123') {
            setDeleteError('Incorrect password. Please enter the correct admin password.');
            return;
        }

        try {
            setIsDeleting(true);
            // 1. Call Backend Delete API
            await axios.delete(`${API_URL}/library/file`, {
                data: {
                    password: deletePassword,
                    filename: deletingFile.name,
                    bankFolderName: deletingFile.bankFolderName || currentBank?.folderName,
                    monthFolderName: deletingFile.monthFolderName || currentMonth?.folderName
                }
            });

            // 2. Supabase DB delete fallback
            try {
                await supabase.from('bills').delete().eq('filename', deletingFile.name);
            } catch (supaErr) {
                console.error("Supabase bill delete fallback error:", supaErr);
            }

            // Close modal & refresh drive files
            setDeletingFile(null);
            setDeletePassword('');
            fetchLibraryData();
        } catch (err) {
            console.error("Error deleting bill file:", err);
            setDeleteError(err.response?.data?.error || 'Failed to delete bill file. Please check password and server.');
        } finally {
            setIsDeleting(false);
        }
    };

    const fetchFromSupabase = async () => {
        try {
            const [{ data: banks, error: bErr }, { data: bills, error: biErr }] = await Promise.all([
                supabase.from('banks').select('id, name'),
                supabase.from('bills').select('*').order('created_at', { ascending: false })
            ]);

            if (bErr || biErr || !banks || !bills) return null;

            const bankMap = new Map();
            banks.forEach(b => bankMap.set(b.id, b.name));

            const bankGrouped = {};

            bills.forEach(bill => {
                const rawName = bankMap.get(bill.bank_id) || `Bank ${bill.bank_id}`;
                const bankName = rawName.replace(/_/g, ' ');
                const date = new Date(bill.created_at || Date.now());
                const year = date.getFullYear();
                const monthName = date.toLocaleString('default', { month: 'long' });
                const monthFolder = `${year}-${monthName}`;
                const monthLabel = `${monthName} ${year}`;

                if (!bankGrouped[bankName]) {
                    bankGrouped[bankName] = {};
                }
                if (!bankGrouped[bankName][monthFolder]) {
                    bankGrouped[bankName][monthFolder] = {
                        folderName: monthFolder,
                        label: monthLabel,
                        files: []
                    };
                }

                bankGrouped[bankName][monthFolder].files.push({
                    name: bill.filename,
                    docxUrl: bill.file_data || `/api/download/${bill.filename}`,
                    pdfUrl: bill.pdf_data || null,
                    hasPdf: !!bill.pdf_data,
                    sizeKB: 75,
                    createdAt: bill.created_at,
                    file_data: bill.file_data || null,
                    pdf_data: bill.pdf_data || null
                });
            });

            const libraryData = Object.keys(bankGrouped).map(bankName => {
                const monthsObj = bankGrouped[bankName];
                const months = Object.keys(monthsObj).map(mFolder => ({
                    folderName: mFolder,
                    label: monthsObj[mFolder].label,
                    count: monthsObj[mFolder].files.length,
                    files: monthsObj[mFolder].files
                })).sort((a, b) => b.folderName.localeCompare(a.folderName));

                return {
                    bankName: bankName,
                    folderName: bankName.replace(/[^a-zA-Z0-9]/g, '_'),
                    totalFiles: months.reduce((sum, m) => sum + m.count, 0),
                    months: months
                };
            }).sort((a, b) => a.bankName.localeCompare(b.bankName));

            return {
                totalBanks: libraryData.length,
                totalDocxFiles: libraryData.reduce((sum, b) => sum + b.totalFiles, 0),
                data: libraryData
            };
        } catch (err) {
            console.error("Error fetching library from Supabase:", err);
            return null;
        }
    };

    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            try {
                const res = await axios.get(`${API_URL}/library`);
                if (res.data && res.data.success && res.data.data && res.data.data.length > 0) {
                    if (isMounted) {
                        setLibrary(res.data.data || []);
                        setStats({
                            totalBanks: res.data.totalBanks || 0,
                            totalDocxFiles: res.data.totalDocxFiles || 0
                        });
                        setLoading(false);
                    }
                    return;
                }
            } catch {
                console.log("Local API server unreachable for library, querying Supabase directly...");
            }

            const supaRes = await fetchFromSupabase();
            if (isMounted && supaRes) {
                setLibrary(supaRes.data);
                setStats({
                    totalBanks: supaRes.totalBanks,
                    totalDocxFiles: supaRes.totalDocxFiles
                });
                setLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, [refreshKey]);

    // Navigate to Root
    const goToRoot = () => {
        setCurrentBank(null);
        setCurrentMonth(null);
    };

    // Navigate to Bank
    const selectBank = (bank) => {
        setCurrentBank(bank);
        setCurrentMonth(null);
    };

    // Navigate to Month
    const selectMonth = (month) => {
        setCurrentMonth(month);
    };

    // Global search matching across all banks, months, and files
    const searchResults = [];
    if (searchQuery.trim()) {
        library.forEach(bank => {
            bank.months.forEach(month => {
                month.files.forEach(file => {
                    if (
                        file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        bank.bankName.toLowerCase().includes(searchQuery.toLowerCase())
                    ) {
                        searchResults.push({
                            ...file,
                            bankName: bank.bankName,
                            monthLabel: month.label
                        });
                    }
                });
            });
        });
    }

    return (
        <div className="space-y-6 pb-10 max-w-6xl mx-auto">
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">File Drive</h2>
                        <span className="bg-amber-100 text-amber-900 border border-amber-300/60 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <HardDrive size={12} /> {stats.totalDocxFiles} Saved Bills
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Google Drive-style folder navigation for archived legal opinion bills</p>
                </div>

                <div className="flex items-center gap-2">
                    {/* View Switcher Toggle */}
                    <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                            title="Grid View"
                        >
                            <LayoutGrid size={15} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                            title="List View"
                        >
                            <List size={15} />
                        </button>
                    </div>

                    <button
                        onClick={() => { setLoading(true); setRefreshKey(k => k + 1); }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3.5 py-2 rounded-2xl text-xs transition-colors flex items-center gap-1.5 border border-slate-200"
                    >
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            {/* Google Drive Breadcrumb Navigation Bar */}
            <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2 overflow-x-auto text-slate-600">
                    <button
                        onClick={goToRoot}
                        className={`flex items-center gap-1.5 hover:text-amber-600 transition-colors ${
                            !currentBank ? 'text-amber-700 font-bold' : ''
                        }`}
                    >
                        <Home size={15} /> Drive Root
                    </button>

                    {currentBank && (
                        <>
                            <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                            <button
                                onClick={() => setCurrentMonth(null)}
                                className={`hover:text-amber-600 transition-colors whitespace-nowrap ${
                                    !currentMonth ? 'text-amber-700 font-bold' : ''
                                }`}
                            >
                                {currentBank.bankName}
                            </button>
                        </>
                    )}

                    {currentMonth && (
                        <>
                            <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                            <span className="text-amber-700 font-bold whitespace-nowrap">{currentMonth.label}</span>
                        </>
                    )}
                </div>

                {/* Back Button if inside folder */}
                {(currentBank || currentMonth) && (
                    <button
                        onClick={() => {
                            if (currentMonth) setCurrentMonth(null);
                            else setCurrentBank(null);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-900 font-semibold flex items-center gap-1 bg-slate-100 px-3 py-1 rounded-xl hover:bg-slate-200 transition-colors ml-2 flex-shrink-0"
                    >
                        <ArrowLeft size={13} /> Back
                    </button>
                )}
            </div>

            {/* Search Input */}
            <div className="relative">
                <Search size={17} className="absolute left-4 top-3.5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search files or banks in your drive..."
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200/80 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all shadow-xs"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Loading Indicator */}
            {loading ? (
                <div className="py-20 text-center flex flex-col items-center justify-center">
                    <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-600 text-xs font-semibold">Loading Drive Folders...</p>
                </div>
            ) : searchQuery.trim() ? (
                /* SEARCH RESULTS VIEW */
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="font-bold text-slate-900 text-sm">
                            Search Results for "{searchQuery}" ({searchResults.length} items found)
                        </h3>
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-xs text-amber-600 hover:underline font-semibold"
                        >
                            Clear search
                        </button>
                    </div>

                    {searchResults.length === 0 ? (
                        <p className="text-slate-400 text-xs py-8 text-center">No files found matching your search term.</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {searchResults.map((file, i) => (
                                <div key={i} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 p-3 rounded-2xl transition-colors">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="p-2.5 bg-amber-100 text-amber-900 rounded-xl border border-amber-200 flex-shrink-0">
                                            <FileText size={18} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-slate-800 text-xs truncate">{file.name}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                Location: <strong className="text-slate-600">{file.bankName}</strong> / {file.monthLabel} • {file.sizeKB} KB
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <a
                                            href={file.docxUrl ? (file.docxUrl.startsWith('http') || file.docxUrl.startsWith('DATA:') ? file.docxUrl : `${SERVER_URL}${file.docxUrl}`) : '#'}
                                            download
                                            onClick={(e) => handleFileDownload(e, file, 'docx')}
                                            className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            <Download size={12} /> .DOCX
                                        </a>
                                        {file.hasPdf && (
                                            <a
                                                href={file.pdfUrl ? (file.pdfUrl.startsWith('http') || file.pdfUrl.startsWith('DATA:') ? file.pdfUrl : `${SERVER_URL}${file.pdfUrl}`) : '#'}
                                                download
                                                onClick={(e) => handleFileDownload(e, file, 'pdf')}
                                                className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                            >
                                                <Download size={12} /> .PDF (Signed)
                                            </a>
                                        )}
                                        <button
                                            onClick={() => {
                                                setDeletingFile(file);
                                                setDeletePassword('');
                                                setDeleteError('');
                                            }}
                                            className="inline-flex items-center justify-center p-2 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-xs cursor-pointer"
                                            title="Delete Bill (Admin Password Required)"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : !currentBank ? (
                /* LEVEL 1: ROOT LEVEL - BANK FOLDERS */
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Bank Folders ({library.length})
                        </span>
                    </div>

                    {library.length === 0 ? (
                        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200/80">
                            <FolderOpen size={36} className="mx-auto mb-2 text-slate-300" />
                            <p className="font-bold text-slate-700 text-base">No Bank Folders Available</p>
                            <p className="text-xs text-slate-400 mt-1">Generated bills will automatically appear in their bank folders here.</p>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {library.map(bank => (
                                <div
                                    key={bank.folderName}
                                    onClick={() => selectBank(bank)}
                                    className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-amber-300 hover:scale-[1.01] transition-all cursor-pointer group flex flex-col justify-between"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 border border-amber-300/60 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-inner">
                                            <Folder size={24} className="fill-amber-400/50" />
                                        </div>
                                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                            {bank.totalFiles} {bank.totalFiles === 1 ? 'file' : 'files'}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 text-sm group-hover:text-amber-700 transition-colors truncate">
                                            {bank.bankName}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            {bank.months.length} {bank.months.length === 1 ? 'Month Folder' : 'Month Folders'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* List view for banks */
                        <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
                            {library.map(bank => (
                                <div
                                    key={bank.folderName}
                                    onClick={() => selectBank(bank)}
                                    className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3.5">
                                        <Folder size={22} className="text-amber-500 fill-amber-100" />
                                        <div>
                                            <p className="font-bold text-slate-900 text-sm">{bank.bankName}</p>
                                            <p className="text-xs text-slate-400">{bank.months.length} month subfolders</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-400 text-xs font-medium">
                                        <span>{bank.totalFiles} files</span>
                                        <ChevronRight size={16} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : !currentMonth ? (
                /* LEVEL 2: INSIDE BANK - MONTH FOLDERS */
                <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Folders inside {currentBank.bankName} ({currentBank.months.length})
                        </span>
                    </div>

                    {currentBank.months.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 text-slate-400">
                            No monthly subfolders inside this bank folder yet.
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {currentBank.months.map(month => (
                                <div
                                    key={month.folderName}
                                    onClick={() => selectMonth(month)}
                                    className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-amber-300 hover:scale-[1.01] transition-all cursor-pointer group flex items-center gap-4"
                                >
                                    <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors border border-amber-200">
                                        <Folder size={22} className="fill-amber-300/50" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <h4 className="font-bold text-slate-900 text-sm group-hover:text-amber-700 transition-colors truncate">
                                            {month.label}
                                        </h4>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            {month.files.length} {month.files.length === 1 ? 'file' : 'files'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
                            {currentBank.months.map(month => (
                                <div
                                    key={month.folderName}
                                    onClick={() => selectMonth(month)}
                                    className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Folder size={20} className="text-amber-500 fill-amber-100" />
                                        <span className="font-bold text-slate-900 text-sm">{month.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                        <span>{month.files.length} files</span>
                                        <ChevronRight size={16} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* LEVEL 3: INSIDE MONTH - FILES */
                <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Files in {currentBank.bankName} / {currentMonth.label} ({currentMonth.files.length})
                        </span>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-sm">
                        <div className="divide-y divide-slate-100">
                            {currentMonth.files.map((file, idx) => (
                                <div
                                    key={idx}
                                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                                >
                                    <div className="flex items-center gap-3.5 overflow-hidden">
                                        <div className="p-3 bg-amber-50 text-amber-800 rounded-2xl border border-amber-200 flex-shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-slate-900 text-xs truncate" title={file.name}>
                                                {file.name}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                Size: {file.sizeKB} KB • Created: {new Date(file.createdAt).toLocaleDateString()} {new Date(file.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                                        {file.docxUrl && (
                                            <a
                                                href={file.docxUrl.startsWith('http') || file.docxUrl.startsWith('DATA:') ? file.docxUrl : `${SERVER_URL}${file.docxUrl}`}
                                                download
                                                onClick={(e) => handleFileDownload(e, file, 'docx')}
                                                className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                                                title="Download Word Document (.docx)"
                                            >
                                                <Download size={13} /> .DOCX
                                            </a>
                                        )}
                                        {file.hasPdf && (
                                            <a
                                                href={file.pdfUrl ? (file.pdfUrl.startsWith('http') || file.pdfUrl.startsWith('DATA:') ? file.pdfUrl : `${SERVER_URL}${file.pdfUrl}`) : '#'}
                                                download
                                                onClick={(e) => handleFileDownload(e, file, 'pdf')}
                                                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                                                title="Download Signed PDF Document (.pdf)"
                                            >
                                                <Download size={13} /> .PDF (Signed)
                                            </a>
                                        )}
                                        {(file.xlsxUrl || (file.name && file.name.endsWith('.xlsx'))) && (
                                            <a
                                                href={file.xlsxUrl ? (file.xlsxUrl.startsWith('http') || file.xlsxUrl.startsWith('DATA:') ? file.xlsxUrl : `${SERVER_URL}${file.xlsxUrl}`) : (file.url ? `${SERVER_URL}${file.url}` : '#')}
                                                download
                                                onClick={(e) => handleFileDownload(e, file, 'xlsx')}
                                                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                                                title="Download Excel Document (.xlsx)"
                                            >
                                                <Download size={13} /> .XLSX
                                            </a>
                                        )}
                                        <button
                                            onClick={() => {
                                                setDeletingFile(file);
                                                setDeletePassword('');
                                                setDeleteError('');
                                            }}
                                            className="inline-flex items-center justify-center p-2.5 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-xs cursor-pointer"
                                            title="Delete Bill (Admin Password Required)"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL WITH ADMIN PASSWORD */}
            {deletingFile && (
                <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-slide-up">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl border border-rose-200">
                                    <ShieldAlert size={20} />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-slate-900 text-base">Delete Bill Confirmation</h3>
                                    <p className="text-xs text-slate-500 font-medium">Bank Manager admin password required</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setDeletingFile(null)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                            <p className="text-xs font-bold text-amber-900 truncate" title={deletingFile.name}>
                                {deletingFile.name}
                            </p>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                                This action will permanently delete the bill file from your system.
                            </p>
                        </div>

                        {deleteError && (
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                                <AlertCircle size={16} className="flex-shrink-0" />
                                <span>{deleteError}</span>
                            </div>
                        )}

                        <form onSubmit={handleDeleteConfirm} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <KeyRound size={13} className="text-slate-500" /> Admin Password
                                </label>
                                <input
                                    type="password"
                                    required
                                    autoFocus
                                    placeholder="Enter Bank Manager admin password..."
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setDeletingFile(null)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isDeleting}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md transition-all disabled:opacity-50"
                                >
                                    <Trash2 size={14} />
                                    {isDeleting ? 'Deleting...' : 'Confirm & Delete'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
