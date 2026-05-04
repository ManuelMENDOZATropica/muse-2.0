import { Routes, Route, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Dashboard from './pages/Dashboard';
import ProjectWorkspace from './pages/ProjectWorkspace';
import LoginPage from './pages/LoginPage';
import DemoWorkspace from './pages/DemoWorkspace';
import { useAuth } from './context/AuthContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Public routes — no login required
const PUBLIC_PATHS = ['/demo'];

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Always render public routes regardless of auth state
  if (PUBLIC_PATHS.includes(location.pathname)) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-purple-500/30">
        <Routes>
          <Route path="/demo" element={<DemoWorkspace />} />
        </Routes>
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" />
        <p className="text-gray-500 text-sm">Cargando Muse...</p>
      </div>
    </div>
  );

  if (!user) return <LoginPage />;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-purple-500/30">
      <Routes>
        <Route path="/"             element={<Dashboard />} />
        <Route path="/project/:id"  element={<ProjectWorkspace />} />
        <Route path="/demo"         element={<DemoWorkspace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppRoutes />
    </GoogleOAuthProvider>
  );
}
