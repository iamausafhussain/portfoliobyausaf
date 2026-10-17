/**
 * Traffic in demo mode (spec 09 §3.4): 90 days of believable sample visits, plus whatever you
 * do on the demo site itself, reported with the same rules as the database. Development only.
 */
import type { ErrorReport } from '../../analytics/errors';
import type { TrackPayload } from '../../analytics/track';
import {
  buildFunnel,
  buildReport,
  sourceOf,
  uaBrowser,
  uaDevice,
  type AnalyticsEvent,
  type ErrorGroup,
} from '../traffic/report';
import type { AnalyticsAdminApi, OrderRow, Row } from './types';

interface Ctx {
  products(): Row[];
  projects(): Row[];
  orders(): Promise<OrderRow[]>;
  requireOwner(): Promise<void>;
  delay(ms?: number): Promise<unknown>;
}

/** Small seeded random numbers, so the sample looks the same on every load. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, weighted: [T, number][]): T {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of weighted) if ((x -= w) <= 0) return v;
  return weighted[weighted.length - 1]![0];
}

const sources: [[string | null, string | null, string | null], number][] = [
  [[null, null, null], 30], // direct
  [['l.instagram.com', null, null], 22],
  [[null, 'instagram', 'diwali-sale'], 6],
  [['www.youtube.com', null, null], 12],
  [[null, 'youtube', 'drone-luts-video'], 5],
  [['www.google.com', null, null], 14],
  [['www.linkedin.com', null, null], 8],
  [['github.com', null, null], 3],
  [[null, 'whatsapp', null], 4],
  [['dev.to', null, null], 1],
];
const countries: [string, number][] = [
  ['IN', 55],
  ['US', 12],
  ['GB', 6],
  ['AE', 5],
  ['DE', 4],
  ['CA', 3],
  ['AU', 3],
  ['SG', 3],
  ['NP', 2],
  ['FR', 2],
];
const devices: [AnalyticsEvent['device'], number][] = [
  ['phone', 62],
  ['desktop', 33],
  ['tablet', 5],
];
const browsersFor: Record<AnalyticsEvent['device'], [string, number][]> = {
  phone: [
    ['Chrome', 60],
    ['Safari', 30],
    ['Samsung Internet', 8],
    ['Firefox', 2],
  ],
  tablet: [
    ['Safari', 60],
    ['Chrome', 40],
  ],
  desktop: [
    ['Chrome', 62],
    ['Edge', 15],
    ['Safari', 13],
    ['Firefox', 10],
  ],
};

export function sampleEvents(
  ctx: Pick<Ctx, 'products' | 'projects'>,
  now = Date.now(),
  days = 90,
): AnalyticsEvent[] {
  const r = rng(908);
  const products = ctx.products().filter((p) => p.is_published);
  const projects = ctx.projects().filter((p) => p.is_published);
  const pages: [string, number][] = [
    ['/', 40],
    ['/shop', 14],
    ...products.map((p) => [`/shop/${String(p.slug)}`, 10] as [string, number]),
    ...projects.map((p) => [`/projects/${String(p.slug)}`, 6] as [string, number]),
    ['/terms', 1],
  ];
  const out: AnalyticsEvent[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = now - d * 86_400_000;
    const weekday = new Date(dayStart).getDay();
    // a growing site, quieter mid-week, with a burst after a post 12 days ago
    let visitors = Math.round(
      (14 + (days - d) * 0.25) * (weekday === 0 || weekday === 6 ? 1.3 : 1) * (0.75 + r() * 0.5),
    );
    if (d >= 10 && d <= 12) visitors *= 3;
    for (let v = 0; v < visitors; v++) {
      const [host, utm, campaign] =
        d >= 10 && d <= 12 && r() < 0.6 ? ['l.instagram.com', null, null] : pick(r, sources);
      const device = pick(r, devices);
      const base = {
        source: sourceOf(host, utm),
        utm_campaign: campaign,
        country: pick(r, countries),
        device,
        browser: pick(r, browsersFor[device]),
        visitor: `demo-${d}-${v}`,
      };
      const count = 1 + Math.floor(r() * r() * 5);
      // the hour of the day: more in the evening (visitors' time)
      let t = dayStart - 86_400_000 + (8 + r() * 15) * 3_600_000;
      if (d === 0) t = now - r() * 6 * 3_600_000;
      for (let i = 0; i < count; i++) {
        const path = i === 0 && r() < 0.6 ? '/' : pick(r, pages);
        t += 20_000 + r() * 120_000;
        if (t > now) t = now - 1000;
        out.push({
          ...base,
          created_at: new Date(t).toISOString(),
          name: 'page_view',
          path,
          product_id: null,
        });
        const product = products.find((p) => path === `/shop/${String(p.slug)}`);
        if (product && r() < (product.is_free ? 0.25 : 0.1)) {
          out.push({
            ...base,
            created_at: new Date(t + 15_000).toISOString(),
            name: product.is_free ? 'free_claim' : 'buy_click',
            path,
            product_id: String(product.id),
          });
        }
        if (product && campaign && i === 0 && r() < 0.3) {
          out.push({
            ...base,
            created_at: new Date(t).toISOString(),
            name: 'code_link',
            path,
            product_id: String(product.id),
          });
        }
      }
    }
  }
  return out;
}

export function createDemoTraffic(ctx: Ctx) {
  let events: AnalyticsEvent[] | null = null;
  const all = () => (events ??= sampleEvents(ctx));
  const pageLoad = Math.random().toString(36).slice(2, 8);
  let errors: ErrorGroup[] = [
    {
      fingerprint: 'demo-webgl',
      message: 'Error: WebGL context lost',
      stack: 'Error: WebGL context lost\n    at Stage.render (Stage.ts:212:11)',
      path: '/',
      browser: 'Safari',
      release: 'demo',
      count: 3,
      first_seen: new Date(Date.now() - 6 * 86_400_000).toISOString(),
      last_seen: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      resolved: false,
    },
  ];

  const publicApi = {
    async track(e: TrackPayload) {
      if (e.path.startsWith('/admin')) return;
      const ua = navigator.userAgent;
      all().push({
        created_at: new Date().toISOString(),
        name: e.name,
        path: e.path,
        product_id: e.product,
        source: sourceOf(e.referrer, e.utmSource),
        utm_campaign: e.utmCampaign,
        country: e.tz === 'Asia/Kolkata' || e.tz === 'Asia/Calcutta' ? 'IN' : null,
        device: uaDevice(ua),
        browser: uaBrowser(ua),
        visitor: `you-${pageLoad}-${new Date().toISOString().slice(0, 10)}`,
      });
    },
    async reportError(r: ErrorReport) {
      const fp = `${r.message}|${(r.stack ?? '').split('\n')[1] ?? ''}`;
      const now = new Date().toISOString();
      const g = errors.find((x) => x.fingerprint === fp);
      if (g)
        errors = errors.map((x) =>
          x === g ? { ...x, count: x.count + 1, last_seen: now, resolved: false } : x,
        );
      else
        errors = [
          {
            fingerprint: fp,
            message: r.message,
            stack: r.stack,
            path: r.path,
            browser: uaBrowser(navigator.userAgent),
            release: r.release,
            count: 1,
            first_seen: now,
            last_seen: now,
            resolved: false,
          },
          ...errors,
        ];
    },
  };

  const adminApi: AnalyticsAdminApi = {
    async report(q) {
      await ctx.delay(120);
      await ctx.requireOwner();
      return buildReport(all(), q);
    },
    async now() {
      await ctx.requireOwner();
      const since = Date.now() - 5 * 60_000;
      return new Set(
        all()
          .filter((e) => Date.parse(e.created_at) > since)
          .map((e) => e.visitor),
      ).size;
    },
    async funnel(from, to) {
      await ctx.delay(80);
      await ctx.requireOwner();
      const products = ctx.products().map((p) => ({
        id: String(p.id),
        title: String(p.title),
        slug: String(p.slug),
        is_free: !!p.is_free,
        is_published: !!p.is_published,
      }));
      return buildFunnel(all(), products, await ctx.orders(), from, to);
    },
    async size() {
      await ctx.requireOwner();
      return all().length * 210;
    },
    async errors() {
      await ctx.delay(60);
      await ctx.requireOwner();
      return structuredClone(
        [...errors].sort(
          (a, b) => Number(a.resolved) - Number(b.resolved) || b.last_seen.localeCompare(a.last_seen),
        ),
      );
    },
    async resolveError(fp, resolved) {
      await ctx.requireOwner();
      errors = errors.map((e) => (e.fingerprint === fp ? { ...e, resolved } : e));
    },
    async clearResolvedErrors() {
      await ctx.requireOwner();
      const n = errors.filter((e) => e.resolved).length;
      errors = errors.filter((e) => !e.resolved);
      return n;
    },
  };

  return { publicApi, adminApi, events: all };
}
