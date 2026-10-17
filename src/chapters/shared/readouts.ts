/**
 * About readouts (spec 06 AB-3): numbers worked out from the published data. Pure, so
 * it's unit-tested. A readout with nothing to count is left out.
 */
import { monthsBetween, todayIso } from './dates';

export interface Readout {
  key: string;
  value: number;
  /** shown after the number, e.g. "+" for "3+ years" */
  suffix: string;
  label: string;
}

interface Input {
  experience: { start_date: string }[];
  projects: unknown[];
  achievements: { kind: string }[];
}

/** Whole years since the earliest start date, and whether there's more than that ("3+"). */
export function yearsSince(starts: string[], today = todayIso()): { years: number; more: boolean } {
  if (!starts.length) return { years: 0, more: false };
  const earliest = [...starts].sort()[0]!;
  const months = monthsBetween(earliest, today) - 1; // completed months
  return { years: Math.floor(months / 12), more: months % 12 > 0 };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function readouts({ experience, projects, achievements }: Input, today = todayIso()): Readout[] {
  const { years, more } = yearsSince(
    experience.map((e) => e.start_date),
    today,
  );
  const certs = achievements.filter((a) => a.kind === 'certification').length;
  const awards = achievements.filter((a) => a.kind === 'award' || a.kind === 'recognition').length;
  const all: Readout[] = [
    {
      key: 'years',
      value: years,
      suffix: more ? '+' : '',
      label: plural(years, 'year building', 'years building'),
    },
    { key: 'roles', value: experience.length, suffix: '', label: plural(experience.length, 'role', 'roles') },
    {
      key: 'projects',
      value: projects.length,
      suffix: '',
      label: plural(projects.length, 'project shipped', 'projects shipped'),
    },
    {
      key: 'certifications',
      value: certs,
      suffix: '',
      label: plural(certs, 'certification', 'certifications'),
    },
    { key: 'awards', value: awards, suffix: '', label: plural(awards, 'award', 'awards') },
  ];
  return all.filter((r) => r.value > 0);
}
