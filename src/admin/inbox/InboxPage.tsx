/**
 * Inbox (spec 07 §2.4): messages from the contact form, newest first, with status tabs,
 * kind filters and search. Desktop shows the list and the open message side by side;
 * phones show one at a time.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useInboxCounts, useInboxList } from '../data/hooks';
import { inTab } from '../repository/messages';
import { isRepoError } from '../repository/errors';
import { messageTabs, type MessageKind, type MessageTab } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { Icon } from '../ui/Icon';
import { Button, Notice, Skeleton } from '../ui/primitives';
import listStyles from '../managers/list.module.css';
import {
  fullDate,
  kindFilters,
  kindName,
  neighbours,
  PAGE_SIZE,
  preview,
  readFilters,
  tabLabels,
  timeAgo,
  writeFilters,
} from './inbox';
import { MessageView } from './MessageView';
import styles from './inbox.module.css';

const emptyText: Record<MessageTab, string> = {
  new: 'No new messages. You’re all caught up.',
  read: 'No read messages.',
  replied: 'No replied messages yet.',
  archived: 'Nothing archived.',
  all: 'No messages yet. They’ll appear here when someone uses the contact form.',
};

export function InboxPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = readFilters(params);
  const qs = writeFilters(filters);
  const [more, setMore] = useState({ key: qs, limit: PAGE_SIZE });
  const limit = more.key === qs ? more.limit : PAGE_SIZE;
  const [search, setSearch] = useState(filters.q);

  const list = useInboxList({ tab: filters.tab, kind: filters.kind, search: filters.q, limit });
  const counts = useInboxCounts();
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const { newer, older } = neighbours(rows, id);
  // the clock for "2 h ago": when the list was loaded
  const now = list.dataUpdatedAt;

  const update = (patch: Partial<{ tab: MessageTab; kind: MessageKind | null; q: string }>) => {
    const next = writeFilters({ ...filters, ...patch });
    setParams(new URLSearchParams(next.slice(1)), { replace: true });
  };

  // search as you type, without a request per key press. It reads the live address when it
  // fires, so it can't undo a navigation that happened meanwhile (opening or archiving a message).
  useEffect(() => {
    if (search.trim() === filters.q) return;
    const t = setTimeout(() => {
      const live = readFilters(new URLSearchParams(window.location.search));
      navigate(`${window.location.pathname}${writeFilters({ ...live, q: search })}`, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [search, filters.q, navigate]);

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Messages from the contact form on your site. A new message becomes read when you open it."
      />
      <PageBody wide>
        <div className={styles.inbox} data-open={id ? true : undefined}>
          <section className={styles.listPane} aria-label="Messages">
            <div className={styles.toolbar}>
              <div className={listStyles.filters} role="group" aria-label="Show">
                {messageTabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={listStyles.chip}
                    aria-pressed={filters.tab === t}
                    onClick={() => update({ tab: t })}
                    data-tab={t}
                  >
                    {tabLabels[t]} <span>{counts.data?.[t] ?? '–'}</span>
                  </button>
                ))}
              </div>
              <div className={styles.secondRow}>
                <div className={listStyles.filters} role="group" aria-label="About">
                  {kindFilters.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`${listStyles.chip} ${styles.kindChip}`}
                      aria-pressed={filters.kind === k}
                      onClick={() => update({ kind: filters.kind === k ? null : k })}
                      data-kind-filter={k}
                    >
                      {kindName(k)}
                    </button>
                  ))}
                </div>
                <label className={styles.search}>
                  <Icon name="search" size={16} />
                  <span className="sr-only">Search messages</span>
                  <input
                    type="search"
                    placeholder="Search name, email or text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {list.isError && (
              <Notice tone="error">
                {isRepoError(list.error) ? list.error.message : 'Couldn’t load your messages.'}
              </Notice>
            )}
            {list.isPending ? (
              <Skeleton height="16rem" />
            ) : rows.length === 0 ? (
              <p className={styles.empty}>
                {filters.q || filters.kind ? 'No messages match.' : emptyText[filters.tab]}
              </p>
            ) : (
              <>
                <ul className={styles.list} data-inbox-list>
                  {rows.map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/admin/inbox/${m.id}${qs}`}
                        className={styles.row}
                        data-status={m.status}
                        data-row={m.id}
                        aria-current={m.id === id ? 'page' : undefined}
                      >
                        <span className={styles.rowTop}>
                          {m.status === 'new' && (
                            <span className={styles.dot}>
                              <span className="sr-only">New: </span>
                            </span>
                          )}
                          <span className={styles.rowName}>{m.name}</span>
                          <time
                            className={styles.rowTime}
                            dateTime={m.created_at}
                            title={fullDate(m.created_at)}
                          >
                            {timeAgo(m.created_at, now)}
                          </time>
                        </span>
                        <span className={styles.rowBottom}>
                          <span className={styles.kind} data-kind={m.kind}>
                            {kindName(m.kind)}
                          </span>
                          <span className={styles.rowPreview}>{preview(m)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className={styles.listFoot}>
                  <span>
                    Showing {rows.length} of {total}
                  </span>
                  {rows.length < total && (
                    <Button
                      size="small"
                      onClick={() => setMore({ key: qs, limit: limit + PAGE_SIZE })}
                      busy={list.isFetching}
                    >
                      Load more
                    </Button>
                  )}
                </p>
              </>
            )}
          </section>

          <section className={styles.messagePane} aria-label="Message">
            {id ? (
              <MessageView
                key={id}
                id={id}
                newer={newer}
                older={older}
                qs={qs}
                tabKeeps={(status) => inTab({ status }, filters.tab)}
              />
            ) : (
              <p className={styles.pick}>
                <Icon name="mail" size={28} />
                Pick a message to read it.
              </p>
            )}
          </section>
        </div>
      </PageBody>
    </>
  );
}
