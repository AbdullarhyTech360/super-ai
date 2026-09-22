import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { ACTIVE_CONVERSATION_CACHE_KEY, CHAT_CONVERSATIONS_CACHE_KEY } from '@/lib/preferences';

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
};

type AuthContextType = {
  isAuthenticated: boolean;
  /** Cached copy of /api/me — available on first paint, revalidated in the background. */
  user: AuthUser | null;
  login: () => void;
  logout: () => void;
  setUser: (user: AuthUser | null) => void;
  refreshUser: () => Promise<AuthUser | null>;
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const USER_CACHE_KEY = 'auth.user.v1';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const readCachedUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  const [user, setUserState] = useState<AuthUser | null>(readCachedUser);
  const pendingUserRequest = useRef<Promise<AuthUser | null> | null>(null);

  const persistUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    try {
      if (next) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(next));
      else localStorage.removeItem(USER_CACHE_KEY);
    } catch {
      // Private browsing / quota: the in-memory copy still serves the session.
    }
  }, []);

  const login = useCallback(() => {
    localStorage.setItem('isAuthenticated', 'true');
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem(USER_CACHE_KEY);
    // Cached chat titles belong to the account that is signing out.
    localStorage.removeItem(CHAT_CONVERSATIONS_CACHE_KEY);
    localStorage.removeItem(ACTIVE_CONVERSATION_CACHE_KEY);
    setUserState(null);
    setIsAuthenticated(false);
  }, []);

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

  // One profile request for the whole app. Pages that used to fetch /api/me on
  // their own (chat, sidebar, profile) now read it from here, which removes two
  // round-trips from the path that decides how fast the chat page appears.
  const refreshUser = useCallback(async () => {
    if (pendingUserRequest.current) return pendingUserRequest.current;

    const request = (async (): Promise<AuthUser | null> => {
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/me`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        });
        if (!response.ok) return null;
        const data = (await response.json()) as AuthUser;
        persistUser(data);
        return data;
      } catch {
        // Keep showing the cached profile rather than blanking the header.
        return null;
      } finally {
        pendingUserRequest.current = null;
      }
    })();

    pendingUserRequest.current = request;
    return request;
  }, [authenticatedFetch, persistUser]);

  const setUser = useCallback((next: AuthUser | null) => persistUser(next), [persistUser]);

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

      // setTimeout overflows past ~24.8 days (2^31 ms) and would fire instantly,
      // logging the user straight back out; clamp so a long-lived token never
      // triggers a spurious immediate logout.
      const timeoutId = window.setTimeout(logout, Math.min(expiresIn, 2_000_000_000));
      void refreshUser();
      return () => window.clearTimeout(timeoutId);
    } catch {
      logout();
    }
  }, [isAuthenticated, logout, refreshUser]);

  const value = useMemo<AuthContextType>(() => ({
    isAuthenticated,
    user,
    login,
    logout,
    setUser,
    refreshUser,
    authenticatedFetch,
  }), [isAuthenticated, user, login, logout, setUser, refreshUser, authenticatedFetch]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
