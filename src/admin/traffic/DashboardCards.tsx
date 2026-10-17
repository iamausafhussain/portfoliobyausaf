/** Dashboard: visitors this week (spec 09 TR-10) and the site's status line (OP-5). */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router';
import pageStyles from '../pages/pages.module.css';
import { useRepository } from '../repository';
import { changeText, compact, rangeOf } from './report';
import { trafficKeys } from './TrafficPage';
import styles from './traffic.module.css';

const tz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

export function VisitorsCard() {
  const repo = useRepository();
  const week = useMemo(() => rangeOf('7d'), []);
  const q = useQuery({
    queryKey: [...trafficKeys.all, 'report', { ...week, tz, path: null, source: null }],
    queryFn: () => repo.analytics.report({ ...week, tz }),
    staleTime: 60_000,
  });
  const change = q.data ? changeText(q.data.visitors, q.data.prev_visitors) : '';
  return (
    <div className={pageStyles.stat} data-visitors-card>
      <Link to="/admin/traffic" className={pageStyles.cardLink}>
        <span className={pageStyles.cardTitle}>Visitors</span>
      </Link>
      <p className={pageStyles.counts}>
        <span className={pageStyles.big}>{q.data ? compact(q.data.visitors) : '–'}</span> in 7 days
      </p>
      <span className={pageStyles.drafts}>
        {q.isError ? 'Traffic isn’t set up yet.' : change ? `${change} vs the week before` : ' '}
      </span>
    </div>
  );
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function StatusLine() {
  const repo = useRepository();
  const shop = useQuery({
    queryKey: ['admin', 'shop', 'status'],
    queryFn: () => repo.shop.status(),
    retry: false,
  });
  const db = useQuery({
    queryKey: ['admin', 'status', 'db'],
    queryFn: async () => (await repo.data.list('products'), true),
    retry: false,
  });
  const dot = (ok: boolean | undefined) => <span className={styles.statusDot} data-ok={ok} aria-hidden />;
  return (
    <p className={styles.status} data-status-line>
      <span className={styles.statusItem}>
        {dot(true)} Site built {ago(__BUILD_TIME__)}
        {__BUILD_ID__ !== 'local' && ` (${__BUILD_ID__.slice(0, 7)})`}
      </span>
      <span className={styles.statusItem}>
        {dot(db.isPending ? undefined : db.isSuccess)} Database{' '}
        {db.isPending ? '…' : db.isSuccess ? 'reachable' : 'not reachable'}
      </span>
      <span className={styles.statusItem}>
        {dot(shop.isPending ? undefined : shop.isSuccess)} Shop functions{' '}
        {shop.isPending
          ? '…'
          : shop.isSuccess
            ? `answer (${shop.data.provider === 'demo' ? 'demo' : `${shop.data.mode} mode`})`
            : 'not answering'}
      </span>
    </p>
  );
}
