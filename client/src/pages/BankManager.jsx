import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api, { API_URL, SERVER_URL } from '../api';
import clsx from 'clsx';
import {
    Plus, Edit2, Trash2, FileCheck, Building2, X, AlertCircle, Tag,
    Lock, KeyRound, ShieldAlert, ArrowRight, Layers, Download, Hash,
    Search, Loader2, CheckCircle2, UploadCloud, Check, FileText, Clock
} from 'lucide-react';

const formatTime = (seconds) => {
    if (seconds == null || isNaN(seconds) || seconds < 0) return '--';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
};

const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    if (bytes < k * k) {
        return `${(bytes / k).toFixed(1)} KB`;
    }
    return `${(bytes / (k * k)).toFixed(2)} MB`;
};

const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec === 0) return '--';
    const k = 1024;
    if (bytesPerSec < k * k) {
        return `${(bytesPerSec / k).toFixed(0)} KB/s`;
    }
    return `${(bytesPerSec / (k * k)).toFixed(1)} MB/s`;
};

const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64Data = reader.result.split(',')[1];
            resolve(`DATA:${file.name}:${base64Data}`);
        };
        reader.onerror = (error) => reject(error);
    });
};

const handleDownloadTemplate = (e, bank) => {
    if (!bank || !bank.template_path) return;
    if (bank.template_path.startsWith('DATA:')) {
        e.preventDefault();
        try {
            const parts = bank.template_path.slice(5).split(':');
            const originalName = parts.length > 1 ? parts[0] : `${bank.name}_Template.docx`;
            const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];

            const byteCharacters = atob(base64Str);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

            const safeName = bank.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            const downloadFilename = originalName.endsWith('.docx') ? originalName : `${safeName}_Template.docx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error decoding Base64 template download:', err);
            alert('Failed to download template file');
        }
    }
};

export default function BankManager() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        return sessionStorage.getItem('bank_manager_auth') === 'true';
    });
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    const [banks, setBanks] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBank, setEditingBank] = useState(null);
    const [formData, setFormData] = useState({ name: '', template: null, excel_template: null, bill_split: 'bank', starting_invoice_no: '' });
    const [pricingBank, setPricingBank] = useState(null);

    // Form submission, upload progress & telemetry states
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [submitStatus, setSubmitStatus] = useState('idle'); // 'idle' | 'uploading' | 'success' | 'error'
    const [errorMessage, setErrorMessage] = useState('');
    const [successToast, setSuccessToast] = useState(null); // { title: string, message: string }
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [uploadStats, setUploadStats] = useState({
        percent: 0,
        loaded: 0,
        total: 0,
        speed: 0,
        estimated: null
    });

    // Real-time elapsed timer while submitting
    useEffect(() => {
        let timer = null;
        if (isSubmitting) {
            setElapsedSeconds(0);
            timer = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        } else {
            clearInterval(timer);
        }
        return () => clearInterval(timer);
    }, [isSubmitting]);

    const handleAuthSubmit = (e) => {
        e.preventDefault();
        if (passwordInput === 'admin123') {
            sessionStorage.setItem('bank_manager_auth', 'true');
            setIsAuthenticated(true);
            setAuthError('');
            setPasswordInput('');
        } else {
            setAuthError('Incorrect password. Please enter the correct admin password.');
        }
    };

    const handleLock = () => {
        sessionStorage.removeItem('bank_manager_auth');
        setIsAuthenticated(false);
        setPasswordInput('');
        setAuthError('');
    };

    const handlePricingEdit = (bank) => {
        setPricingBank(bank);
    };

    const fetchBanks = async () => {
        try {
            const res = await api.get('/banks');
            setBanks(res.data || []);
        } catch (err) {
            console.error('Failed to fetch banks:', err);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchBanks();
        }
    }, [isAuthenticated]);

    const handleOpenModal = (bank = null) => {
        setIsSubmitting(false);
        setUploadProgress(0);
        setSubmitStatus('idle');
        setErrorMessage('');
        setElapsedSeconds(0);
        setUploadStats({ percent: 0, loaded: 0, total: 0, speed: 0, estimated: null });

        if (bank) {
            setEditingBank(bank);
            setFormData({
                name: bank.name,
                template: null,
                excel_template: null,
                bill_split: bank.bill_split || 'bank',
                starting_invoice_no: bank.starting_invoice_no || ''
            });
        } else {
            setEditingBank(null);
            setFormData({ name: '', template: null, excel_template: null, bill_split: 'bank', starting_invoice_no: '' });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setSubmitStatus('uploading');
        setUploadProgress(0);
        setErrorMessage('');
        setElapsedSeconds(0);
        setUploadStats({ percent: 0, loaded: 0, total: 0, speed: 0, estimated: null });

        const data = new FormData();
        data.append('name', formData.name);
        data.append('bill_split', formData.bill_split || 'bank');
        data.append('starting_invoice_no', formData.starting_invoice_no || '');
        if (formData.template) data.append('template', formData.template);
        if (formData.excel_template) data.append('excel_template', formData.excel_template);

        const startTime = Date.now();
        let lastLoaded = 0;
        let lastTime = Date.now();

        const config = {
            onUploadProgress: (progressEvent) => {
                const loaded = progressEvent.loaded || 0;
                const total = progressEvent.total || 0;
                const now = Date.now();
                const percent = total > 0 ? Math.round((loaded * 100) / total) : 0;

                // Calculate instantaneous upload speed
                let speed = progressEvent.rate || 0;
                if (!speed) {
                    const timeDelta = (now - lastTime) / 1000;
                    if (timeDelta > 0.2) {
                        speed = (loaded - lastLoaded) / timeDelta;
                        lastLoaded = loaded;
                        lastTime = now;
                    } else {
                        const totalElapsed = (now - startTime) / 1000;
                        if (totalElapsed > 0.2) speed = loaded / totalElapsed;
                    }
                }

                // Estimated time remaining (ETA)
                let estimated = progressEvent.estimated || null;
                if (!estimated && speed > 0 && total > loaded) {
                    estimated = Math.max(1, Math.ceil((total - loaded) / speed));
                }

                const currentPercent = percent >= 100 ? 100 : percent;
                setUploadStats({
                    percent: currentPercent,
                    loaded,
                    total,
                    speed,
                    estimated
                });
                setUploadProgress(currentPercent);
            }
        };

        try {
            if (editingBank) {
                await api.put(`/banks/${editingBank.id}`, data, config);
            } else {
                await api.post('/banks', data, config);
            }

            setUploadProgress(100);
            setUploadStats(prev => ({ ...prev, percent: 100, loaded: prev.total || prev.loaded, estimated: 0 }));
            setSubmitStatus('success');

            const bankName = formData.name.trim();
            const isEdit = !!editingBank;

            await fetchBanks();

            setTimeout(() => {
                setIsModalOpen(false);
                setEditingBank(null);
                setFormData({ name: '', template: null, excel_template: null, bill_split: 'bank', starting_invoice_no: '' });
                setIsSubmitting(false);
                setSubmitStatus('idle');
                setUploadProgress(0);
                setElapsedSeconds(0);

                setSuccessToast({
                    title: isEdit ? 'Bank Institution Updated' : 'Bank Institution Created',
                    message: `"${bankName}" and associated templates were ${isEdit ? 'updated' : 'successfully created and uploaded'}.`
                });
                setTimeout(() => setSuccessToast(null), 5000);
            }, 750);
        } catch (err) {
            console.error('Error saving bank:', err);
            setIsSubmitting(false);
            setSubmitStatus('error');
            setErrorMessage(err.response?.data?.error || err.message || 'Failed to save bank institution. Please try again.');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure? This will delete all pricing configuration and bank settings.')) return;
        try {
            await api.delete(`/banks/${id}`);
            fetchBanks();
        } catch (err) {
            console.error('Delete error:', err);
            alert(`Failed to delete bank: ${err.response?.data?.error || err.message}`);
        }
    };

    const getInitials = (name) => {
        if (!name) return 'BK';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    };

    const filteredBanks = banks.filter(bank => 
        bank.name?.toLowerCase().includes(searchQuery.toLowerCase().trim())
    );

    // Render Password Gate if not authenticated
    if (!isAuthenticated) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center p-3 sm:p-4 animate-fade-in">
                <div className="bg-white p-6 sm:p-8 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200/80 text-center animate-slide-up relative overflow-hidden">
                    <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-300/50 shadow-inner">
                        <Lock size={30} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">Restricted Access</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto mb-6">
                        Bank Manager contains sensitive template and pricing configurations. Enter the admin password to proceed.
                    </p>

                    {authError && (
                        <div className="mb-4 bg-red-50 text-red-700 text-xs font-semibold p-3 rounded-2xl border border-red-200 flex items-center gap-2 text-left">
                            <ShieldAlert size={16} className="flex-shrink-0 text-red-600" />
                            <span>{authError}</span>
                        </div>
                    )}

                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                        <div className="relative">
                            <input
                                type="password"
                                required
                                autoFocus
                                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium pl-10"
                                placeholder="Enter admin password..."
                                value={passwordInput}
                                onChange={e => setPasswordInput(e.target.value)}
                            />
                            <KeyRound size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-5 py-3 rounded-2xl shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 text-xs transition-all duration-200 hover:scale-[1.01] min-h-[44px]"
                        >
                            Unlock Bank Manager <ArrowRight size={16} />
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 sm:space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Bank Manager</h2>
                        <span className="bg-slate-200/80 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                            {banks.length} {banks.length === 1 ? 'Bank' : 'Banks'}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Configure financial institutions, DOCX templates, bill looping structure, and service pricing</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                        onClick={handleLock}
                        className="flex-1 sm:flex-initial bg-slate-100 hover:bg-slate-200 text-slate-600 px-3.5 py-2.5 rounded-2xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-200 min-h-[40px]"
                        title="Lock Access"
                    >
                        <Lock size={15} /> Lock Access
                    </button>
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex-1 sm:flex-initial bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 px-4 sm:px-5 py-2.5 rounded-2xl shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 font-bold text-xs transition-all duration-200 hover:scale-[1.02] min-h-[40px]"
                    >
                        <Plus size={16} /> Add Bank Institution
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search banks by name..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-xs"
                />
            </div>

            {/* Mobile Bank Cards (< sm) */}
            <div className="block sm:hidden space-y-3.5">
                {filteredBanks.map((bank) => (
                    <div key={bank.id} className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900 border border-amber-300/50 font-extrabold text-xs flex items-center justify-center shadow-inner flex-shrink-0">
                                    {getInitials(bank.name)}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-bold text-slate-900 text-sm truncate">{bank.name}</h4>
                                    <p className="text-[10px] text-slate-400 font-mono">ID: bank_{bank.id}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleOpenModal(bank)}
                                    className="p-2 text-slate-400 hover:text-amber-600 rounded-xl hover:bg-amber-50"
                                    title="Edit Bank"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(bank.id)}
                                    className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50"
                                    title="Delete Bank"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {bank.template_path ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <FileCheck size={11} /> DOCX Active
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                    <AlertCircle size={11} /> No Template
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                <Layers size={10} /> {bank.bill_split === 'branch' ? 'Branch Looping' : 'Bank Flat Table'}
                            </span>
                            {bank.starting_invoice_no && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    <Hash size={10} /> Start: {bank.starting_invoice_no}
                                </span>
                            )}
                            {bank.excel_template_path && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                    <FileCheck size={10} /> Excel Active
                                </span>
                            )}
                        </div>

                        {/* Pricing summary */}
                        <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Service Pricing</span>
                                <button
                                    onClick={() => handlePricingEdit(bank)}
                                    className="text-amber-700 hover:text-amber-800 text-[11px] font-bold flex items-center gap-1"
                                >
                                    <Tag size={11} /> Manage ({bank.pricing?.length || 0})
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {bank.pricing && bank.pricing.length > 0 ? (
                                    bank.pricing.slice(0, 3).map((p, idx) => (
                                        <span key={idx} className="bg-white text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-slate-200">
                                            {p.category}: <strong className="text-amber-700">₹{p.price}</strong>
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-slate-400 text-[11px] italic">No price rules set yet</span>
                                )}
                            </div>
                        </div>

                        {/* Downloads */}
                        {(bank.template_path || bank.excel_template_path) && (
                            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                                {bank.template_path && (
                                    <a
                                        href={`${API_URL}/banks/${bank.id}/template`}
                                        download
                                        onClick={(e) => handleDownloadTemplate(e, bank)}
                                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200"
                                    >
                                        <Download size={12} /> Template DOCX
                                    </a>
                                )}
                                {bank.excel_template_path && (
                                    <a
                                        href={`${API_URL}/banks/${bank.id}/excel-template`}
                                        download
                                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200"
                                    >
                                        <Download size={12} /> Template Excel
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {filteredBanks.length === 0 && (
                    <div className="bg-white p-8 rounded-3xl text-center text-slate-400 border border-slate-200">
                        <Building2 size={32} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-xs text-slate-600">No banks found matching "{searchQuery}"</p>
                    </div>
                )}
            </div>

            {/* Desktop Table (>= sm) */}
            <div className="hidden sm:block bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[680px]">
                        <thead>
                            <tr className="bg-slate-50/80 text-slate-400 uppercase text-[11px] font-bold tracking-wider border-b border-slate-100">
                                <th className="px-6 py-4">Bank Name</th>
                                <th className="px-6 py-4">DOCX Template & Loop Structure</th>
                                <th className="px-6 py-4">Category Pricing Structure</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {filteredBanks.map((bank) => (
                                <tr key={bank.id} className="hover:bg-slate-50/60 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900 border border-amber-300/50 font-extrabold text-xs flex items-center justify-center shadow-inner flex-shrink-0">
                                                {getInitials(bank.name)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900 text-sm">{bank.name}</div>
                                                <div className="text-[11px] text-slate-400 font-mono">ID: bank_{bank.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1.5 items-start">
                                            {bank.template_path ? (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                                        <FileCheck size={13} /> Active (.docx)
                                                    </span>
                                                    <a
                                                        href={`${API_URL}/banks/${bank.id}/template`}
                                                        download
                                                        onClick={(e) => handleDownloadTemplate(e, bank)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300/80 transition-colors shadow-xs"
                                                        title={`Download template for ${bank.name}`}
                                                    >
                                                        <Download size={12} /> Download
                                                    </a>
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200/80">
                                                    <AlertCircle size={13} /> Missing Template
                                                </span>
                                            )}
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={clsx(
                                                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold border",
                                                    bank.bill_split === 'branch'
                                                        ? "bg-amber-50 text-amber-800 border-amber-300"
                                                        : "bg-slate-100 text-slate-600 border-slate-200"
                                                )}>
                                                    <Layers size={11} /> {bank.bill_split === 'branch' ? 'Branch-wise Looping' : 'Bank-wise Flat Table'}
                                                </span>
                                                {bank.starting_invoice_no && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200" title="Configured Starting Invoice Number">
                                                        <Hash size={11} /> Invoice Start: {bank.starting_invoice_no}
                                                    </span>
                                                )}
                                                {bank.excel_template_path && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300" title="Excel (.xlsx) Bill Template Attached">
                                                        <FileCheck size={11} /> Excel Template
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {bank.pricing && bank.pricing.length > 0 ? (
                                                bank.pricing.slice(0, 3).map((p, idx) => (
                                                    <span key={idx} className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200/80">
                                                        {p.category}: <strong className="text-amber-700 font-bold">₹{p.price}</strong>
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-slate-400 text-xs italic">No price rules set</span>
                                            )}
                                            {bank.pricing && bank.pricing.length > 3 && (
                                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-xs font-medium border border-slate-200">
                                                    +{bank.pricing.length - 3} more
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            className="text-amber-600 text-xs font-bold hover:text-amber-700 flex items-center gap-1 mt-1.5 opacity-90 hover:underline cursor-pointer"
                                            onClick={() => handlePricingEdit(bank)}
                                        >
                                            <Tag size={12} /> Manage Pricing Rules
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {bank.template_path && (
                                                <a
                                                    href={`${API_URL}/banks/${bank.id}/template`}
                                                    download
                                                    onClick={(e) => handleDownloadTemplate(e, bank)}
                                                    className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                                                    title="Download DOCX Template"
                                                >
                                                    <Download size={16} />
                                                </a>
                                            )}
                                            {bank.excel_template_path && (
                                                <a
                                                    href={`${API_URL}/banks/${bank.id}/excel-template`}
                                                    download
                                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                                                    title="Download Excel Template (.xlsx)"
                                                >
                                                    <Download size={16} />
                                                </a>
                                            )}
                                            <button
                                                onClick={() => handleOpenModal(bank)}
                                                className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
                                                title="Edit Bank & Templates"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(bank.id)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                                                title="Delete Bank"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredBanks.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-6 py-16 text-center text-slate-400">
                                        <Building2 size={36} className="mx-auto mb-2 text-slate-300" />
                                        <p className="font-semibold text-slate-600">No Banks Found</p>
                                        <p className="text-xs text-slate-400 mt-1">Try modifying your search or click "Add Bank Institution" above.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add / Edit Bank Modal */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-3 sm:p-4 overflow-y-auto">
                    <div className="bg-white p-5 sm:p-7 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 transform transition-all animate-slide-up max-h-[92vh] flex flex-col my-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-shrink-0">
                            <div>
                                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                                    {editingBank ? 'Edit Bank Institution' : 'Add Bank Institution'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">Define institution name, template & bill split mode</p>
                            </div>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => !isSubmitting && setIsModalOpen(false)}
                                className={clsx(
                                    "w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center transition-colors flex-shrink-0",
                                    isSubmitting ? "opacity-30 cursor-not-allowed text-slate-300" : "hover:bg-slate-200 text-slate-500 cursor-pointer"
                                )}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4 pt-4 overflow-y-auto flex-1 pr-1">
                            {/* Inline Error Callout */}
                            {errorMessage && (
                                <div className="bg-rose-50 border border-rose-200/90 rounded-2xl p-3.5 flex items-start gap-2.5 text-rose-800 text-xs animate-fade-in">
                                    <AlertCircle size={17} className="text-rose-600 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold">Failed to Save Bank</p>
                                        <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed break-words">{errorMessage}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setErrorMessage('')}
                                        className="text-rose-400 hover:text-rose-700 p-0.5 rounded-md transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Bank Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    disabled={isSubmitting}
                                    className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    placeholder="e.g. ICICI KCC or State Bank of India"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            {/* Bill Split Mode Option */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Bill Looping & Split Mode
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => setFormData({ ...formData, bill_split: 'bank' })}
                                        className={clsx(
                                            "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between",
                                            isSubmitting ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                                            (formData.bill_split || 'bank') === 'bank'
                                                ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20 text-slate-900"
                                                : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 text-slate-600"
                                        )}
                                    >
                                        <div className="font-bold text-xs flex items-center gap-1.5 mb-1">
                                            <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", (formData.bill_split || 'bank') === 'bank' ? "bg-amber-500" : "bg-slate-300")} />
                                            Bank-wise
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-tight">
                                             Single table containing all records (<code className="text-amber-800 font-mono">{`{#opinions}`}</code>).
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => setFormData({ ...formData, bill_split: 'branch' })}
                                        className={clsx(
                                            "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between",
                                            isSubmitting ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                                            formData.bill_split === 'branch'
                                                ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20 text-slate-900"
                                                : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 text-slate-600"
                                        )}
                                    >
                                        <div className="font-bold text-xs flex items-center gap-1.5 mb-1">
                                            <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", formData.bill_split === 'branch' ? "bg-amber-500" : "bg-slate-300")} />
                                            Branch-wise
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-tight">
                                            Separate section per branch (<code className="text-amber-800 font-mono">{`{#branches}`}</code>).
                                        </p>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                    <span>Starting Invoice No</span>
                                    <span className="text-[10px] text-slate-400 font-normal lowercase">(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    disabled={isSubmitting}
                                    className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    placeholder="e.g. 101 or INV-ICICI-001"
                                    value={formData.starting_invoice_no || ''}
                                    onChange={e => setFormData({ ...formData, starting_invoice_no: e.target.value })}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Sets template tags like <code className="text-amber-800 font-mono">{`{INVOICE_NUMBER}`}</code> and <code className="text-amber-800 font-mono">{`{BILL_NO}`}</code>.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    DOCX Bill Template
                                </label>
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-3.5 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                    <input
                                        type="file"
                                        accept=".docx"
                                        disabled={isSubmitting}
                                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-100 file:text-amber-900 hover:file:bg-amber-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        onChange={e => setFormData({ ...formData, template: e.target.files[0] })}
                                    />
                                    {formData.template && (
                                        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-900 bg-amber-100/70 px-3 py-1.5 rounded-xl border border-amber-300/60 font-medium">
                                            <FileText size={13} className="text-amber-700 flex-shrink-0" />
                                            <span className="truncate max-w-[280px]">{formData.template.name}</span>
                                            <span className="text-[10px] text-amber-700 font-mono ml-auto">
                                                ({(formData.template.size / (1024 * 1024)).toFixed(2)} MB)
                                            </span>
                                        </div>
                                    )}
                                    {editingBank ? (
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60">
                                            <p className="text-[11px] text-slate-400">Leave empty to keep existing template</p>
                                            {editingBank.template_path && (
                                                <a
                                                    href={`${API_URL}/banks/${editingBank.id}/template`}
                                                    download
                                                    onClick={(e) => handleDownloadTemplate(e, editingBank)}
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline"
                                                >
                                                    <Download size={12} /> Download DOCX
                                                </a>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-slate-400 mt-1.5">Upload .docx template file containing replacement tags</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                    <span>Excel Bill Template (.xlsx)</span>
                                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Per-Bank Excel Output</span>
                                </label>
                                <div className="border-2 border-dashed border-emerald-200/80 rounded-2xl p-3.5 bg-emerald-50/30 hover:bg-emerald-50/60 transition-colors">
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        disabled={isSubmitting}
                                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-100 file:text-emerald-900 hover:file:bg-emerald-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        onChange={e => setFormData({ ...formData, excel_template: e.target.files[0] })}
                                    />
                                    {formData.excel_template && (
                                        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-900 bg-emerald-100/70 px-3 py-1.5 rounded-xl border border-emerald-300/60 font-medium">
                                            <FileText size={13} className="text-emerald-700 flex-shrink-0" />
                                            <span className="truncate max-w-[280px]">{formData.excel_template.name}</span>
                                            <span className="text-[10px] text-emerald-700 font-mono ml-auto">
                                                ({(formData.excel_template.size / (1024 * 1024)).toFixed(2)} MB)
                                            </span>
                                        </div>
                                    )}
                                    {editingBank ? (
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-emerald-200/60">
                                            <p className="text-[11px] text-slate-400">Leave empty to keep existing Excel template</p>
                                            {editingBank.excel_template_path && (
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={`${API_URL}/banks/${editingBank.id}/excel-template`}
                                                        download
                                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
                                                    >
                                                        <Download size={12} /> Download Excel
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (!confirm('Remove Excel template for this bank?')) return;
                                                            try {
                                                                await api.delete(`/banks/${editingBank.id}/excel-template`);
                                                                fetchBanks();
                                                                setEditingBank({ ...editingBank, excel_template_path: null });
                                                            } catch (e) { alert('Failed to delete Excel template'); }
                                                        }}
                                                        className="text-[10px] text-red-600 font-semibold hover:underline"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-slate-400 mt-1.5">Upload .xlsx template file with {'{{PLACEHOLDER}}'} tags for Excel bill generation</p>
                                    )}
                                </div>
                            </div>

                            {/* Real-time Telemetry & Upload Progress Card */}
                            {isSubmitting && (
                                <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xl transition-all animate-fade-in">
                                    {/* Header Row: Status Icon, Title & Live Percentage */}
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {submitStatus === 'success' ? (
                                                <span className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center flex-shrink-0 animate-bounce">
                                                    <Check size={14} className="stroke-[3]" />
                                                </span>
                                            ) : (
                                                <span className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center flex-shrink-0 animate-pulse">
                                                    <UploadCloud size={15} />
                                                </span>
                                            )}
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5 truncate">
                                                    {submitStatus === 'success' 
                                                        ? 'Upload Complete!' 
                                                        : (uploadStats.percent < 100 ? 'Uploading Files in Real-time' : 'Finalizing & Saving to DB...')}
                                                </h4>
                                                <p className="text-[11px] text-slate-400 truncate">
                                                    {submitStatus === 'success'
                                                        ? 'Institution & templates saved safely.'
                                                        : (uploadStats.percent < 100 ? 'Streaming document templates...' : 'Saving database records...')}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        {/* Real-time Percentage Badge */}
                                        <div className="text-right flex-shrink-0">
                                            <span className="font-mono font-black text-amber-400 text-lg leading-none">
                                                {uploadStats.percent}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Animated Progress Bar */}
                                    <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700/80 shadow-inner">
                                        <div
                                            className={clsx(
                                                "h-full rounded-full transition-all duration-200 ease-out",
                                                submitStatus === 'success'
                                                    ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm"
                                                    : "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 bg-[length:200%_100%] animate-pulse"
                                            )}
                                            style={{ width: `${uploadStats.percent}%` }}
                                        />
                                    </div>

                                    {/* Real-time Telemetry Metrics Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
                                        {/* Transferred Size */}
                                        <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/40">
                                            <span className="text-[10px] text-slate-400 block font-medium">Uploaded Data</span>
                                            <span className="font-mono font-bold text-slate-200 truncate block mt-0.5">
                                                {uploadStats.total > 0 
                                                    ? `${formatBytes(uploadStats.loaded)} / ${formatBytes(uploadStats.total)}`
                                                    : `${formatBytes(uploadStats.loaded)}`}
                                            </span>
                                        </div>

                                        {/* Upload Speed */}
                                        <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/40">
                                            <span className="text-[10px] text-slate-400 block font-medium">Upload Speed</span>
                                            <span className="font-mono font-bold text-amber-300 truncate block mt-0.5">
                                                {uploadStats.percent >= 100 ? 'Complete' : formatSpeed(uploadStats.speed)}
                                            </span>
                                        </div>

                                        {/* Elapsed Time */}
                                        <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/40">
                                            <span className="text-[10px] text-slate-400 block font-medium">Elapsed Time</span>
                                            <span className="font-mono font-bold text-slate-200 truncate block flex items-center gap-1 mt-0.5">
                                                <Clock size={11} className="text-slate-400 flex-shrink-0" />
                                                {formatTime(elapsedSeconds)}
                                            </span>
                                        </div>

                                        {/* Estimated Time Remaining */}
                                        <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/40">
                                            <span className="text-[10px] text-slate-400 block font-medium">Time Remaining</span>
                                            <span className="font-mono font-bold text-emerald-300 truncate block flex items-center gap-1 mt-0.5">
                                                {uploadStats.percent >= 100 ? (
                                                    <span className="text-emerald-400 font-semibold">Done</span>
                                                ) : (
                                                    <>
                                                        <Clock size={11} className="text-emerald-400 flex-shrink-0" />
                                                        {uploadStats.estimated ? `~${formatTime(uploadStats.estimated)}` : 'Calculating...'}
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Real-time Status Subtext */}
                                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                                            Active stream to server
                                        </span>
                                        <span>Please do not close dialog</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 flex-shrink-0">
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => setIsModalOpen(false)}
                                    className={clsx(
                                        "px-4 py-2.5 rounded-2xl font-semibold text-xs transition-colors",
                                        isSubmitting ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:bg-slate-100 cursor-pointer"
                                    )}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={clsx(
                                        "px-6 py-2.5 rounded-2xl font-bold text-xs shadow-md transition-all duration-200 flex items-center gap-2 select-none min-w-[140px] justify-center",
                                        isSubmitting
                                            ? "bg-amber-400 text-amber-950 cursor-not-allowed opacity-95 shadow-none ring-2 ring-amber-400/40"
                                            : "bg-amber-500 hover:bg-amber-600 text-slate-950 hover:shadow-lg cursor-pointer active:scale-95"
                                    )}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={15} className="animate-spin text-slate-950 flex-shrink-0" />
                                            <span className="truncate">
                                                {uploadStats.percent < 100
                                                    ? `Uploading ${uploadStats.percent}% ${uploadStats.estimated ? `(~${formatTime(uploadStats.estimated)})` : ''}`
                                                    : (submitStatus === 'success' ? 'Created!' : 'Finalizing...')}
                                            </span>
                                        </>
                                    ) : (
                                        <span>{editingBank ? 'Save Changes' : 'Create Bank'}</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Modern Floating Success Toast */}
            {successToast && createPortal(
                <div className="fixed bottom-6 right-6 z-[10000] animate-slide-up flex items-center gap-3.5 bg-slate-900/95 text-white px-5 py-4 rounded-2xl shadow-2xl border border-emerald-500/30 backdrop-blur-md max-w-md">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/40">
                        <CheckCircle2 size={22} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-100">{successToast.title}</p>
                        <p className="text-xs text-slate-300 mt-0.5 leading-relaxed break-words">{successToast.message}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSuccessToast(null)}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X size={15} />
                    </button>
                </div>,
                document.body
            )}

            {/* Pricing Rules Slide-over Modal */}
            <PricingModal
                bank={pricingBank}
                isOpen={!!pricingBank}
                onClose={() => setPricingBank(null)}
                onSave={fetchBanks}
            />
        </div>
    );
}

// ─────────────────────────────────────────────
// Subcomponent: Pricing Rules Slide-over Modal
// ─────────────────────────────────────────────
function PricingModal({ bank, isOpen, onClose, onSave }) {
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState('');
    const [columnKey, setColumnKey] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);
    const [localPricing, setLocalPricing] = useState(bank?.pricing || []);

    useEffect(() => {
        setLocalPricing(bank?.pricing || []);
    }, [bank]);

    if (!isOpen || !bank) return null;

    const handleSavePricing = async (e) => {
        e.preventDefault();
        if (!category.trim() || price === '') return;

        let success = false;
        try {
            if (editingCategory && editingCategory !== category.trim()) {
                await api.delete(`/banks/${bank.id}/pricing`, {
                    params: { category: editingCategory },
                    data: { category: editingCategory }
                });
            }

            await api.post(`/banks/${bank.id}/pricing`, {
                category: category.trim(),
                price: parseFloat(price),
                column_key: columnKey.trim() || undefined
            });
            success = true;
        } catch (err) {
            console.error('Error saving pricing entry:', err);
            alert(`Failed to save pricing entry: ${err.response?.data?.error || err.message}`);
            return;
        }

        if (success) {
            const updated = localPricing.filter(p => p.category !== editingCategory && p.category !== category.trim());
            updated.push({
                category: category.trim(),
                price: parseFloat(price),
                column_key: columnKey.trim() || undefined
            });
            setLocalPricing(updated);

            setCategory('');
            setPrice('');
            setColumnKey('');
            setEditingCategory(null);
            onSave();
        }
    };

    const handleEditItem = (item) => {
        setEditingCategory(item.category);
        setCategory(item.category);
        setPrice(item.price);
        setColumnKey(item.column_key || '');
    };

    const handleDeleteItem = async (categoryToDelete) => {
        if (!confirm(`Delete pricing for "${categoryToDelete}"?`)) return;
        let success = false;
        try {
            await api.delete(`/banks/${bank.id}/pricing`, {
                params: { category: categoryToDelete },
                data: { category: categoryToDelete }
            });
            success = true;
        } catch (err) {
            console.error('Error deleting pricing entry:', err);
            alert(`Failed to delete pricing entry: ${err.response?.data?.error || err.message}`);
            return;
        }

        if (success) {
            const updated = localPricing.filter(p => p.category !== categoryToDelete);
            setLocalPricing(updated);
            if (editingCategory === categoryToDelete) {
                setEditingCategory(null);
                setCategory('');
                setPrice('');
                setColumnKey('');
            }
            onSave();
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-end animate-fade-in">
            <div className="bg-white h-full w-full max-w-md shadow-2xl p-4 sm:p-7 flex flex-col justify-between overflow-y-auto animate-slide-up border-l border-slate-100">
                <div>
                    <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-5">
                        <div>
                            <div className="flex items-center gap-2">
                                <Tag className="text-amber-600" size={18} />
                                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Pricing Rules</h3>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">Bank: <strong className="text-slate-800">{bank.name}</strong></p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Existing Rules List */}
                    <div className="mb-6">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                            Configured Services ({localPricing.length})
                        </label>
                        <div className="space-y-2 max-h-64 sm:max-h-72 overflow-y-auto pr-1">
                            {localPricing && localPricing.length > 0 ? (
                                localPricing.map((p, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                                            editingCategory === p.category
                                                ? 'bg-amber-50 text-amber-900 border-amber-300 ring-2 ring-amber-500/20'
                                                : 'bg-slate-50 text-slate-800 border-slate-200/80 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="text-xs font-semibold">
                                            <span>{p.category}</span>
                                            {p.column_key && (
                                                <span className="ml-2 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                                                    {`{${p.column_key}}`}
                                                </span>
                                            )}
                                            <div className="text-amber-700 font-extrabold text-sm mt-0.5">₹{p.price}</div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handleEditItem(p)}
                                                className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg transition-colors cursor-pointer"
                                                title="Edit price"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteItem(p.category)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                                                title="Delete price entry"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-slate-400 text-xs italic py-4 text-center">No service pricing rules configured yet.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Form at bottom */}
                <form onSubmit={handleSavePricing} className="space-y-3 pt-4 border-t border-slate-100">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        {editingCategory ? `Editing "${editingCategory}"` : 'Add New Category Price'}
                    </label>

                    <div className="space-y-2">
                        <input
                            type="text"
                            placeholder="Category (e.g. sro ec, vetting report)"
                            className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            required
                        />
                        <input
                            type="text"
                            placeholder="Column Tag (e.g. SRO_EC, Opinion_Fees)"
                            className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            value={columnKey}
                            onChange={e => setColumnKey(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="Price in ₹"
                                className="flex-1 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                                required
                            />
                            <button
                                type="submit"
                                className="px-4 sm:px-5 py-2.5 rounded-2xl text-slate-950 font-bold text-xs bg-amber-500 hover:bg-amber-600 transition-all shadow-md flex-shrink-0 cursor-pointer"
                            >
                                {editingCategory ? 'Update' : 'Add Price'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
