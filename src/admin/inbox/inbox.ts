/** Inbox helpers (spec 07 §2.4). Pure, so they're unit-tested. */
import { kindLabel } from '../../chapters/contact/contactForm';
import type { MessageKind, MessageRow, MessageStatus, MessageTab } from '../repository/types';

export const PAGE_SIZE = 50;

export const tabLabels: Record<MessageTab, string> = {
  new: 'New',
  read: 'Read',
  replied: 'Replied',
  archived: 'Archived',
  all: 'All',
};

export const kindFilters: MessageKind[] = ['hire', 'freelance', 'collab', 'general'];
export const kindName = (k: MessageKind) => kindLabel(k);

export const statusLabels: Record<MessageStatus, string> = {
  new: 'New',
  read: 'Read',
  replied: 'Replied',
  archived: 'Archived',
};

/** "just now", "5 min ago", "2 h ago", "3 d ago", then the date. */
export function timeAgo(iso: string, now = Date.now(), locale?: string): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  const date = new Date(t);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

export const fullDate = (iso: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/** What the list shows under the name: the subject, or the start of the message. */
export function preview(m: Pick<MessageRow, 'subject' | 'body'>, max = 90): string {
  const text = (m.subject.trim() || m.body).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The messages before and after this one in the list (IB-7). */
export function neighbours(rows: Pick<MessageRow, 'id'>[], id: string | undefined) {
  const i = id ? rows.findIndex((r) => r.id === id) : -1;
  return {
    index: i,
    newer: i > 0 ? rows[i - 1]!.id : null,
    older: i >= 0 && i < rows.length - 1 ? rows[i + 1]!.id : null,
  };
}

const QUOTE_MAX = 1500;

/** A reply in your mail app: "Re: <subject>" with their message quoted (IB-5). */
export function replyMailto(m: MessageRow, locale?: string): string {
  const subject = `Re: ${m.subject.trim() || kindName(m.kind)}`;
  const body = m.body.length > QUOTE_MAX ? `${m.body.slice(0, QUOTE_MAX)}…` : m.body;
  const quoted = body
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join('\n');
  const text = `Hi ${m.name.split(/\s+/)[0] || 'there'},\n\n\n\nOn ${fullDate(m.created_at, locale)}, ${m.name} wrote:\n${quoted}`;
  return `mailto:${encodeURIComponent(m.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

/** Search params ⇄ inbox filters, so a filtered view survives a reload and the back button. */
export function readFilters(params: URLSearchParams): {
  tab: MessageTab;
  kind: MessageKind | null;
  q: string;
} {
  const tab = params.get('tab');
  const kind = params.get('kind');
  return {
    tab: tab && tab in tabLabels ? (tab as MessageTab) : 'all',
    kind: kind && (kindFilters as string[]).includes(kind) ? (kind as MessageKind) : null,
    q: params.get('q') ?? '',
  };
}

export function writeFilters(f: { tab: MessageTab; kind: MessageKind | null; q: string }): string {
  const p = new URLSearchParams();
  if (f.tab !== 'all') p.set('tab', f.tab);
  if (f.kind) p.set('kind', f.kind);
  if (f.q.trim()) p.set('q', f.q.trim());
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Keyboard shortcuts: ignored while typing in a field or with a modifier held (IB-7). */
export function shortcutFor(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}): 'older' | 'newer' | 'archive' | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? ''))) return null;
  if (e.key === 'j') return 'older';
  if (e.key === 'k') return 'newer';
  if (e.key === 'e') return 'archive';
  return null;
}
