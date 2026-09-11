import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, Scale, ShieldCheck, ChevronRight, PanelLeftClose, PanelLeft, FolderOpen, LogOut, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const navLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, badge: null },
    { href: '/banks', label: 'Bank Manager', icon: Building2, badge: null },
    { href: '/billing', label: 'Billing Process', icon: FileText, badge: 'Batch' },
    { href: '/library', label: 'File Library', icon: FolderOpen, badge: 'Archive' },
];

const SidebarContent = ({ isOpen, onToggle, isMobile, onCloseMobile }) => {
    const location = useLocation();
    const { logout, user } = useAuth();

    return (
        <div className="h-full flex flex-col justify-between select-none">
            {/* Top Section: Brand Header & Main Menu */}
            <div className="bg-white relative z-10 flex-shrink-0">
                {/* Brand Header */}
                <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="bg-amber-100 text-amber-900 border border-amber-300/50 p-2.5 rounded-xl shadow-xs flex items-center justify-center flex-shrink-0">
                            <Scale size={22} className="stroke-[2.2]" />
                        </div>
                        {(isOpen || isMobile) && (
                            <div className="animate-fade-in overflow-hidden whitespace-nowrap">
                                <h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight">Babu Advocate</h1>
                                <p className="text-[10px] text-amber-700 font-bold tracking-wide uppercase">Billing System</p>
                            </div>
                        )}
                    </div>
                    {/* Desktop Collapse Toggle */}
                    {!isMobile && isOpen && (
                        <button
                            onClick={onToggle}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors hidden md:block"
                            title="Collapse Menu"
                        >
                            <PanelLeftClose size={18} />
                        </button>
                    )}
                    {/* Mobile Close Button */}
                    {isMobile && (
                        <button
                            onClick={onCloseMobile}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors md:hidden"
                            title="Close Menu"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Navigation Links */}
                <nav className="p-3 space-y-1.5 mt-2">
                    {(isOpen || isMobile) && (
                        <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 animate-fade-in">
                            Main Menu
                        </p>
                    )}
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = location.pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                to={link.href}
                                onClick={isMobile ? onCloseMobile : undefined}
                                title={!isOpen && !isMobile ? link.label : undefined}
                                className={clsx(
                                    "relative flex items-center px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
                                    (isOpen || isMobile) ? "justify-between" : "justify-center",
                                    isActive
                                        ? "bg-amber-50 text-amber-900 border border-amber-300/80 font-bold shadow-xs"
                                        : "text-slate-700 hover:bg-slate-100/90 hover:text-slate-900 font-semibold"
                                )}
                            >
                                {isActive && (
                                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500 rounded-r-full shadow-xs" />
                                )}
                                <div className="flex items-center gap-3.5">
                                    <Icon size={20} className={clsx("transition-transform duration-200 flex-shrink-0", isActive ? "text-amber-600 scale-110" : "text-slate-500 group-hover:scale-105 group-hover:text-slate-800")} />
                                    {(isOpen || isMobile) && <span className="animate-fade-in whitespace-nowrap">{link.label}</span>}
                                </div>
                                {(isOpen || isMobile) && link.badge && (
                                    <span className={clsx(
                                        "text-[10px] font-bold px-2 py-0.5 rounded-md border animate-fade-in",
                                        isActive
                                            ? "bg-amber-200/70 text-amber-900 border-amber-300"
                                            : "bg-slate-100 text-slate-600 border-slate-200"
                                    )}>
                                        {link.badge}
                                    </span>
                                )}
                                {(isOpen || isMobile) && !link.badge && (
                                    <ChevronRight size={15} className={clsx("transition-transform opacity-0 group-hover:opacity-100", isActive ? "opacity-100 text-amber-600" : "text-slate-400")} />
                                )}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Lower Section: Background watermark image + Status + SignOut */}
            <div className="flex-1 relative overflow-hidden flex flex-col justify-end">
                <div
                    className="absolute inset-0 pointer-events-none z-0 opacity-[0.22] bg-cover bg-top bg-no-repeat transition-all duration-300"
                    style={{
                        backgroundImage: `url('/babu_advocate.jpg')`,
                        filter: 'contrast(1.05) brightness(1.05)'
                    }}
                />

                <div className="p-3 relative z-10 border-t border-slate-200/60 backdrop-blur-[2px] bg-white/70 space-y-2">
                    <div className={clsx("bg-white/80 border border-slate-200/80 rounded-xl p-3 flex items-center shadow-xs", (isOpen || isMobile) ? "justify-between" : "justify-center")}>
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex h-2.5 w-2.5 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </div>
                            {(isOpen || isMobile) && (
                                <div className="animate-fade-in whitespace-nowrap overflow-hidden">
                                    <p className="text-xs font-bold text-slate-800">System Ready</p>
                                    <p className="text-[10px] text-slate-500 font-medium">Automated DOCX Engine</p>
                                </div>
                            )}
                        </div>
                        {(isOpen || isMobile) && <ShieldCheck size={16} className="text-slate-400 flex-shrink-0" />}
                    </div>

                    <button
                        onClick={logout}
                        title="Sign Out"
                        className={clsx(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50/80 hover:bg-rose-100/90 border border-rose-200/80 transition-all shadow-xs group",
                            (isOpen || isMobile) ? "justify-start" : "justify-center"
                        )}
                    >
                        <LogOut size={16} className="text-rose-600 group-hover:scale-110 transition-transform flex-shrink-0" />
                        {(isOpen || isMobile) && <span className="truncate">Sign Out ({user?.email?.split('@')[0] || 'User'})</span>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function Layout({ children }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user, logout } = useAuth();
    const location = useLocation();

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // Prevent body scroll when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMobileMenuOpen]);

    return (
        <div className="flex bg-[#F8FAFC] min-h-screen font-sans text-slate-900 antialiased">
            {/* Desktop Sidebar */}
            <aside
                className={clsx(
                    "hidden md:flex relative bg-white min-h-screen flex-col justify-between border-r border-slate-200/80 shadow-xs z-30 select-none transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
                    isSidebarOpen ? "w-72" : "w-20"
                )}
            >
                <SidebarContent
                    isOpen={isSidebarOpen}
                    onToggle={() => setIsSidebarOpen(prev => !prev)}
                    isMobile={false}
                />
            </aside>

            {/* Mobile Drawer Backdrop */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 md:hidden transition-opacity duration-300"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Mobile Drawer Sidebar */}
            <div
                className={clsx(
                    "fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white z-50 shadow-2xl md:hidden transform transition-transform duration-300 ease-in-out",
                    isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <SidebarContent
                    isOpen={true}
                    isMobile={true}
                    onCloseMobile={() => setIsMobileMenuOpen(false)}
                />
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Topbar */}
                <header className="h-16 bg-white border-b border-slate-200/80 px-3 sm:px-6 flex items-center justify-between shadow-xs sticky top-0 z-30">
                    <div className="flex items-center gap-2 sm:gap-3 text-xs font-medium text-slate-500 min-w-0">
                        {/* Mobile Hamburger Button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(prev => !prev)}
                            className="p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors md:hidden border border-slate-200 flex-shrink-0"
                            aria-label="Toggle navigation menu"
                        >
                            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>

                        {/* Desktop Collapse Button */}
                        <button
                            onClick={() => setIsSidebarOpen(prev => !prev)}
                            className="hidden md:flex p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors items-center gap-2 font-semibold text-xs border border-slate-200/80 shadow-xs flex-shrink-0"
                            title={isSidebarOpen ? "Collapse Menu" : "Expand Menu"}
                        >
                            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
                            <span>{isSidebarOpen ? "Hide Menu" : "Show Menu"}</span>
                        </button>

                        <span className="hidden sm:inline text-slate-300">|</span>
                        <span className="truncate text-xs sm:text-sm font-semibold text-slate-800">
                            Babu Advocate Billing
                        </span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                        <img
                            src="/babu_advocate.jpg"
                            alt="Advocate Babu"
                            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover border-2 border-amber-400/80 shadow-xs flex-shrink-0"
                        />
                        <div className="text-left hidden sm:block">
                            <p className="text-xs font-bold text-slate-900 leading-tight">Advocate Babu</p>
                            <p className="text-[10px] text-slate-500 font-medium truncate max-w-[130px] lg:max-w-[180px]" title={user?.email}>
                                {user?.email || 'Madurai Jurisdiction'}
                            </p>
                        </div>
                        <button
                            onClick={logout}
                            title="Sign Out"
                            className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-slate-200"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </header>

                {/* Main View Area */}
                <main className="flex-1 p-3.5 sm:p-6 md:p-8 overflow-y-auto pb-20 md:pb-8">
                    <div className="max-w-7xl mx-auto animate-slide-up">
                        {children}
                    </div>
                </main>

                {/* Mobile Bottom Navigation Bar */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = location.pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                to={link.href}
                                className={clsx(
                                    "flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all min-w-[56px]",
                                    isActive
                                        ? "text-amber-700 bg-amber-50"
                                        : "text-slate-500 hover:text-slate-800"
                                )}
                            >
                                <Icon size={18} className={clsx(isActive ? "text-amber-600 stroke-[2.4]" : "text-slate-400")} />
                                <span className="mt-0.5 truncate max-w-[65px]">{link.label.split(' ')[0]}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
