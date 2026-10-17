/** One page view per route change on the public site (spec 09 TR-1). */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { track } from './track';

export function usePageViews(): void {
  const { pathname } = useLocation();
  const last = useRef<{ path: string; at: number } | null>(null);
  useEffect(() => {
    // the same page twice within a second is one view (React development double-run, quick re-renders)
    const now = Date.now();
    if (last.current && last.current.path === pathname && now - last.current.at < 1000) return;
    last.current = { path: pathname, at: now };
    track('page_view', { path: pathname });
  }, [pathname]);
}
