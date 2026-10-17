/** Spec 09 traffic analytics: sources, reports, funnel, ranges, tracking helpers, errors. */
import { describe, expect, it } from 'vitest';
import { entryFrom, privacySignal, referrerHost } from '../../src/analytics/track';
import { ignorable } from '../../src/analytics/errors';
import {
  buildFunnel,
  buildReport,
  changeText,
  compact,
  countryName,
  dayIn,
  rangeOf,
  sourceOf,
  uaBrowser,
  uaDevice,
  type AnalyticsEvent,
} from '../../src/admin/traffic/report';
import { niceTicks } from '../../src/admin/traffic/LineChart';
import { sampleEvents } from '../../src/admin/repository/demoTraffic';

describe('sources (mirror of private.source_of)', () => {
  it.each([
    ['l.instagram.com', null, 'Instagram'],
    [null, 'IG', 'Instagram'],
    ['m.youtube.com', null, 'YouTube'],
    ['youtu.be', null, 'YouTube'],
    ['lnkd.in', null, 'LinkedIn'],
    [null, 'whatsapp', 'WhatsApp'],
    ['t.co', null, 'X'],
    ['www.google.co.in', null, 'Google'],
    ['github.com', null, 'GitHub'],
    [null, 'newsletter', 'Newsletter'],
    ['dev.to', null, 'dev.to'],
    [null, null, 'Direct'],
  ])('%s / %s → %s', (host, utm, want) => expect(sourceOf(host, utm)).toBe(want));
});

describe('browser details (mirror of the SQL)', () => {
  it('reads device and browser', () => {
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0';
    const tab =
      'Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
    expect([uaDevice(iphone), uaBrowser(iphone)]).toEqual(['phone', 'Safari']);
    expect([uaDevice(edge), uaBrowser(edge)]).toEqual(['desktop', 'Edge']);
    expect([uaDevice(tab), uaBrowser(tab)]).toEqual(['tablet', 'Chrome']);
  });
});

const ev = (over: Partial<AnalyticsEvent>): AnalyticsEvent => ({
  created_at: '2026-10-10T10:00:00Z',
  name: 'page_view',
  path: '/',
  product_id: null,
  source: 'Direct',
  utm_campaign: null,
  country: 'IN',
  device: 'phone',
  browser: 'Chrome',
  visitor: 'a',
  ...over,
});

