/**
 * Inbox filtering rules (spec 07 IB-2, IB-3), shared by the demo backend and the tests;
 * the Supabase version expresses the same rules as a query.
 */
import type { MessageQuery, MessageRow, MessageTab } from './types';

export const inTab = (m: Pick<MessageRow, 'status'>, tab: MessageTab) =>
  tab === 'all' ? m.status !== 'archived' : m.status === tab;

/** Search text with the characters PostgREST filters treat specially removed. */
export const cleanSearch = (search: string | undefined) =>
  (search ?? '')
    .replace(/[%*,()"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function matchesQuery(m: MessageRow, q: Omit<MessageQuery, 'limit'>): boolean {
  if (!inTab(m, q.tab)) return false;
  if (q.kind && m.kind !== q.kind) return false;
  const s = cleanSearch(q.search).toLowerCase();
  if (!s) return true;
  return [m.name, m.email, m.subject, m.body].some((v) => v.toLowerCase().includes(s));
}

/** Newest first, then the filter, then the page. */
export function filterMessages(all: MessageRow[], q: MessageQuery): { rows: MessageRow[]; total: number } {
  const hits = [...all]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((m) => matchesQuery(m, q));
  return { rows: hits.slice(0, q.limit), total: hits.length };
}

export function countTabs(all: Pick<MessageRow, 'status'>[]): Record<MessageTab, number> {
  return {
    new: all.filter((m) => m.status === 'new').length,
    read: all.filter((m) => m.status === 'read').length,
    replied: all.filter((m) => m.status === 'replied').length,
    archived: all.filter((m) => m.status === 'archived').length,
    all: all.filter((m) => m.status !== 'archived').length,
  };
}

/** PostgREST `or=` filter for a search across the four text columns. */
export function searchFilter(search: string | undefined): string | null {
  const s = cleanSearch(search);
  if (!s) return null;
  return ['name', 'email', 'subject', 'body'].map((c) => `${c}.ilike."*${s}*"`).join(',');
}
