'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authService } from '@/lib/services';
import { disconnectSocket } from '@/lib/socket';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (input: { email: string; password: string; rememberMe?: boolean }) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
    role?: 'JOBSEEKER' | 'COMPANY';
  }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  // Public auth pages don't need a session check; an unauthenticated /auth/me
  // would only produce a noisy 401 in the browser console.
  const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'].includes(
    pathname,
  );

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await authService.me();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthPage) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh, isAuthPage]);

  const login = useCallback<AuthContextValue['login']>(
    async (input) => {
      const { user: loggedIn } = await authService.login(input);
      setUser(loggedIn);
    },
    [],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (input) => {
      const { user: created } = await authService.register(input);
      setUser(created);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      disconnectSocket();
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, refresh, login, register, logout, setUser }),
    [user, loading, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
