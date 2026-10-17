/**
 * The email you get for each new contact message (spec 07 NT-1). Plain functions with no
 * Deno or network code, so the unit tests can import them.
 */

export interface MessageRecord {
  id: string;
  name: string;
  email: string;
  kind: 'hire' | 'freelance' | 'collab' | 'general';
  subject: string | null;
  body: string;
  budget: string | null;
  created_at: string;
}

export const kindLabels: Record<MessageRecord['kind'], string> = {
  hire: 'Hiring',
  freelance: 'Freelance project',
  collab: 'Collaboration',
  general: 'Just saying hi',
};

export interface AlertEmail {
  subject: string;
  text: string;
  html: string;
  replyTo: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A database webhook payload is an INSERT into public.messages with a usable record. */
export function messageFromPayload(payload: unknown): MessageRecord | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { type?: unknown; schema?: unknown; table?: unknown; record?: unknown };
  if (p.type !== 'INSERT' || p.table !== 'messages' || (p.schema && p.schema !== 'public')) return null;
  const r = p.record as Partial<MessageRecord> | undefined;
  if (!r || typeof r.id !== 'string' || typeof r.email !== 'string' || typeof r.body !== 'string')
    return null;
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    email: r.email,
    kind: r.kind && r.kind in kindLabels ? r.kind : 'general',
    subject: typeof r.subject === 'string' ? r.subject : null,
    body: r.body,
    budget: typeof r.budget === 'string' ? r.budget : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
  };
}

export function alertEmail(m: MessageRecord, siteUrl: string): AlertEmail {
  const kind = kindLabels[m.kind];
  const link = `${siteUrl.replace(/\/+$/, '')}/admin/inbox/${m.id}`;
  // keep header-safe: no line breaks, bounded length
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
  const subject = oneLine(`New message: ${kind} from ${m.name || m.email}`).slice(0, 180);
  const lines = [
    `${m.name} <${m.email}>`,
    `About: ${kind}`,
    ...(m.subject ? [`Subject: ${oneLine(m.subject)}`] : []),
    ...(m.budget ? [`Budget: ${oneLine(m.budget)}`] : []),
    '',
    m.body,
    '',
    `Open in your inbox: ${link}`,
    'Reply to this email to answer them directly.',
  ];
  const row = (label: string, value: string) =>
    `<tr><td style="padding:2px 12px 2px 0;color:#666">${label}</td><td>${escapeHtml(value)}</td></tr>`;
  const html = [
    '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    '<table style="border-collapse:collapse;margin-bottom:16px">',
    row('From', `${m.name} <${m.email}>`),
    row('About', kind),
    m.subject ? row('Subject', m.subject) : '',
    m.budget ? row('Budget', m.budget) : '',
    '</table>',
    `<div style="white-space:pre-wrap;border-left:3px solid #e8642c;padding-left:12px">${escapeHtml(m.body)}</div>`,
    `<p style="margin-top:20px"><a href="${escapeHtml(link)}">Open in your inbox</a> · reply to this email to answer them directly.</p>`,
    '</div>',
  ].join('');
  return { subject, text: lines.join('\n'), html, replyTo: m.email };
}

/** Constant-time comparison for the webhook secret. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
