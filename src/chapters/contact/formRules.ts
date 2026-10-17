/**
 * Final Scene form rules (spec 07 CT-2 – CT-8). Pure, so it's unit-tested. The limits match
 * the database (spec 01 messages) and the shared Zod schema.
 */
import type { MessageInsert } from '../../data/schemas';

export type Kind = NonNullable<MessageInsert['kind']>;

/** CT-2 / Q3: the four choices, in order; "Just saying hi" is the default. */
export const kinds: { value: Kind; label: string }[] = [
  { value: 'hire', label: 'Hiring' },
  { value: 'freelance', label: 'Freelance project' },
  { value: 'collab', label: 'Collaboration' },
  { value: 'general', label: 'Just saying hi' },
];
export const kindLabel = (k: Kind) => kinds.find((x) => x.value === k)?.label ?? k;

export interface Draft {
  kind: Kind;
  name: string;
  email: string;
  subject: string;
  body: string;
  budget: string;
}
export type Field = Exclude<keyof Draft, 'kind'>;
export const fieldOrder: Field[] = ['name', 'email', 'subject', 'body', 'budget'];

export const emptyDraft = (): Draft => ({
  kind: 'general',
  name: '',
  email: '',
  subject: '',
  body: '',
  budget: '',
});

export const LIMITS = { name: 80, email: 254, subject: 150, body: 5000, budget: 60, bodyMin: 10 } as const;
/** The counter shows once the message is this long (CT-3). */
export const COUNTER_FROM = 4000;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** One message per field that needs fixing; empty when the form can be sent. */
export function validate(d: Draft): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  const name = d.name.trim();
  if (!name) e.name = 'Please add your name.';
  else if (name.length > LIMITS.name) e.name = `Keep it to ${LIMITS.name} characters.`;

  const email = d.email.trim();
  if (!email) e.email = 'Please add your email so I can reply.';
  else if (email.length > LIMITS.email || !EMAIL.test(email)) e.email = 'Enter a valid email address.';

  if (d.subject.trim().length > LIMITS.subject) e.subject = `Keep it to ${LIMITS.subject} characters.`;

  const body = d.body.trim();
  if (!body) e.body = 'Please write a message.';
  else if (body.length < LIMITS.bodyMin) e.body = `Please write at least ${LIMITS.bodyMin} characters.`;
  else if (body.length > LIMITS.body) e.body = `Keep it to ${LIMITS.body.toLocaleString('en')} characters.`;

  if (d.kind === 'freelance' && d.budget.trim().length > LIMITS.budget)
    e.budget = `Keep it to ${LIMITS.budget} characters.`;
  return e;
}

export const firstError = (errors: Partial<Record<Field, string>>): Field | undefined =>
  fieldOrder.find((f) => errors[f]);

/** A pre-filled email to you when sending through the form didn't work (CT-7). */
export function mailtoFor(to: string, d: Draft): string {
  const subject = d.subject.trim() || `${kindLabel(d.kind)} — from ${d.name.trim() || 'your site'}`;
  const lines = [d.body.trim()];
  if (d.kind === 'freelance' && d.budget.trim()) lines.push('', `Budget: ${d.budget.trim()}`);
  if (d.name.trim()) lines.push('', `— ${d.name.trim()}`);
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

/** "17 OCT 2026" for the slate (CT-4). */
export function slateDate(now = new Date(), locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' })
    .format(now)
    .toUpperCase();
}

/** A stored draft, if it looks like one (CT-8). */
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Draft>;
    const base = emptyDraft();
    const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max + 200) : '');
    return {
      kind: kinds.some((k) => k.value === v.kind) ? (v.kind as Kind) : base.kind,
      name: str(v.name, LIMITS.name),
      email: str(v.email, LIMITS.email),
      subject: str(v.subject, LIMITS.subject),
      body: str(v.body, LIMITS.body),
      budget: str(v.budget, LIMITS.budget),
    };
  } catch {
    return null;
  }
}

export const isEmpty = (d: Draft) => !d.name && !d.email && !d.subject && !d.body && !d.budget;
