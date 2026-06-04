import { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Sun, Moon } from 'lucide-react';
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
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const themeToggleBtn = (
    <button
      onClick={toggleTheme}
      className="fixed top-3.5 left-4 z-[9999] w-9 h-9 rounded-xl flex items-center justify-center border transition-all duration-300 shadow-md backdrop-blur-md cursor-pointer bg-white/10 hover:bg-white/20 border-white/10 text-yellow-400 light-mode-button"
      title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
    >
      {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );

  // Always render public routes regardless of auth state
  if (PUBLIC_PATHS.includes(location.pathname)) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-purple-500/30">
        {themeToggleBtn}
        <Routes>
          <Route path="/demo" element={<DemoWorkspace />} />
        </Routes>
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505]">
      {themeToggleBtn}
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" />
        <p className="text-gray-500 text-sm">Cargando Muse...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-purple-500/30">
      {themeToggleBtn}
      <LoginPage />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-purple-500/30">
      {themeToggleBtn}
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
