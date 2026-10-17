/**
 * Admin → Traffic (spec 09 TR-7 – TR-9): who visits, what they look at, where they come from,
 * and how product views turn into sales. Filters (period, page, source) scope everything.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatPrice } from '../../data/shop';
import { isOptedOut, setOptedOut } from '../../analytics/track';
import { useAdminList } from '../data/hooks';
import { useRepository } from '../repository';
import { formatBytes, isRepoError } from '../repository/errors';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { Button, Notice, Skeleton, Switch, ui } from '../ui/primitives';
import { LineChart } from './LineChart';
import {
  changeText,
  compact,
  countryName,
  rangeLabels,
  rangeOf,
  type FunnelRow,
  type RangeKey,
  type Row2,
} from './report';
import styles from './traffic.module.css';

const ranges = Object.keys(rangeLabels) as RangeKey[];
const tz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

export const trafficKeys = {
  all: ['admin', 'traffic'] as const,
};

function Stat({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: string;
  hint?: string;
}) {
  const tone = change?.startsWith('+') ? 'up' : change?.startsWith('−') ? 'down' : undefined;
  return (
    <div className={styles.stat} data-stat={label}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {change ? (
        <span className={styles.statChange} data-tone={tone}>
          {change} <span className={styles.statHint}>vs previous period</span>
        </span>
      ) : hint ? (
        <span className={styles.statHint}>{hint}</span>
      ) : null}
    </div>
  );
}

/** A list with thin bars showing each row's share; rows can filter the whole page. */
function BarList({
  title,
  rows,
  measure,
  label = (k) => k,
  onPick,
  empty = 'Nothing yet.',
  testId,
}: {
  title: string;
  rows: Row2[];
  measure: 'views' | 'visitors';
  label?: (key: string) => string;
  onPick?: (key: string) => void;
  empty?: string;
  testId: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r[measure]));
  return (
    <section className={styles.panel} aria-label={title} data-list={testId}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <span className={styles.panelMeasure}>{measure === 'views' ? 'Views' : 'Visitors'}</span>
      </div>
      {rows.length === 0 ? (
        <p className={ui.help}>{empty}</p>
      ) : (
        <ol className={styles.bars}>
          {rows.slice(0, 10).map((r) => {
            const text = label(r.key);
            const inner = (
              <>
                <span
                  className={styles.barFill}
                  style={{ inlineSize: `${(r[measure] / max) * 100}%` }}
                  aria-hidden
                />
                <span className={styles.barLabel}>{text}</span>
                <span className={styles.barValue}>{compact(r[measure])}</span>
              </>
            );
            return (
              <li key={r.key}>
                {onPick ? (
                  <button
                    type="button"
                    className={styles.bar}
                    onClick={() => onPick(r.key)}
                    title={`Show only ${text}`}
                  >
                    {inner}
                  </button>
                ) : (
                  <span className={styles.bar}>{inner}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '–');

function Funnel({ rows }: { rows: FunnelRow[] }) {
  if (!rows.length) return <p className={ui.help}>No products yet.</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-funnel>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Views</th>
            <th scope="col">Buy clicks</th>
            <th scope="col">Sales</th>
            <th scope="col">Views → sale</th>
            <th scope="col">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-funnel-row={r.slug}>
              <th scope="row">
                <Link to={`/admin/products/${r.id}`}>{r.title}</Link>
                {r.code_links > 0 && <span className={styles.subtle}> · {r.code_links} via code links</span>}
              </th>
              <td>{compact(r.views)}</td>
              <td>
                {r.is_free ? (
                  <span className={styles.subtle}>{r.free_claims} claims</span>
                ) : (
                  compact(r.buy_clicks)
                )}
              </td>
              <td>{r.is_free ? '–' : compact(r.orders)}</td>
              <td>{r.is_free ? pct(r.free_claims, r.views) : pct(r.orders, r.views)}</td>
              <td>
                {Object.entries(r.revenue).length
                  ? Object.entries(r.revenue)
                      .map(([c, a]) => formatPrice(a, c))
                      .join(' + ')
                  : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrafficPage() {
  const repo = useRepository();
  const [params, setParams] = useSearchParams();
  const range = (ranges.find((r) => r === params.get('range')) ?? '30d') as RangeKey;
  const path = params.get('page');
  const source = params.get('source');
  // ends at the next local midnight, so it's the same all day and today counts in full
  const period = useMemo(() => rangeOf(range), [range]);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const q = { from: period.from, to: period.to, tz, path, source };
  const report = useQuery({
    queryKey: [...trafficKeys.all, 'report', q],
    queryFn: () => repo.analytics.report(q),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
  const funnel = useQuery({
    queryKey: [...trafficKeys.all, 'funnel', period.from, period.to],
    queryFn: () => repo.analytics.funnel(period.from, period.to),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
  const now = useQuery({
    queryKey: [...trafficKeys.all, 'now'],
    queryFn: () => repo.analytics.now(),
    refetchInterval: 30_000,
  });
  const size = useQuery({ queryKey: [...trafficKeys.all, 'size'], queryFn: () => repo.analytics.size() });
  const products = useAdminList('products');
  const projects = useAdminList('projects');
  const [optedOut, setOpt] = useState(isOptedOut);

  const titles = new Map<string, string>([
    ['/', 'Home'],
    ['/shop', 'Shop'],
    ...(products.data ?? []).map((p) => [`/shop/${String(p.slug)}`, String(p.title)] as [string, string]),
    ...(projects.data ?? []).map((p) => [`/projects/${String(p.slug)}`, String(p.title)] as [string, string]),
  ]);
  const pageLabel = (p: string) => (titles.has(p) ? `${titles.get(p)} · ${p}` : p);
  const deviceLabel = (d: string) => ({ phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop' })[d] ?? d;

  const r = report.data;
  return (
    <>
      <PageHeader
        title="Traffic"
        description="Visitors to your site, without cookies. Ad blockers hide some visits, so treat these numbers as a minimum."
      />
      <PageBody wide>
        <div className={styles.filters}>
          <div className={styles.ranges} role="group" aria-label="Period">
            {ranges.map((k) => (
              <button key={k} type="button" aria-pressed={range === k} onClick={() => set({ range: k })}>
                {rangeLabels[k]}
              </button>
            ))}
          </div>
          {(path || source) && (
            <div className={styles.active} aria-label="Filters">
              {path && (
                <button type="button" className={styles.filterChip} onClick={() => set({ page: null })}>
                  Page: {pageLabel(path)} <span aria-hidden>×</span>
                  <span className={ui.visuallyHidden}>(remove)</span>
                </button>
              )}
              {source && (
                <button type="button" className={styles.filterChip} onClick={() => set({ source: null })}>
                  Source: {source} <span aria-hidden>×</span>
                  <span className={ui.visuallyHidden}>(remove)</span>
                </button>
              )}
            </div>
          )}
        </div>

        {report.isError ? (
          <Notice
            tone="error"
            action={
              <Button size="small" onClick={() => report.refetch()}>
                Retry
              </Button>
            }
          >
            {isRepoError(report.error) ? report.error.message : 'Couldn’t load traffic.'}
          </Notice>
        ) : !r ? (
          <Skeleton height="20rem" />
        ) : (
          <div className={styles.body} aria-busy={report.isFetching || undefined}>
            <div className={styles.stats}>
              <Stat
                label="Visitors"
                value={compact(r.visitors)}
                change={changeText(r.visitors, r.prev_visitors)}
              />
              <Stat label="Page views" value={compact(r.views)} change={changeText(r.views, r.prev_views)} />
              <Stat
                label="Pages per visitor"
                value={r.visitors ? (Math.round((r.views / r.visitors) * 10) / 10).toString() : '–'}
              />
              <Stat
                label="Right now"
                value={now.data != null ? String(now.data) : '–'}
                hint="visitors in the last 5 minutes"
              />
            </div>

            <LineChart points={r.series} loading={report.isFetching} />

            <div className={styles.grid}>
              <BarList
                title="Top pages"
                testId="pages"
                rows={r.pages}
                measure="views"
                label={pageLabel}
                onPick={(k) => set({ page: k })}
              />
              <BarList
                title="Sources"
                testId="sources"
                rows={r.sources}
                measure="visitors"
                onPick={(k) => set({ source: k })}
              />
              <BarList
                title="Countries"
                testId="countries"
                rows={r.countries}
                measure="visitors"
                label={(c) => countryName(c)}
              />
              <BarList
                title="Campaigns"
                testId="campaigns"
                rows={r.campaigns}
                measure="visitors"
                label={(c) => c}
                empty="Add ?utm_campaign=… to links you share to see them here."
              />
              <BarList
                title="Devices"
                testId="devices"
                rows={r.devices}
                measure="visitors"
                label={deviceLabel}
              />
              <BarList title="Browsers" testId="browsers" rows={r.browsers} measure="visitors" />
            </div>
          </div>
        )}

        <section className={styles.panel} aria-labelledby="funnel-title">
          <div className={styles.panelHead}>
            <h2 id="funnel-title" className={styles.panelTitle}>
              Shop: from views to sales
            </h2>
            <span className={styles.panelMeasure}>{rangeLabels[range]}</span>
          </div>
          {funnel.data ? (
            <Funnel rows={funnel.data} />
          ) : funnel.isError ? (
            <p className={ui.help}>Couldn’t load.</p>
          ) : (
            <Skeleton height="6rem" />
          )}
        </section>

        <section className={styles.panel} aria-label="Settings">
          <Switch
            checked={optedOut}
            onChange={(v) => {
              setOptedOut(v);
              setOpt(v);
            }}
            label="Don’t count my visits from this browser"
          />
          <p className={ui.help}>
            On by default in any browser where you sign in to the admin. Visitors whose browser asks not to be
            tracked aren’t counted either.
            {size.data != null && <> Analytics data uses {formatBytes(size.data)} of your database.</>}
          </p>
        </section>
      </PageBody>
    </>
  );
}
