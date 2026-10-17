/**
 * Dates for the content chapters (spec 06 TL-3, TL-6). Pure, so it's unit-tested.
 * Dates are stored as `YYYY-MM-DD` and treated as calendar dates (UTC), so they never
 * shift with the visitor's time zone.
 */

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: (m ?? 1) - 1, d: d ?? 1 };
};

/** Today as `YYYY-MM-DD` (UTC). */
export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);

/** "Jul 2023" in the visitor's language. */
export function formatMonth(iso: string, locale?: string): string {
  const { y, m } = parse(iso);
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m, 1)),
  );
}

/** "Jul 2023 – Present" / "Feb 2024 – Mar 2025". */
export function formatRange(start: string, end: string | null, locale?: string): string {
  return `${formatMonth(start, locale)} – ${end ? formatMonth(end, locale) : 'Present'}`;
}

/** Whole months from `start` to `end` (inclusive of the start month, so Jan–Jan is 1). */
export function monthsBetween(start: string, end: string): number {
  const a = parse(start);
  const b = parse(end);
  return Math.max(1, (b.y - a.y) * 12 + (b.m - a.m) + 1);
}

/** "2y 4m", "1y", "5m"; an open role counts to `today`. */
export function formatDuration(start: string, end: string | null, today = todayIso()): string {
  const months = monthsBetween(start, end ?? today);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return `${y}y ${m}m`;
  if (y) return `${y}y`;
  return `${m}m`;
}

/** A date as a fractional year (2023.5 = start of July), for placing things on a ruler. */
export function yearFraction(iso: string): number {
  const { y, m, d } = parse(iso);
  return y + m / 12 + (d - 1) / 365;
}

/** "Jul 2023" for a fractional year (the playhead's label). */
export function labelForYearFraction(f: number, locale?: string): string {
  const y = Math.floor(f);
  const m = Math.min(11, Math.max(0, Math.floor((f - y) * 12)));
  return formatMonth(`${y}-${String(m + 1).padStart(2, '0')}-01`, locale);
}
