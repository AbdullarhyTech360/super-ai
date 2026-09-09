import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type AuthContextType = {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });

  const login = useCallback(() => {
    localStorage.setItem('isAuthenticated', 'true');
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      logout();
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const expiresIn = payload.exp * 1000 - Date.now();

      if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
        logout();
        return;
      }

      const timeoutId = window.setTimeout(logout, expiresIn);
      return () => window.clearTimeout(timeoutId);
    } catch {
      logout();
    }
  }, [isAuthenticated, logout]);

  const authenticatedFetch = useCallback(async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const response = await fetch(input, init);
    if (response.status === 401 || response.status === 403) {
      logout();
    }
    return response;
  }, [logout]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, authenticatedFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
