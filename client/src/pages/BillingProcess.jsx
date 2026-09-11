import { useState, useCallback } from 'react';
import api, { API_URL, SERVER_URL } from '../api';
import { useDropzone } from 'react-dropzone';
import { Link } from 'react-router-dom';
import { Upload, FileText, CheckCircle2, AlertCircle, Download, FileSpreadsheet, ArrowRight, RefreshCw, Sparkles, Building2 } from 'lucide-react';
import clsx from 'clsx';

export default function BillingProcess() {
    const [status, setStatus] = useState('idle'); // idle, processing, success, warning, error
    const [results, setResults] = useState(null);
    const [errors, setErrors] = useState([]);
    const [skippedSummary, setSkippedSummary] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);

    const onDrop = useCallback(async (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setSelectedFile(file);
        setStatus('processing');
        setErrors([]);
        setResults(null);
        setSkippedSummary(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post('/billing/generate', formData);
            if (res.data.success) {
                setResults(res.data.generatedFiles);
                setSkippedSummary(res.data.skippedSummary || null);
                setErrors(res.data.errors || []);
                setStatus(res.data.errors?.length > 0 ? 'warning' : 'success');
            } else {
                setErrors([res.data.error || 'Unknown error occurred during bill generation']);
                setStatus('error');
            }
        } catch (err) {
            console.error(err);
            if (err.code === 'ERR_NETWORK' || !err.response) {
                setErrors(['Backend API server was unreachable. Please verify network or server status and try again.']);
            } else {
                setErrors([err.response?.data?.error || err.message || 'Error processing request']);
            }
            setStatus('error');
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls']
        },
        maxFiles: 1,
        noClick: false
    });

    const resetProcess = () => {
        setStatus('idle');
        setResults(null);
        setErrors([]);
        setSkippedSummary(null);
        setSelectedFile(null);
    };

    const getDownloadUrl = (url, filenameFallback) => {
        if (!url) return filenameFallback ? `${API_URL}/download/${filenameFallback}` : '#';
        if (url.startsWith('http') || url.startsWith('DATA:')) return url;
        return `${SERVER_URL}${url}`;
    };

    return (
        <div className="space-y-6 sm:space-y-8 pb-10 max-w-5xl mx-auto">
            {/* Header */}
            <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Billing Process Engine</h2>
                <p className="text-xs text-slate-500 mt-1">Upload CSV or Excel data to compute pricing, merge multi-property rows, and generate DOCX bills</p>
            </div>

            {/* Stepper Header (Mobile Responsive) */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between px-3 sm:px-8 text-[11px] sm:text-xs font-semibold text-slate-500 overflow-x-auto gap-2">
                <div className={clsx("flex items-center gap-1.5 sm:gap-2 flex-shrink-0", status === 'idle' ? "text-amber-600 font-bold" : "text-slate-700")}>
                    <span className={clsx("w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px]", status === 'idle' ? "bg-amber-500 text-slate-950 font-extrabold" : "bg-slate-200 text-slate-700")}>1</span>
                    <span>Upload Data</span>
                </div>
                <ArrowRight size={13} className="text-slate-300 flex-shrink-0" />
                <div className={clsx("flex items-center gap-1.5 sm:gap-2 flex-shrink-0", status === 'processing' ? "text-amber-600 font-bold" : "text-slate-700")}>
                    <span className={clsx("w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px]", status === 'processing' ? "bg-amber-500 text-slate-950 font-extrabold" : "bg-slate-200 text-slate-700")}>2</span>
                    <span>Processing</span>
                </div>
                <ArrowRight size={13} className="text-slate-300 flex-shrink-0" />
                <div className={clsx("flex items-center gap-1.5 sm:gap-2 flex-shrink-0", (status === 'success' || status === 'warning') ? "text-emerald-600 font-bold" : "text-slate-700")}>
                    <span className={clsx("w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px]", (status === 'success' || status === 'warning') ? "bg-emerald-500 text-white font-extrabold" : "bg-slate-200 text-slate-700")}>3</span>
                    <span>Download</span>
                </div>
            </div>

            {/* Main Processing Box */}
            <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-xs border border-slate-200/80">
                {status === 'idle' && (
                    <div
                        {...getRootProps()}
                        className={clsx(
                            "border-2 border-dashed rounded-3xl p-6 sm:p-12 text-center cursor-pointer transition-all duration-300",
                            isDragActive
                                ? "border-amber-500 bg-amber-50/60 scale-[1.01]"
                                : "border-slate-200 hover:border-amber-400 hover:bg-slate-50/50"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-100 text-amber-700 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-inner">
                            <Upload size={32} className="stroke-[2.2]" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1">
                            {isDragActive ? "Drop spreadsheet here..." : "Drag & drop your billing file here"}
                        </h3>
                        <p className="text-slate-500 text-xs max-w-sm mx-auto mb-4 sm:mb-6">
                            Upload your batch CSV or Excel (.xlsx) file containing bank opinion entries.
                        </p>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); open(); }}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 sm:px-6 py-3 rounded-2xl shadow-md transition-all duration-200 hover:scale-[1.02] inline-flex items-center gap-2 min-h-[44px]"
                        >
                            <FileSpreadsheet size={15} /> Browse File from Device
                        </button>
                    </div>
                )}

                {status === 'processing' && (
                    <div className="py-12 sm:py-16 text-center space-y-4 animate-fade-in">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <div>
                            <h3 className="text-base sm:text-lg font-bold text-slate-900">Processing Billing Data</h3>
                            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                                Analyzing {selectedFile?.name}, calculating category fees, and rendering templates...
                            </p>
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {errors.length > 0 && (
                    <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1 animate-fade-in">
                        <div className="flex items-center gap-2 font-bold text-rose-900 text-sm mb-1">
                            <AlertCircle size={16} /> Notice / Errors During Processing:
                        </div>
                        {errors.map((err, i) => (
                            <p key={i} className="pl-6">• {err}</p>
                        ))}
                    </div>
                )}

                {/* Results Section */}
                {results && results.length > 0 && (
                    <div className="space-y-5 animate-slide-up">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                            <div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                                    <h3 className="font-bold text-base sm:text-lg text-slate-900">
                                        Batch Completed Successfully
                                    </h3>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Generated {results.length} bill document{results.length === 1 ? '' : 's'}
                                </p>
                            </div>
                            <button
                                onClick={resetProcess}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200 min-h-[38px]"
                            >
                                <RefreshCw size={13} /> Reset View
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3.5 sm:gap-4">
                            {results.map((file, i) => (
                                <div
                                    key={i}
                                    className="bg-slate-50 border border-slate-200/80 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:shadow-md transition-all duration-200 group"
                                >
                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors border border-amber-300/50">
                                            <FileText size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-900 text-xs sm:text-sm truncate" title={file.bank}>{file.bank}</p>
                                            <p className="text-[11px] sm:text-xs text-slate-500 truncate font-mono">{file.filename}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                                        {file.docxUrl && (
                                            <a
                                                href={getDownloadUrl(file.docxUrl)}
                                                download
                                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs min-h-[38px]"
                                                title="Download Word Document (.docx)"
                                            >
                                                <Download size={13} /> .DOCX
                                            </a>
                                        )}
                                        {file.pdfFilename && (
                                            <a
                                                href={getDownloadUrl(file.pdfUrl, file.pdfFilename)}
                                                download
                                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs min-h-[38px]"
                                                title="Download Signed PDF Document (.pdf)"
                                            >
                                                <Download size={13} /> .PDF (Signed)
                                            </a>
                                        )}
                                        {file.xlsxFilename && (
                                            <a
                                                href={getDownloadUrl(file.xlsxUrl, file.xlsxFilename)}
                                                download
                                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs min-h-[38px]"
                                                title="Download Excel Bill (.xlsx)"
                                            >
                                                <Download size={13} /> .XLSX
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty Results Fallback when status is finished but 0 bills generated */}
                {(status === 'success' || status === 'warning') && (!results || results.length === 0) && (
                    <div className="animate-fade-in py-6 sm:py-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 p-4 sm:p-6 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                            <Building2 size={24} />
                        </div>
                        <h4 className="font-bold text-slate-900 text-base mb-1">No Matching Registered Banks Found</h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
                            Bills could not be generated for the bank names in this file because they are not registered in the system. You can download the skipped summary report below, register missing banks in Bank Manager, or drop another file.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            {skippedSummary && (
                                <a
                                    href={getDownloadUrl(skippedSummary.url)}
                                    download
                                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs min-h-[40px]"
                                >
                                    <Download size={13} /> Download Skipped Summary CSV ({skippedSummary.count} {skippedSummary.count === 1 ? 'row' : 'rows'})
                                </a>
                            )}
                            <Link
                                to="/banks"
                                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-colors min-h-[40px]"
                            >
                                <Building2 size={13} /> Manage Banks in Bank Manager
                            </Link>
                        </div>
                    </div>
                )}

                {/* Persistent Dropzone at bottom after processing */}
                {status !== 'idle' && status !== 'processing' && (
                    <div className="pt-6 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
                            <Upload size={14} className="text-amber-600" /> Process Another Data File
                        </p>
                        <div
                            {...getRootProps()}
                            className={clsx(
                                "border-2 border-dashed rounded-2xl p-5 sm:p-6 text-center cursor-pointer transition-all duration-300",
                                isDragActive
                                    ? "border-amber-500 bg-amber-50/50 scale-[1.01]"
                                    : "border-slate-200 hover:border-amber-400 hover:bg-slate-50/60"
                            )}
                        >
                            <input {...getInputProps()} />
                            <p className="text-xs sm:text-sm font-bold text-slate-800">
                                {isDragActive ? "Drop file here..." : "Drag & drop another spreadsheet here, or tap to browse"}
                            </p>
                            <p className="text-slate-400 text-[10px] sm:text-[11px] mt-0.5">
                                Supports .xlsx, .xls, .csv
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
