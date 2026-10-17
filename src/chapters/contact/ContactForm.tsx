/**
 * The Final Scene form (spec 07 CT-2 – CT-8, SP-1, SP-2): a film slate with the four
 * choices, the fields, validation that matches the database, a draft kept for the tab, and
 * clear states for sending, sent and failed.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { looksLikeBot, SendError, sendErrorText, toInsert, type SendErrorCode } from '../../data/contact';
import { getPublicSource } from '../../data/source';
import { useMotionAllowed } from '../shared/useMotionAllowed';
import {
  COUNTER_FROM,
  firstError,
  kinds,
  LIMITS,
  mailtoFor,
  slateDate,
  validate,
  type Draft,
  type Field,
} from './contactForm';
import { Slate } from './Slate';
import { useContactDraft } from './useContactDraft';
import styles from './contact.module.css';

type State = 'editing' | 'sending' | 'sent' | 'failed';

interface FieldProps {
  id: Field;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: (a11y: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
    'aria-required': boolean | undefined;
  }) => ReactNode;
}

function FormField({ id, label, required, hint, error, children }: FieldProps) {
  const inputId = `contact-${id}`;
  const describedBy = [error ? `${inputId}-error` : '', hint ? `${inputId}-hint` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.field} data-field={id} data-invalid={error ? true : undefined}>
      <label htmlFor={inputId} className={styles.fieldLabel}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden>
            {' '}
            *
          </span>
        ) : (
          <span className={styles.optional}> (optional)</span>
        )}
      </label>
      {children({
        id: inputId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
        'aria-required': required || undefined,
      })}
      {hint && (
        <p id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function ContactForm({ scene, publicEmail }: { scene: number; publicEmail?: string | null }) {
  const [draft, setDraft, clearDraft] = useContactDraft();
  const [state, setState] = useState<State>('editing');
  const [failure, setFailure] = useState<SendErrorCode | null>(null);
  const [take, setTake] = useState(1);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sentAs, setSentAs] = useState<{ name: string; email: string } | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const shownAt = useRef(0);
  const refs = useRef<Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const wrapRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const motion = useMotionAllowed();
  const [date] = useState(() => slateDate());

  // the time trap counts from when the form first appeared (not from a failed attempt)
  // (event timestamps and performance.now() share one clock)
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (state === 'sent') wrapRef.current?.focus();
    if (state === 'failed') alertRef.current?.focus();
  }, [state]);

  const errors = validate(draft);
  const shown = (f: Field) => (submitted || touched[f] ? errors[f] : undefined);
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (state === 'failed') setState('editing');
  };
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    setSubmitted(true);
    const bad = firstError(errors);
    if (bad) {
      refs.current[bad]?.focus();
      return;
    }
    const who = { name: draft.name.trim(), email: draft.email.trim() };
    // bots see a normal success, but nothing is sent (SP-1, SP-2)
    if (looksLikeBot(honeypot, shownAt.current, e.timeStamp)) {
      setSentAs(who);
      setState('sent');
      return;
    }
    setState('sending');
    setFailure(null);
    try {
      const source = await getPublicSource();
      await source.sendMessage(toInsert(draft));
      setSentAs(who);
      clearDraft();
      setTouched({});
      setSubmitted(false);
      setState('sent');
    } catch (err) {
      setFailure(err instanceof SendError ? err.code : 'server');
      setTake((t) => t + 1);
      setState('failed');
    }
  }

  function sendAnother(e: { timeStamp: number }) {
    setSentAs(null);
    setFailure(null);
    setTake((t) => t + 1);
    setState('editing');
    shownAt.current = e.timeStamp;
    requestAnimationFrame(() => refs.current.name?.focus());
  }

  const bodyLength = draft.body.length;

  return (
    <div className={styles.slate} data-state={state} data-motion={motion || undefined} data-contact-slate>
      <Slate scene={scene} take={take} date={date} closed={state === 'sent'} />
      <p className="sr-only" role="status" aria-live="polite">
        {state === 'sending'
          ? 'Sending your message…'
          : state === 'sent'
            ? 'Message sent. That’s a wrap.'
            : ''}
      </p>

      {state === 'sent' && sentAs ? (
        <div className={styles.wrap} data-wrap>
          <h3 ref={wrapRef} tabIndex={-1} className={styles.wrapTitle}>
            That&rsquo;s a wrap.
          </h3>
          <p className={styles.wrapText}>
            Thanks, {sentAs.name}. Your message is in, and I&rsquo;ll reply to{' '}
            <strong className={styles.wrapEmail}>{sentAs.email}</strong>.
          </p>
          <p className={styles.muted}>I usually reply within a couple of days.</p>
          <button type="button" className={styles.secondary} onClick={sendAnother}>
            Send another message
          </button>
        </div>
      ) : (
        <form className={styles.form} noValidate onSubmit={onSubmit} data-contact aria-label="Contact form">
          <fieldset className={styles.kinds}>
            <legend className={styles.fieldLabel}>What&rsquo;s this about?</legend>
            <div className={styles.chips}>
              {kinds.map((k) => (
                <label key={k.value} className={styles.chip}>
                  <input
                    type="radio"
                    name="kind"
                    value={k.value}
                    checked={draft.kind === k.value}
                    onChange={() => set({ kind: k.value })}
                  />
                  <span>{k.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.pair}>
            <FormField id="name" label="Name" required error={shown('name')}>
              {(a) => (
                <input
                  {...a}
                  ref={(el) => {
                    refs.current.name = el;
                  }}
                  type="text"
                  name="name"
                  autoComplete="name"
                  maxLength={LIMITS.name + 20}
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                  onBlur={blur('name')}
                />
              )}
            </FormField>
            <FormField id="email" label="Email" required error={shown('email')}>
              {(a) => (
                <input
                  {...a}
                  ref={(el) => {
                    refs.current.email = el;
                  }}
                  type="email"
                  name="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={LIMITS.email + 20}
                  value={draft.email}
                  onChange={(e) => set({ email: e.target.value })}
                  onBlur={blur('email')}
                />
              )}
            </FormField>
          </div>

          <FormField id="subject" label="Subject" error={shown('subject')}>
            {(a) => (
              <input
                {...a}
                ref={(el) => {
                  refs.current.subject = el;
                }}
                type="text"
                name="subject"
                maxLength={LIMITS.subject + 20}
                value={draft.subject}
                onChange={(e) => set({ subject: e.target.value })}
                onBlur={blur('subject')}
              />
            )}
          </FormField>

          <FormField
            id="body"
            label="Message"
            required
            error={shown('body')}
            hint={
              bodyLength >= COUNTER_FROM ? (
                <span data-counter>
                  {bodyLength.toLocaleString('en')} / {LIMITS.body.toLocaleString('en')}
                </span>
              ) : undefined
            }
          >
            {(a) => (
              <textarea
                {...a}
                ref={(el) => {
                  refs.current.body = el;
                }}
                name="message"
                rows={6}
                value={draft.body}
                onChange={(e) => set({ body: e.target.value })}
                onBlur={blur('body')}
              />
            )}
          </FormField>

          {draft.kind === 'freelance' && (
            <FormField
              id="budget"
              label="Budget"
              error={shown('budget')}
              hint="A rough range is fine, e.g. ₹50k–1L."
            >
              {(a) => (
                <input
                  {...a}
                  ref={(el) => {
                    refs.current.budget = el;
                  }}
                  type="text"
                  name="budget"
                  maxLength={LIMITS.budget + 20}
                  value={draft.budget}
                  onChange={(e) => set({ budget: e.target.value })}
                  onBlur={blur('budget')}
                />
              )}
            </FormField>
          )}

          {/* SP-1: people never see or reach this; bots tend to fill every field */}
          <div className={styles.trap} aria-hidden>
            <label>
              Website
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </label>
          </div>

          {state === 'failed' && failure && (
            <div ref={alertRef} tabIndex={-1} className={styles.failed} role="alert" data-failure={failure}>
              <p>{sendErrorText[failure]}</p>
              {publicEmail && (
                <p>
                  <a href={mailtoFor(publicEmail, draft)}>Email it to me instead</a>
                  <span className={styles.muted}> — your message will be filled in.</span>
                </p>
              )}
            </div>
          )}

          <div className={styles.submitRow}>
            <button type="submit" className={styles.send} aria-busy={state === 'sending' || undefined}>
              {state === 'sending' ? 'Sending…' : 'Send message'}
            </button>
            <p className={styles.note}>Goes straight to my inbox. Nothing else is done with it.</p>
          </div>
        </form>
      )}
    </div>
  );
}
