/**
 * One message in full (spec 07 IB-4 – IB-7): plain text only, the sender's details, and the
 * actions. A new message becomes read when it's opened.
 */
import { useEffect, useEffectEvent, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDeleteMessage, useMessage, useSetMessageStatus } from '../data/hooks';
import { isRepoError } from '../repository/errors';
import type { MessageStatus } from '../repository/types';
import { useConfirm, useToast } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { Button, Notice, Skeleton } from '../ui/primitives';
import { fullDate, kindName, replyMailto, shortcutFor, statusLabels } from './inbox';
import styles from './inbox.module.css';

export function MessageView({
  id,
  newer,
  older,
  qs,
  tabKeeps,
}: {
  id: string;
  newer: string | null;
  older: string | null;
  /** current filters, kept in every link */
  qs: string;
  /** whether a message with this status still belongs in the current tab */
  tabKeeps: (status: MessageStatus) => boolean;
}) {
  const query = useMessage(id);
  const setStatus = useSetMessageStatus();
  const remove = useDeleteMessage();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const autoRead = useRef(new Set<string>());
  const m = query.data;

  const go = (target: string | null) =>
    navigate(target ? `/admin/inbox/${target}${qs}` : `/admin/inbox${qs}`);
  const fail = (e: unknown) => toast.error(isRepoError(e) ? e.message : 'Couldn’t update the message.');

  // opening a new message marks it read, once (IB-4)
  useEffect(() => {
    if (!m || m.status !== 'new' || autoRead.current.has(m.id)) return;
    autoRead.current.add(m.id);
    setStatus.mutate({ id: m.id, status: 'read', quiet: true });
  }, [m, setStatus]);

  // a new message gets focus, so keyboard and screen-reader users land on it
  useEffect(() => {
    const h = headingRef.current;
    if (!m?.id || !h) return;
    h.focus({ preventScroll: true });
    // one-at-a-time layout (phones, narrow windows): start at the top of the message
    if (matchMedia('(max-width: 1099px)').matches) h.closest('article')?.scrollIntoView({ block: 'start' });
  }, [m?.id]);

  async function change(status: MessageStatus, message: string) {
    if (!m) return;
    try {
      await setStatus.mutateAsync({ id: m.id, status });
      toast.success(message);
      // leaving the tab you're looking at: move on to the next message
      if (!tabKeeps(status)) go(older ?? newer);
    } catch (e) {
      fail(e);
    }
  }

  const archive = () =>
    m?.status === 'archived' ? change('read', 'Moved back to the inbox.') : change('archived', 'Archived.');

  async function del() {
    if (!m) return;
    const ok = await confirm({
      title: 'Delete this message?',
      body: `The message from ${m.name} will be deleted for good. This can’t be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(m.id);
      toast.success('Message deleted.');
      go(older ?? newer);
    } catch (e) {
      fail(e);
    }
  }

  async function copyEmail() {
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.email);
      toast.success('Email copied.');
    } catch {
      toast.error('Couldn’t copy. Select the address and copy it instead.');
    }
  }

  async function markUnread() {
    if (!m) return;
    try {
      await setStatus.mutateAsync({ id: m.id, status: 'new' });
      toast.success('Marked as unread.');
      go(null);
    } catch (e) {
      fail(e);
    }
  }

  // j / k / e (IB-7)
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    const action = shortcutFor(e);
    if (!action || document.querySelector('dialog[open]')) return;
    if (action === 'older' && older) go(older);
    else if (action === 'newer' && newer) go(newer);
    else if (action === 'archive' && m) void archive();
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onShortcut(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (query.isPending) {
    return (
      <div className={styles.message} aria-busy>
        <Skeleton height="2rem" width="60%" />
        <Skeleton height="10rem" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className={styles.message}>
        <Notice tone="error">
          {isRepoError(query.error) ? query.error.message : 'Couldn’t load this message.'}
        </Notice>
      </div>
    );
  }
  if (!m) {
    return (
      <div className={styles.message}>
        <p>This message no longer exists.</p>
        <Link to={`/admin/inbox${qs}`}>Back to the inbox</Link>
      </div>
    );
  }

  const busy = setStatus.isPending || remove.isPending;

  return (
    <article
      className={styles.message}
      aria-labelledby="message-title"
      data-message={m.id}
      data-status={m.status}
    >
      <div className={styles.messageNav}>
        <Link to={`/admin/inbox${qs}`} className={styles.backToList}>
          <Icon name="chevronLeft" size={16} /> Inbox
        </Link>
        <div className={styles.step}>
          <Button
            size="small"
            variant="ghost"
            icon="chevronLeft"
            disabled={!newer}
            onClick={() => go(newer)}
            aria-label="Newer message"
            title="Newer (k)"
          />
          <Button
            size="small"
            variant="ghost"
            icon="chevronRight"
            disabled={!older}
            onClick={() => go(older)}
            aria-label="Older message"
            title="Older (j)"
          />
        </div>
      </div>

      <header className={styles.messageHead}>
        <p className={styles.badges}>
          <span className={styles.kind} data-kind={m.kind}>
            {kindName(m.kind)}
          </span>
          <span className={styles.status}>{statusLabels[m.status]}</span>
        </p>
        <h2 id="message-title" ref={headingRef} tabIndex={-1} className={styles.messageTitle}>
          {m.subject.trim() || <span className={styles.muted}>(no subject)</span>}
        </h2>
        <dl className={styles.meta}>
          <div>
            <dt>From</dt>
            <dd>
              {m.name} <span className={styles.muted}>&lt;{m.email}&gt;</span>
            </dd>
          </div>
          <div>
            <dt>Sent</dt>
            <dd>
              <time dateTime={m.created_at}>{fullDate(m.created_at)}</time>
            </dd>
          </div>
          {m.budget && (
            <div>
              <dt>Budget</dt>
              <dd>{m.budget}</dd>
            </div>
          )}
        </dl>
      </header>

      {/* plain text: shown exactly as typed, nothing in it is a link or markup (IB-4) */}
      <div className={styles.body} data-message-body>
        {m.body}
      </div>

      <div className={styles.actions} role="group" aria-label="Message actions">
        <a
          className={styles.reply}
          href={replyMailto(m)}
          onClick={() => {
            if (m.status !== 'replied' && m.status !== 'archived')
              setStatus.mutate({ id: m.id, status: 'replied' }, { onError: fail });
          }}
        >
          <Icon name="reply" /> Reply
        </a>
        <Button icon="copy" onClick={copyEmail}>
          Copy email
        </Button>
        {m.status !== 'new' && (
          <Button icon="mail" onClick={markUnread} disabled={busy}>
            Mark as unread
          </Button>
        )}
        <Button icon="archive" onClick={archive} disabled={busy}>
          {m.status === 'archived' ? 'Move to inbox' : 'Archive'}
        </Button>
        <Button icon="trash" variant="danger" onClick={del} disabled={busy}>
          Delete
        </Button>
      </div>
      <p className={styles.shortcuts}>
        Shortcuts: <kbd>j</kbd> / <kbd>k</kbd> older and newer · <kbd>e</kbd> archive
      </p>
    </article>
  );
}
