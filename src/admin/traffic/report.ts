/**
 * Traffic report shapes and the pure helpers behind them (spec 09 TR-7 – TR-9). The live
 * numbers come from the database (0011_analytics.sql); the demo backend builds the same
 * report from its sample events with `buildReport` and `buildFunnel`, which mirror the SQL.
 */

export interface Row2 {
  key: string;
  views: number;
  visitors: number;
}

export interface TrafficReport {
  visitors: number;
  views: number;
  prev_visitors: number;
  prev_views: number;
  series: { day: string; visitors: number; views: number }[];
  pages: Row2[];
  sources: Row2[];
  campaigns: (Row2 & { source: string })[];
  countries: Row2[];
  devices: Row2[];
  browsers: Row2[];
}

export interface FunnelRow {
  id: string;
  title: string;
  slug: string;
  is_free: boolean;
  views: number;
  buy_clicks: number;
  free_claims: number;
  code_links: number;
  orders: number;
  revenue: Record<string, number>;
}

export interface ErrorGroup {
  fingerprint: string;
  message: string;
  stack: string | null;
  path: string | null;
  browser: string | null;
  release: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
  resolved: boolean;
}

export interface TrafficQuery {
  from: string;
  to: string;
  tz: string;
  path?: string | null;
  source?: string | null;
}

/** One stored event, as the database keeps it (no IPs, no user agents). */
export interface AnalyticsEvent {
  created_at: string;
  name: string;
  path: string;
  product_id: string | null;
  source: string;
  utm_campaign: string | null;
  country: string | null;
  device: 'phone' | 'tablet' | 'desktop';
  browser: string;
  visitor: string;
}

/* ------------------------------------------------------------------ */
/* Sources (mirror of private.source_of)                               */
/* ------------------------------------------------------------------ */

