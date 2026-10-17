import { optOutOnSignIn } from '../../analytics/track';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRepository } from '../repository';
import type { AuthState } from '../repository/types';

interface AuthContextValue {
  state: AuthState | null; // null while loading
  refresh(): Promise<AuthState>;
  /** Message to show on the login screen (e.g. "This account can't access the admin"). */
  notice: string | null;
  setNotice(n: string | null): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const [state, setState] = useState<AuthState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Reads the auth state; turns away non-owner accounts. Sets no React state itself. */
  const resolve = useCallback(async (): Promise<{ next: AuthState; notice?: string }> => {
    let next: AuthState;
    try {
      next = await repo.auth.getState();
    } catch {
      next = { status: 'signed_out' };
    }
    if (next.status === 'not_owner') {
      await repo.auth.signOut('local');
      return { next: { status: 'signed_out' }, notice: "This account can't access the admin." };
    }
    if (next.status === 'signed_in') optOutOnSignIn();
    return { next };
  }, [repo]);

  const refresh = useCallback(async () => {
    const { next, notice: n } = await resolve();
    if (n) setNotice(n);
    setState(next);
    return next;
  }, [resolve]);

  useEffect(() => {
    let active = true;
    const load = () =>
      resolve().then(({ next, notice: n }) => {
        if (!active) return;
        if (n) setNotice(n);
        setState(next);
      });
    void load();
    const unsubscribe = repo.auth.onChange(() => void load());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repo, resolve]);

  return (
    <AuthContext.Provider value={{ state, refresh, notice, setNotice }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Where each auth status should land. */
export function routeForStatus(status: AuthState['status']): string {
  switch (status) {
    case 'needs_setup':
      return '/admin/login/setup-2fa';
    case 'needs_code':
      return '/admin/login/verify';
    case 'signed_in':
      return '/admin';
    default:
      return '/admin/login';
  }
}
