/**
 * Sending a contact message (spec 07 §3.1): shared by the public sources (Supabase and
 * demo) and the Final Scene form. Pure parts are unit-tested.
 */
import type { MessageInsert } from './schemas';

export type SendErrorCode = 'rate_limited' | 'too_many_links' | 'invalid' | 'offline' | 'server';

export class SendError extends Error {
  readonly code: SendErrorCode;
  constructor(code: SendErrorCode) {
    super(code);
    this.name = 'SendError';
    this.code = code;
  }
}

/** What the visitor sees for each refusal (CT-7). */
export const sendErrorText: Record<SendErrorCode, string> = {
  rate_limited: 'You’ve sent a few messages already. Please try again a little later, or email me directly.',
  too_many_links: 'That message has a lot of links. Please keep it to 5 or fewer.',
  invalid: 'Something in the form isn’t quite right. Please check the fields and try again.',
  offline: 'Couldn’t reach the server. Check your connection and try again, or email me directly.',
  server: 'Something went wrong on my side. Please try again, or email me directly.',
};

/** Turns a database / network error into one of the codes above. */
export function sendErrorCode(
  error: { message?: string; code?: string; status?: number } | null,
): SendErrorCode {
  const message = error?.message ?? '';
  if (message === 'rate_limited' || error?.code === 'PT429' || error?.status === 429) return 'rate_limited';
  if (message === 'too_many_links' || error?.code === 'PT422') return 'too_many_links';
  if (error?.code && /^(23|22)/.test(error.code)) return 'invalid'; // check / data errors
  if (/fetch|network|load failed|timed? ?out/i.test(message) && !error?.code) return 'offline';
  return 'server';
}

/** The same link count the database uses (SP-5). */
export const MAX_LINKS = 5;
export const countLinks = (text: string) => (text.match(/(https?:\/\/|www\.)/gi) ?? []).length;

/** Sends shorter than this after the form appeared are treated as bots (SP-2). */
export const MIN_FILL_MS = 3000;

/**
 * Bots: a filled honeypot or a send faster than a person could type. They are shown
 * success but nothing is stored (SP-1, SP-2).
 */
export function looksLikeBot(honeypot: string, shownAt: number, now: number): boolean {
  return honeypot.trim() !== '' || now - shownAt < MIN_FILL_MS;
}

/** Only the columns a visitor may send; budget only for freelance (CT-3, AC-7.3). */
export function toInsert(v: {
  kind: MessageInsert['kind'];
  name: string;
  email: string;
  subject: string;
  body: string;
  budget: string;
}): MessageInsert {
  const kind = v.kind ?? 'general';
  return {
    kind,
    name: v.name.trim(),
    email: v.email.trim(),
    subject: v.subject.trim(),
    body: v.body.trim(),
    budget: kind === 'freelance' && v.budget.trim() ? v.budget.trim() : null,
  };
}