const groups: [RegExp, RegExp, string][] = [
  [/^(instagram|ig)/, /(^|\.)instagram\.com$/, 'Instagram'],
  [/^(youtube|yt)/, /(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/^linkedin/, /(^|\.)(linkedin\.com|lnkd\.in)$/, 'LinkedIn'],
  [/^(whatsapp|wa)$/, /(^|\.)(whatsapp\.com|wa\.me)$/, 'WhatsApp'],
  [/^(twitter|x)$/, /(^|\.)(twitter\.com|x\.com|t\.co)$/, 'X'],
  [/^(facebook|fb)/, /(^|\.)(facebook\.com|fb\.me|fb\.com)$/, 'Facebook'],
  [/^github/, /(^|\.)github\.com$/, 'GitHub'],
  [/^google/, /(^|\.)google\.[a-z.]+$/, 'Google'],
  [/^bing/, /(^|\.)bing\.com$/, 'Bing'],
  [/^duckduckgo/, /(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/^reddit/, /(^|\.)reddit\.com$/, 'Reddit'],
];

export function sourceOf(host: string | null, utm: string | null): string {
  const s = (utm ?? '').trim().toLowerCase();
  const h = (host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^(www\.|m\.|l\.|lm\.)/, '');
  for (const [utmRe, hostRe, name] of groups) if (utmRe.test(s) || hostRe.test(h)) return name;
  if (s) return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 40);
  if (h) return h.slice(0, 120);
  return 'Direct';
}

/* ------------------------------------------------------------------ */
/* Report (mirror of public.traffic_report)                            */
/* ------------------------------------------------------------------ */

/** The calendar day of an instant in a time zone, "YYYY-MM-DD". */
export function dayIn(iso: string | number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function top(
  events: AnalyticsEvent[],
  keyOf: (e: AnalyticsEvent) => string | null,
  opts: { viewsOnly?: boolean; by: 'views' | 'visitors'; limit?: number },
): Row2[] {
  const map = new Map<string, { views: number; visitors: Set<string> }>();
  for (const e of events) {
    if (opts.viewsOnly && e.name !== 'page_view') continue;
    const k = keyOf(e);
    if (k == null) continue;
    const r = map.get(k) ?? { views: 0, visitors: new Set<string>() };
    if (e.name === 'page_view') r.views += 1;
    r.visitors.add(e.visitor);
    map.set(k, r);
  }
  return [...map.entries()]
    .map(([key, r]) => ({ key, views: r.views, visitors: r.visitors.size }))
    .sort((a, b) => b[opts.by] - a[opts.by] || a.key.localeCompare(b.key))
    .slice(0, opts.limit ?? 25);
}

export function buildReport(all: AnalyticsEvent[], q: TrafficQuery): TrafficReport {
  const from = Date.parse(q.from);
  const to = Date.parse(q.to);
  const len = to - from;
  const match = (e: AnalyticsEvent) => (!q.path || e.path === q.path) && (!q.source || e.source === q.source);
  const inRange = (e: AnalyticsEvent, a: number, b: number) => {
    const t = Date.parse(e.created_at);
    return t >= a && t < b;
  };
  const ev = all.filter((e) => match(e) && inRange(e, from, to));
  const prev = all.filter((e) => match(e) && inRange(e, from - len, from));
  const distinct = (list: AnalyticsEvent[]) => new Set(list.map((e) => e.visitor)).size;

  const days: string[] = [];
  for (let d = dayIn(from, q.tz); d <= dayIn(to - 1000, q.tz);) {
    days.push(d);
    const next = new Date(`${d}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  const perDay = new Map<string, { visitors: Set<string>; views: number }>();
  for (const e of ev) {
    const d = dayIn(e.created_at, q.tz);
    const r = perDay.get(d) ?? { visitors: new Set<string>(), views: 0 };
    r.visitors.add(e.visitor);
    if (e.name === 'page_view') r.views += 1;
    perDay.set(d, r);
  }

  const campaigns = top(ev, (e) => e.utm_campaign, { by: 'visitors' }).map((r) => ({
    ...r,
    source:
      ev
        .filter((e) => e.utm_campaign === r.key)
        .map((e) => e.source)
        .sort()[0] ?? '',
  }));

  return {
    visitors: distinct(ev),
    views: ev.filter((e) => e.name === 'page_view').length,
    prev_visitors: distinct(prev),
    prev_views: prev.filter((e) => e.name === 'page_view').length,
    series: days.map((day) => ({
      day,
      visitors: perDay.get(day)?.visitors.size ?? 0,
      views: perDay.get(day)?.views ?? 0,
    })),
    pages: top(ev, (e) => e.path, { viewsOnly: true, by: 'views' }),
    sources: top(ev, (e) => e.source, { by: 'visitors' }),
    campaigns,
    countries: top(ev, (e) => e.country ?? '??', { by: 'visitors' }),
    devices: top(ev, (e) => e.device, { by: 'visitors' }),
    browsers: top(ev, (e) => e.browser, { by: 'visitors' }),
  };
}

/* ------------------------------------------------------------------ */
/* Shop funnel (mirror of public.shop_funnel)                          */
/* ------------------------------------------------------------------ */

export function buildFunnel(
  all: AnalyticsEvent[],
  products: { id: string; title: string; slug: string; is_free: boolean; is_published: boolean }[],
  orders: {
    product_id: string | null;
    status: string;
    amount: number;
    currency: string;
    created_at: string;
  }[],
  fromIso: string,
  toIso: string,
): FunnelRow[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const inRange = (iso: string) => {
    const t = Date.parse(iso);
    return t >= from && t < to;
  };
  const ev = all.filter((e) => inRange(e.created_at));
  const count = (name: string, p: { id: string; slug: string }) =>
    ev.filter(
      (e) => e.name === name && (name === 'page_view' ? e.path === `/shop/${p.slug}` : e.product_id === p.id),
    ).length;
  return products
    .map((p) => {
      const paid = orders.filter(
        (o) => o.product_id === p.id && o.status === 'paid' && inRange(o.created_at),
      );
      const revenue: Record<string, number> = {};
      for (const o of paid) revenue[o.currency] = (revenue[o.currency] ?? 0) + o.amount;
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        is_free: p.is_free,
        is_published: p.is_published,
        views: count('page_view', p),
        buy_clicks: count('buy_click', p),
        free_claims: count('free_claim', p),
        code_links: count('code_link', p),
        orders: paid.length,
        revenue,
      };
    })
    .filter((r) => r.is_published || r.views + r.buy_clicks + r.free_claims + r.code_links + r.orders > 0)
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title))
    .map(({ is_published: _published, ...r }) => r);
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

/** "+12%", "−8%", "new" (no earlier data) or "" (both zero). */
export function changeText(now: number, before: number): string {
  if (!before) return now ? 'new' : '';
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}

/** 1,284 / 12.9K / 1.2M */
export function compact(n: number): string {
  return new Intl.NumberFormat('en', {
    notation: n >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(n);
}

export type RangeKey = 'today' | '7d' | '30d' | '90d' | '12m';
export const rangeLabels: Record<RangeKey, string> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '12m': '12 months',
};

/** [from, to) for a range, ending at the next local midnight so today counts in full. */
export function rangeOf(key: RangeKey, now = new Date()): { from: string; to: string } {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const start = new Date(end);
  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90, '12m': 365 }[key];
  start.setDate(start.getDate() - days);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Country code → name in the admin's language ("IN" → "India"); "??" → "Unknown". */
export function countryName(code: string, locale?: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return 'Unknown';
  try {
    return new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/* ------------------------------------------------------------------ */
/* Browser details (mirror of private.ua_device / ua_browser / is_bot) */
/* ------------------------------------------------------------------ */

export function uaDevice(ua: string): AnalyticsEvent['device'] {
  if (/(ipad|tablet|playbook|silk)/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)))
    return 'tablet';
  if (/(mobi|iphone|ipod|android|blackberry|opera mini|iemobile)/i.test(ua)) return 'phone';
  return 'desktop';
}

export function uaBrowser(ua: string): string {
  if (/edg(e|a|ios)?\//i.test(ua)) return 'Edge';
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet';
  if (/(opr\/|opera)/i.test(ua)) return 'Opera';
  if (/(firefox|fxios)\//i.test(ua)) return 'Firefox';
  if (/(chrome|crios|chromium)\//i.test(ua)) return 'Chrome';
  if (/safari\//i.test(ua)) return 'Safari';
  return 'Other';
}
