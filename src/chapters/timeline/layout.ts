/**
 * Timeline layout (spec 06 TL-1, §3.2). Pure, so it's unit-tested.
 * Roles become clips on tracks: each goes on the first track where it doesn't overlap the
 * clip before it (greedy interval packing). Open roles run to today.
 */
import { todayIso, yearFraction } from '../shared/dates';

export interface RoleSpan {
  id: string;
  start_date: string;
  end_date: string | null;
}

export interface Clip {
  id: string;
  start: number; // fractional years
  end: number;
  track: number;
}

export interface TimelineLayout {
  clips: Clip[];
  tracks: number;
  from: number;
  to: number;
  /** whole years to label on the ruler */
  years: number[];
}

/** The ruler always spans at least this many years, so a single short role doesn't fill it edge to edge. */
export const MIN_SPAN = 2;

export function layoutTimeline(roles: RoleSpan[], today = todayIso()): TimelineLayout {
  const now = yearFraction(today);
  const sorted = [...roles].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const trackEnds: number[] = [];
  const clips: Clip[] = [];
  for (const r of sorted) {
    const start = yearFraction(r.start_date);
    // an end date means "to the end of that month"
    const end = r.end_date ? Math.min(now, yearFraction(r.end_date) + 1 / 12) : now;
    let track = trackEnds.findIndex((e) => e <= start + 1e-9);
    if (track < 0) track = trackEnds.push(0) - 1;
    trackEnds[track] = end;
    clips.push({ id: r.id, start, end: Math.max(end, start + 1 / 24), track });
  }
  if (!clips.length) return { clips, tracks: 0, from: Math.floor(now) - 1, to: now, years: [] };
  const to = Math.max(now, ...clips.map((c) => c.end));
  let from = Math.floor(Math.min(...clips.map((c) => c.start)));
  if (to - from < MIN_SPAN) from = Math.floor(to - MIN_SPAN);
  const years: number[] = [];
  for (let y = Math.ceil(from); y <= Math.floor(to); y++) years.push(y);
  return { clips, tracks: trackEnds.length, from, to, years };
}

/** Position on the ruler, 0–100 (%). */
export const pct = (t: number, from: number, to: number) => ((t - from) / Math.max(1e-6, to - from)) * 100;

/** Where the playhead is while reading a role: from its end back to its start as you scroll down (TL-2). */
export function playheadTime(clip: Pick<Clip, 'start' | 'end'>, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return clip.end - (clip.end - clip.start) * p;
}

export const employmentLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
  internship: 'Internship',
};
