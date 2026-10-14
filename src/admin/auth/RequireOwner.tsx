/** Lets only the owner's two-factor session through (spec 02 AD-1). */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '../ui/primitives';
import { routeForStatus, useAuth } from './AuthProvider';

export function FullScreenLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div style={{ minHeight: '100svh', display: 'grid', placeContent: 'center' }}>
      <Spinner label={label} />
    </div>
  );
}

export function RequireOwner({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (!state) return <FullScreenLoader label="Checking your session" />;
  if (state.status === 'signed_in') return <>{children}</>;

  const next = location.pathname + location.search;
  return <Navigate to={routeForStatus(state.status)} replace state={{ next }} />;
}

/** The page to return to after signing in (AC-2.1). Only admin paths are accepted. */
export function nextPath(state: unknown): string {
  const next = (state as { next?: unknown } | null)?.next;
  return typeof next === 'string' && next.startsWith('/admin') && !next.startsWith('/admin/login')
    ? next
    : '/admin';
}
