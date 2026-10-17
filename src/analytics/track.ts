/**
 * Traffic analytics on the public site (spec 09 §2.2): page views and a few events, sent
 * fire-and-forget to the database's `track` function. No cookies and no local IDs: the
 * database counts visitors with a daily-changing hash (TR-2). The only thing kept in the
 * browser is where this tab's visit came from (so later page views keep their source).
 */
import { getPublicSource } from '../data/source';

export type TrackName =
  | 'page_view'
  | 'buy_click'
  | 'checkout_return'
  | 'free_claim'
  | 'download'
  | 'contact_sent'
  | 'resume_open'
  | 'code_link';

export interface TrackPayload {
  name: TrackName;
  path: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  product: string | null;
  detail: string | null;
  tz: string | null;
}

/** "Don't count my visits" for this browser (TR-4, Q3). */
export const OPT_OUT_KEY = 'analytics-optout';
const ENTRY_KEY = 'analytics-entry';

export function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOptedOut(on: boolean): void {
  try {
    // "0" remembers that you chose to be counted, so signing in again doesn't undo it
    localStorage.setItem(OPT_OUT_KEY, on ? '1' : '0');
  } catch {
    /* private mode: nothing to remember */
  }
}

/** Signing in to the admin stops counting this browser, unless you've chosen otherwise (Q3). */
export function optOutOnSignIn(): void {
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === null) localStorage.setItem(OPT_OUT_KEY, '1');
  } catch {
    /* fine */
  }
}

/** Do Not Track / Global Privacy Control (TR-5, Q4). */
export function privacySignal(nav: Partial<Navigator> & { globalPrivacyControl?: boolean }): boolean {
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

/** The referring site's host, or null for direct visits and links from this site. */
export function referrerHost(referrer: string, ownHost: string): string | null {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host && host !== ownHost.toLowerCase() ? host.slice(0, 120) : null;
  } catch {
    return null;
  }
}

interface Entry {
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

const clip = (v: string | null, n: number) => (v ? v.trim().slice(0, n) || null : null);

/** Where this visit came from: the referrer and UTM tags of the tab's first page (TR-1). */
export function entryFrom(search: string, referrer: string, ownHost: string): Entry {
  const q = new URLSearchParams(search);
  return {
    referrer: referrerHost(referrer, ownHost),
    utmSource: clip(q.get('utm_source'), 80),
    utmMedium: clip(q.get('utm_medium'), 80),
    utmCampaign: clip(q.get('utm_campaign'), 80),
  };
}

function entry(): Entry {
  try {
    const kept = sessionStorage.getItem(ENTRY_KEY);
    if (kept) return JSON.parse(kept) as Entry;
  } catch {
    /* fall through */
  }
  const e = entryFrom(location.search, document.referrer, location.hostname);
  try {
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify(e));
  } catch {
    /* fine */
  }
  return e;
}

/** Whether this browser should be counted at all. */
export function shouldTrack(path: string): boolean {
  if (path.startsWith('/admin')) return false;
  if (isOptedOut()) return false;
  if (typeof navigator !== 'undefined' && privacySignal(navigator)) return false;
  return true;
}

/** Records one event; never throws, never waits (TR-5). */
export function track(
  name: TrackName,
  extra: { product?: string | null; detail?: string | null; path?: string } = {},
): void {
  try {
    const path = (extra.path ?? location.pathname).slice(0, 300) || '/';
    if (!shouldTrack(path)) return;
    const e = entry();
    let tz: string | null = null;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      /* old browser */
    }
    const payload: TrackPayload = {
      name,
      path,
      referrer: e.referrer,
      utmSource: e.utmSource,
      utmMedium: e.utmMedium,
      utmCampaign: e.utmCampaign,
      product: extra.product ?? null,
      detail: extra.detail ? extra.detail.slice(0, 40) : null,
      tz,
    };
    void getPublicSource()
      .then((s) => s.track(payload))
      .catch(() => undefined);
  } catch {
    /* tracking must never break a page */
  }
}
