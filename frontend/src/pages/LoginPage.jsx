import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://muse-2-0.onrender.com';
export default function LoginPage() {
  const { setUser } = useAuth();
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError('');
      try {
        // Exchange access token for ID token via userinfo
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        const userInfo = await userInfoRes.json();

        // Send to our backend with the access token (backend verifies domain)
        const res = await fetch(`${API_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenResponse.access_token, userInfo }),
        });

        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Error al iniciar sesión'); return; }
        setUser(data);
      } catch (e) {
        setError('No se pudo conectar al servidor.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('El login de Google falló. Intenta de nuevo.'),
    hosted_domain: 'tropica.me',
  });

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-10 max-w-md w-full">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-500/30">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="16" cy="16" r="4" fill="white" fillOpacity="0.9"/>
              <path d="M16 4V12M16 20V28M4 10L10 13M22 19L28 22M4 22L10 19M22 13L28 10" stroke="white" strokeWidth="1.5" strokeOpacity="0.5"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight">Muse</h1>
            <p className="text-sm text-gray-500 mt-1">Exploración colectiva de ideas</p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-white/[0.03] border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-white mb-1">Bienvenido al equipo</h2>
          <p className="text-sm text-gray-400 mb-8">
            Inicia sesión con tu cuenta <span className="text-violet-400 font-medium">@tropica.me</span> para acceder al espacio colaborativo.
          </p>

          <button
            onClick={() => login()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold rounded-xl px-6 py-3.5 hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? 'Iniciando sesión...' : 'Continuar con Google'}
          </button>

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-600 text-center">
          Solo accesible para el equipo Trópica.<br/>
          Si no tienes cuenta @tropica.me, contacta a tu administrador.
        </p>
      </div>
    </div>
  );
}
