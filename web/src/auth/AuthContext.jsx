import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.setAuthLostHandler(() => setUser(null));
    let live = true;
    api
      .restoreSession()
      .then((u) => live && setUser(u))
      .catch(() => {})
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (credentials) => setUser(await api.login(credentials)),
      register: async (details) => setUser(await api.register(details)),
      logout: async () => {
        await api.logout();
        setUser(null);
      },
    }),
    [user, loading]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
