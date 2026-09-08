import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import BankManager from './pages/BankManager';
import BillingProcess from './pages/BillingProcess';
import FileLibrary from './pages/FileLibrary';
import Login from './pages/Login';

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-amber-500">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-semibold tracking-wider uppercase text-slate-400">Verifying Auth Session...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

function PublicRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) return null;

    if (user) {
        return <Navigate to="/" replace />;
    }

    return children;
}

function App() {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    {/* Public Route */}
                    <Route 
                        path="/login" 
                        element={
                            <PublicRoute>
                                <Login />
                            </PublicRoute>
                        } 
                    />

                    {/* Protected Application Routes wrapped in Layout */}
                    <Route
                        path="/*"
                        element={
                            <ProtectedRoute>
                                <Layout>
                                    <Routes>
                                        <Route path="/" element={<Dashboard />} />
                                        <Route path="/banks" element={<BankManager />} />
                                        <Route path="/billing" element={<BillingProcess />} />
                                        <Route path="/library" element={<FileLibrary />} />
                                    </Routes>
                                </Layout>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
