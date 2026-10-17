/**
 * Visitors and page views per day (spec 09 TR-7). One y-axis (both are counts), 2 px lines,
 * a crosshair that snaps to the nearest day with one tooltip for both series, keyboard
 * arrows to move it, a legend, and a table view with the same numbers.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './traffic.module.css';

export interface Point {
  day: string;
  visitors: number;
  views: number;
}

const series = [
  { key: 'visitors', label: 'Visitors', className: styles.lineVisitors, keyClass: styles.keyVisitors },
  { key: 'views', label: 'Page views', className: styles.lineViews, keyClass: styles.keyViews },
] as const;

/** Clean tick values for 0…max: 0, 5, 10… or 0, 20, 40… */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const short = (day: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00Z`));
const long = (day: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${day}T12:00:00Z`));
const num = (n: number) => new Intl.NumberFormat().format(n);

export function LineChart({ points, loading }: { points: Point[]; loading?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 220;
  const pad = { top: 12, right: 12, bottom: 26, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(0, ...points.map((p) => Math.max(p.visitors, p.views)));
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) => pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const path = (k: 'visitors' | 'views') =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');

  // a few dates along the bottom, never crowded
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 80))));
  const xTicks = points.map((p, i) => ({ i, day: p.day })).filter(({ i }) => i % every === 0);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left) / box.width;
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(rel * (points.length - 1)))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!points.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      setActive((a) => Math.min(points.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : points.length)) + d)));
    } else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(points.length - 1);
    else if (e.key === 'Escape') setActive(null);
  };

  const a = active != null ? points[active] : null;
  const last = points.length - 1;

  return (
    <figure className={styles.chart} aria-busy={loading || undefined} data-chart>
      <figcaption className={styles.chartHead}>
        <span id={titleId} className={styles.chartTitle}>
          Visitors and page views per day
        </span>
        <span className={styles.legend}>
          {series.map((s) => (
            <span key={s.key} className={styles.legendItem}>
              <span className={`${styles.lineKey} ${s.keyClass}`} aria-hidden />
              {s.label}
            </span>
          ))}
        </span>
        <button
          type="button"
          className={styles.tableToggle}
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
        >
          {table ? 'Show chart' : 'Show as table'}
        </button>
      </figcaption>
      {table ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Visitors</th>
                <th scope="col">Page views</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day}>
                  <th scope="row">{long(p.day)}</th>
                  <td>{num(p.visitors)}</td>
                  <td>{num(p.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className={styles.plot}>
          <svg
            width={width}
            height={height}
            role="img"
            aria-labelledby={titleId}
            aria-describedby={a ? `${titleId}-tip` : undefined}
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className={styles.svg}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className={styles.grid} />
                <text
                  x={pad.left - 8}
                  y={y(t)}
                  className={styles.yTick}
                  dominantBaseline="middle"
                  textAnchor="end"
                >
                  {t >= 1000 ? `${Math.round(t / 100) / 10}K` : t}
                </text>
              </g>
            ))}
            {xTicks.map(({ i, day }) => (
              <text key={day} x={x(i)} y={height - 6} className={styles.xTick} textAnchor="middle">
                {short(day)}
              </text>
            ))}
            {series.map((s) => (
              <path key={s.key} d={path(s.key)} className={`${styles.line} ${s.className}`} />
            ))}
            {last >= 0 &&
              series.map((s) => (
                <circle
                  key={s.key}
                  cx={x(last)}
                  cy={y(points[last]![s.key])}
                  r={4}
                  className={`${styles.dot} ${s.className}`}
                />
              ))}
            {a && active != null && (
              <g>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={pad.top}
                  y2={pad.top + innerH}
                  className={styles.crosshair}
                />
                {series.map((s) => (
                  <circle
                    key={s.key}
                    cx={x(active)}
                    cy={y(a[s.key])}
                    r={4}
                    className={`${styles.dot} ${s.className}`}
                  />
                ))}
              </g>
            )}
            <rect
              x={pad.left}
              y={pad.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setActive(null)}
            />
          </svg>
          {a && active != null && (
            <div
              id={`${titleId}-tip`}
              className={styles.tooltip}
              role="status"
              style={{
                left: Math.min(width - 150, Math.max(0, x(active) - 70)),
              }}
            >
              <span className={styles.tipDay}>{long(a.day)}</span>
              {series.map((s) => (
                <span key={s.key} className={styles.tipRow}>
                  <span className={`${styles.lineKey} ${s.keyClass}`} aria-hidden />
                  <strong>{num(a[s.key])}</strong> {s.label.toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
