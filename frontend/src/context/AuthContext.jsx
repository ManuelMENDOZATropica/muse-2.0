import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

const USER_KEY = 'muse_user';

export const AuthProvider = ({ children }) => {
  const [user,    setUserState] = useState(null);
  const [loading, setLoading]   = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) setUserState(JSON.parse(stored));
    } catch (_) {}
    setLoading(false);
  }, []);

  const setUser = useCallback((u) => {
    setUserState(u);
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else    localStorage.removeItem(USER_KEY);
  }, []);

  const logout = useCallback(() => setUser(null), [setUser]);

  return (
    <AuthContext.Provider value={{ user, setUser, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
