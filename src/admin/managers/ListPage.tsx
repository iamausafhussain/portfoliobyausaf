/** Generic manager list (spec 02 AD-10 – AD-16). */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { fileRefs, removeIfUnused } from '../data/files';
import { useAdminList, useCreateRow, useRemoveRow, useReorder, useUpdateRow } from '../data/hooks';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import type { Row } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useConfirm, useToast } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { Button, ButtonLink, IconButton, Notice, Skeleton, StatusBadge, Switch, ui } from '../ui/primitives';
import { SortableList } from './SortableList';
import { toFormValues, type ManagerConfig } from './types';
import styles from './list.module.css';

type Filter = 'all' | 'published' | 'drafts';

const timeAgo = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export function ListPage({
  config,
  header,
  where,
  extraActions,
}: {
  config: ManagerConfig;
  /** Overrides for the page header (custom sections). */
  header?: { title?: ReactNode; description?: ReactNode; back?: { to: string; label: string } };
  where?: { column: string; value: string };
  extraActions?: ReactNode;
}) {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useAdminList(config.table, where);
  const update = useUpdateRow(config.table);
  const remove = useRemoveRow(config.table);
  const create = useCreateRow(config.table);
  const reorder = useReorder(config.table, where);
  const [query, setQuery] = useState('');
  /** Publish switches flip immediately; the server result confirms or reverts (AD-12). */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => list.data ?? [], [list.data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'published' && !r.is_published) return false;
      if (filter === 'drafts' && r.is_published) return false;
      if (!q) return true;
      return `${config.title(r)} ${config.subtitle?.(r) ?? ''}`.toLowerCase().includes(q);
    });
  }, [rows, query, filter, config]);

  const filtering = query.trim() !== '' || filter !== 'all';
  const counts = {
    all: rows.length,
    published: rows.filter((r) => r.is_published).length,
    drafts: rows.filter((r) => !r.is_published).length,
  };

  const fail = (e: unknown) => toast.error(isRepoError(e) ? e.message : 'Something went wrong.');

  const togglePublished = (row: Row, value: boolean) => {
    setPending((p) => ({ ...p, [row.id]: value }));
    update.mutate(
      { id: row.id, values: { is_published: value }, expectedUpdatedAt: null },
      {
        onSuccess: () => toast.success(`${config.title(row)} ${value ? 'published' : 'moved to drafts'}.`),
        onError: fail,
        onSettled: () =>
          setPending((p) => {
            const next = { ...p };
            delete next[row.id];
            return next;
          }),
      },
    );
  };
  const isPublished = (row: Row) => pending[row.id] ?? !!row.is_published;

  const onReorder = (ids: string[]) =>
    reorder.mutate(ids, {
      onError: (e) => {
        fail(e);
      },
    });

  const duplicate = (row: Row) => {
    const values = config.duplicate ? config.duplicate(row, rows) : toFormValues(row);
    create.mutate(
      { ...values, ...config.fixed, is_published: false, sort_order: rows.length },
      {
        onSuccess: (created) => toast.success(`Created a draft copy: ${config.title(created)}.`),
        onError: fail,
      },
    );
  };

  const del = async (row: Row) => {
    const details = config.deleteDetails ? await config.deleteDetails(row, repo) : null;
    const ok = await confirm({
      title: `Delete “${config.title(row)}”?`,
      body: (
        <>
          {details}
          <p>This can&rsquo;t be undone. Files used only by this {config.singular} are deleted too.</p>
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    remove.mutate(row.id, {
      onSuccess: () => {
        toast.success(`Deleted ${config.title(row)}.`);
        void removeIfUnused(repo, fileRefs(row));
      },
      onError: fail,
    });
  };

  /* grouping (skills by category) */
  const groups = useMemo(() => {
    if (!config.groupBy) return [{ name: '', items: visible }];
    const map = new Map<string, Row[]>();
    for (const r of visible) map.set(config.groupBy(r), [...(map.get(config.groupBy(r)) ?? []), r]);
    return [...map].map(([name, items]) => ({ name, items }));
  }, [visible, config]);

  const reorderGroup = (groupIndex: number, ids: string[]) => {
    const all = groups.flatMap((g, i) => (i === groupIndex ? ids : g.items.map((r) => r.id)));
    onReorder(all);
  };

  const renderRow = (row: Row, handle: ReactNode) => {
    const img = config.image?.(row);
    const title = config.title(row);
    return (
      <div className={styles.rowInner}>
        {handle}
        {config.image &&
          (img ? (
            <img className={styles.thumb} src={repo.files.url(img.path)} alt="" loading="lazy" />
          ) : (
            <span className={styles.thumbEmpty} aria-hidden>
              <Icon name="image" />
            </span>
          ))}
        <div className={styles.text}>
          <Link to={`/admin/${config.path}/${row.id}`} className={styles.title}>
            {title}
          </Link>
          <span className={styles.meta}>
            {config.subtitle?.(row) ? <span>{config.subtitle(row)} · </span> : null}
            <span>Updated {timeAgo(row.updated_at)}</span>
          </span>
        </div>
        <div className={styles.status}>
          <StatusBadge published={isPublished(row)} />
        </div>
        <div className={styles.actions}>
          {config.rowLinks?.(row).map((l) => (
            <ButtonLink key={l.to} to={l.to} className={ui.small}>
              {l.label}
            </ButtonLink>
          ))}
          <Switch
            checked={isPublished(row)}
            onChange={(v) => togglePublished(row, v)}
            label={`${isPublished(row) ? 'Unpublish' : 'Publish'} ${title}`}
            hideLabel
          />
          <IconButton icon="copy" label={`Duplicate ${title}`} onClick={() => duplicate(row)} />
          <IconButton icon="trash" label={`Delete ${title}`} onClick={() => del(row)} />
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={header?.title ?? config.plural}
        description={header?.description ?? config.description}
        back={header?.back}
        actions={
          <>
            {extraActions}
            <ButtonLink to={`/admin/${config.path}/new`} variant="primary" icon="plus">
              New {config.singular}
            </ButtonLink>
          </>
        }
      />
      <PageBody>
        {config.ListNotice && <config.ListNotice />}
        {list.isError && (
          <Notice
            tone="error"
            action={
              <Button size="small" onClick={() => list.refetch()}>
                Retry
              </Button>
            }
          >
            {isRepoError(list.error) ? list.error.message : "Couldn't load this list."}
          </Notice>
        )}

        {rows.length > 0 && (
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <Icon name="search" />
              <span className={ui.visuallyHidden}>Search {config.plural.toLowerCase()}</span>
              <input
                className={ui.input}
                type="search"
                placeholder={`Search ${config.plural.toLowerCase()}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className={styles.filters} role="group" aria-label="Show">
              {(['all', 'published', 'drafts'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  className={styles.chip}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'published' ? 'Published' : 'Drafts'} <span>{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {filtering && rows.length > 0 && <p className={ui.help}>Clear the search and filters to reorder.</p>}

        {list.isPending ? (
          <div className={styles.skeletons}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height="4rem" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            <h2 className={styles.emptyTitle}>No {config.plural.toLowerCase()} yet</h2>
            <p className={ui.help}>{config.emptyText}</p>
            <ButtonLink to={`/admin/${config.path}/new`} variant="primary" icon="plus">
              Add the first {config.singular}
            </ButtonLink>
          </div>
        ) : visible.length === 0 ? (
          <p className={ui.help}>Nothing matches.</p>
        ) : (
          groups.map((g, gi) => (
            <section key={g.name || 'all'} aria-label={g.name || undefined} className={styles.group}>
              {g.name && <h2 className={`label ${styles.groupName}`}>{g.name}</h2>}
              <SortableList
                items={g.items}
                disabled={filtering || reorder.isPending}
                label={config.title}
                onReorder={(ids) => (config.groupBy ? reorderGroup(gi, ids) : onReorder(ids))}
                renderItem={renderRow}
              />
            </section>
          ))
        )}
      </PageBody>
    </>
  );
}