describe('report (mirror of public.traffic_report)', () => {
  const events = [
    ev({}),
    ev({ path: '/shop', created_at: '2026-10-10T10:05:00Z' }),
    ev({
      visitor: 'b',
      source: 'Instagram',
      utm_campaign: 'reel',
      country: 'US',
      created_at: '2026-10-11T20:00:00Z',
    }),
    ev({
      visitor: 'b',
      name: 'buy_click',
      path: '/shop/luts',
      product_id: 'p1',
      source: 'Instagram',
      created_at: '2026-10-11T20:01:00Z',
    }),
    ev({ visitor: 'c', created_at: '2026-10-03T10:00:00Z' }), // previous period
  ];
  const q = { from: '2026-10-09T18:30:00Z', to: '2026-10-12T18:30:00Z', tz: 'Asia/Kolkata' };

  it('counts visitors and views, against the previous period', () => {
    const r = buildReport(events, { ...q, from: '2026-10-06T18:30:00Z' });
    expect([r.visitors, r.views, r.prev_visitors, r.prev_views]).toEqual([2, 3, 1, 1]);
  });

  it('one point per day in the admin’s time zone', () => {
    const r = buildReport(events, q);
    expect(r.series.map((s) => s.day)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    // 20:00 UTC on the 11th is the 12th in India
    expect(r.series.map((s) => s.views)).toEqual([2, 0, 1]);
  });

  it('lists and filters', () => {
    const r = buildReport(events, q);
    expect(r.pages.map((p) => p.key)).toEqual(['/', '/shop']);
    expect(r.sources[0]).toEqual({ key: 'Direct', views: 2, visitors: 1 });
    expect(r.campaigns).toEqual([{ key: 'reel', views: 1, visitors: 1, source: 'Instagram' }]);
    expect(buildReport(events, { ...q, source: 'Instagram' }).visitors).toBe(1);
    expect(buildReport(events, { ...q, path: '/shop' }).views).toBe(1);
  });

  it('funnel per product', () => {
    const rows = buildFunnel(
      [...events, ev({ path: '/shop/luts', visitor: 'b' })],
      [
        { id: 'p1', title: 'LUTs', slug: 'luts', is_free: false, is_published: true },
        { id: 'p2', title: 'Draft', slug: 'draft', is_free: false, is_published: false },
      ],
      [
        {
          product_id: 'p1',
          status: 'paid',
          amount: 1900,
          currency: 'USD',
          created_at: '2026-10-10T12:00:00Z',
        },
        {
          product_id: 'p1',
          status: 'refunded',
          amount: 1900,
          currency: 'USD',
          created_at: '2026-10-10T12:00:00Z',
        },
      ],
      q.from,
      q.to,
    );
    expect(rows).toEqual([
      {
        id: 'p1',
        title: 'LUTs',
        slug: 'luts',
        is_free: false,
        views: 1,
        buy_clicks: 1,
        free_claims: 0,
        code_links: 0,
        orders: 1,
        revenue: { USD: 1900 },
      },
    ]);
  });
});

describe('display helpers', () => {
  it('changes, numbers, ranges, countries, ticks', () => {
    expect([
      changeText(150, 100),
      changeText(50, 100),
      changeText(3, 0),
      changeText(0, 0),
      changeText(5, 5),
    ]).toEqual(['+50%', '−50%', 'new', '', '0%']);
    expect([compact(1284), compact(12_900)]).toEqual(['1,284', '12.9K']);
    const r = rangeOf('7d', new Date('2026-10-17T15:00:00'));
    expect((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000).toBeCloseTo(7, 1);
    expect(countryName('IN', 'en')).toBe('India');
    expect(countryName('??')).toBe('Unknown');
    expect(dayIn('2026-10-11T20:00:00Z', 'Asia/Kolkata')).toBe('2026-10-12');
    expect(niceTicks(230)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('tracking helpers (TR-1, TR-5)', () => {
  it('keeps only the referring host, never this site', () => {
    expect(referrerHost('https://l.instagram.com/?u=x&e=y', 'ausafhussain.netlify.app')).toBe(
      'l.instagram.com',
    );
    expect(referrerHost('https://ausafhussain.netlify.app/shop', 'ausafhussain.netlify.app')).toBeNull();
    expect(referrerHost('', 'x')).toBeNull();
  });
  it('reads UTM tags from the first page', () => {
    expect(
      entryFrom('?utm_source=instagram&utm_campaign=diwali&code=X', 'https://www.google.com/', 'site'),
    ).toEqual({
      referrer: 'www.google.com',
      utmSource: 'instagram',
      utmMedium: null,
      utmCampaign: 'diwali',
    });
  });
  it('respects Do Not Track and Global Privacy Control', () => {
    expect(privacySignal({ doNotTrack: '1' })).toBe(true);
    expect(privacySignal({ globalPrivacyControl: true })).toBe(true);
    expect(privacySignal({ doNotTrack: null })).toBe(false);
  });
  it('ignores errors that aren’t ours', () => {
    expect(ignorable('Script error.', null)).toBe(true);
    expect(ignorable('ResizeObserver loop completed with undelivered notifications.', null)).toBe(true);
    expect(ignorable('TypeError: x', 'at chrome-extension://abc/x.js')).toBe(true);
    expect(ignorable('TypeError: x is undefined', 'at Globe (Globe.ts:1:1)')).toBe(false);
  });
});

describe('demo sample traffic', () => {
  it('is the same on every load and stays in the past 90 days', () => {
    const ctx = {
      products: () => [{ id: 'p1', slug: 'luts', is_published: true, is_free: false, updated_at: '' }],
      projects: () => [{ id: 'x', slug: 'edi', is_published: true, updated_at: '' }],
    };
    const now = Date.parse('2026-10-17T12:00:00Z');
    const a = sampleEvents(ctx, now);
    expect(a).toEqual(sampleEvents(ctx, now));
    expect(a.length).toBeGreaterThan(1000);
    expect(
      a.every((e) => Date.parse(e.created_at) <= now && Date.parse(e.created_at) > now - 92 * 86_400_000),
    ).toBe(true);
  });
});
