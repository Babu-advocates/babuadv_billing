import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Scale, Lock, Mail, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!email.trim() || !password.trim()) {
            setError('Please enter both email and password.');
            return;
        }

        try {
            setLoading(true);
            await login(email.trim(), password);
            navigate('/');
        } catch (err) {
            console.error('Login error:', err);
            setError(err.message || 'Invalid login credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0F172A] flex text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950">
            {/* Left Section: Featuring Advocate Babu's Portrait Photo Cleanly */}
            <div className="hidden lg:block lg:w-1/2 relative overflow-hidden border-r border-slate-800/80 bg-slate-950">
                <div 
                    className="absolute inset-0 bg-cover bg-no-repeat"
                    style={{ backgroundImage: `url('/babu_advocate.jpg')`, backgroundPosition: 'center 35%' }}
                />
            </div>

            {/* Right Login Form Section */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative bg-[#0F172A]">
                <div className="w-full max-w-md space-y-8 animate-slide-up">
                    
                    {/* Mobile Header */}
                    <div className="lg:hidden flex items-center gap-3 mb-6">
                        <img
                            src="/babu_advocate.jpg"
                            alt="Advocate Babu"
                            className="h-12 w-12 rounded-2xl object-cover border-2 border-amber-400/80 shadow-md flex-shrink-0"
                        />
                        <div>
                            <h1 className="text-lg font-black text-white">Babu Advocate Billing</h1>
                            <p className="text-[11px] text-amber-400 font-bold uppercase">Madurai Jurisdiction</p>
                        </div>
                    </div>

                    {/* Login Card Header */}
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                            Sign In to Portal
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400 mt-2">
                            Enter your authorized credentials to access the billing dashboard.
                        </p>
                    </div>

                    {/* Error Banner */}
                    {error && (
                        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-start gap-3 animate-fade-in">
                            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Email Input */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                Email Address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="advocate@example.com"
                                    className="w-full pl-10 pr-4 py-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••••••"
                                    className="w-full pl-10 pr-11 py-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm rounded-2xl shadow-lg shadow-amber-500/20 transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                    <span>Authenticating...</span>
                                </>
                            ) : (
                                <>
                                    <span>Sign In to Dashboard</span>
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="pt-6 border-t border-slate-800/80 text-center">
                        <p className="text-xs text-slate-500">
                            Secured via Supabase Authentication Services
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}
