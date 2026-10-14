/** Media library: every stored file, where it is used, and cleanup of unused files (AD-38). */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { buildUsageIndex, type FileUsage } from '../data/files';
import { adminKeys } from '../data/hooks';
import { useRepository } from '../repository';
import { formatBytes, isRepoError } from '../repository/errors';
import { buckets, type StoredFile } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useConfirm, useToast } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { Button, Notice, Skeleton, ui } from '../ui/primitives';
import listStyles from '../managers/list.module.css';
import styles from './pages.module.css';

const usageLink = (u: FileUsage): string => {
  if (u.table === 'site_settings') return '/admin/settings';
  const paths: Record<string, string> = {
    hero_media: 'hero',
    projects: 'projects',
    achievements: 'achievements',
    experience: 'experience',
    skills: 'skills',
    testimonials: 'testimonials',
    custom_sections: 'sections',
  };
  if (u.table === 'custom_items') return '/admin/sections';
  return `/admin/${paths[u.table]}/${u.id}`;
};

type Filter = 'all' | 'unused' | 'images' | 'videos' | 'documents';

export function MediaPage() {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({
    queryKey: [...adminKeys.files, 'library'],
    queryFn: async () => {
      const [files, usage] = await Promise.all([
        Promise.all(buckets.map((b) => repo.files.listAll(b))).then((x) => x.flat()),
        buildUsageIndex(repo),
      ]);
      return { files: files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), usage };
    },
    staleTime: 0,
  });

  const files = useMemo(() => query.data?.files ?? [], [query.data]);
  const usage = query.data?.usage;
  const unused = files.filter((f) => !usage?.has(f.path));
  const total = files.reduce((s, f) => s + f.size, 0);
  const visible = files.filter((f) => {
    if (filter === 'unused') return !usage?.has(f.path);
    if (filter === 'all') return true;
    return f.path.startsWith(`${filter}/`);
  });

  const refresh = () => qc.invalidateQueries({ queryKey: adminKeys.files });

  const removeFiles = async (list: StoredFile[]) => {
    const ok = await confirm({
      title: list.length === 1 ? 'Delete this file?' : `Delete ${list.length} unused files?`,
      body: <p>Frees {formatBytes(list.reduce((s, f) => s + f.size, 0))}. This can&rsquo;t be undone.</p>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      // re-check right before deleting, in case something started using a file
      const fresh = await buildUsageIndex(repo);
      const safe = list.filter((f) => !fresh.has(f.path)).map((f) => f.path);
      await repo.files.remove(safe);
      toast.success(`Deleted ${safe.length} file${safe.length === 1 ? '' : 's'}.`);
    } catch (e) {
      toast.error(isRepoError(e) ? e.message : 'Could not delete.');
    } finally {
      await refresh();
    }
  };

  const counts: Record<Filter, number> = {
    all: files.length,
    unused: unused.length,
    images: files.filter((f) => f.path.startsWith('images/')).length,
    videos: files.filter((f) => f.path.startsWith('videos/')).length,
    documents: files.filter((f) => f.path.startsWith('documents/')).length,
  };

  return (
    <>
      <PageHeader
        title="Media library"
        description={
          query.data
            ? `${files.length} files · ${formatBytes(total)} used. Files nothing uses can be deleted to stay within the free storage tier.`
            : 'Every uploaded file and where it is used.'
        }
        actions={
          unused.length > 0 ? (
            <Button variant="danger" icon="trash" onClick={() => removeFiles(unused)}>
              Delete {unused.length} unused
            </Button>
          ) : undefined
        }
      />
      <PageBody wide>
        {query.isError && (
          <Notice tone="error">
            {isRepoError(query.error) ? query.error.message : "Couldn't load files."}
          </Notice>
        )}
        <div className={listStyles.filters} role="group" aria-label="Show">
          {(['all', 'unused', 'images', 'videos', 'documents'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={listStyles.chip}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f[0]!.toUpperCase() + f.slice(1)} <span>{counts[f]}</span>
            </button>
          ))}
        </div>
        {query.isPending ? (
          <Skeleton height="12rem" />
        ) : visible.length === 0 ? (
          <p className={ui.help}>{filter === 'unused' ? 'Every file is in use.' : 'No files here yet.'}</p>
        ) : (
          <ul className={styles.mediaGrid}>
            {visible.map((f) => {
              const uses = usage?.get(f.path) ?? [];
              const name = f.path.split('/').slice(1).join('/');
              return (
                <li key={f.path} className={styles.mediaItem} data-unused={uses.length === 0 || undefined}>
                  {f.path.startsWith('images/') ? (
                    <img className={styles.mediaPreview} src={repo.files.url(f.path)} alt="" loading="lazy" />
                  ) : (
                    <span className={styles.mediaIcon}>
                      <Icon name={f.path.startsWith('videos/') ? 'film' : 'file'} size={28} />
                    </span>
                  )}
                  <span className={styles.mediaName}>{name}</span>
                  <div className={styles.mediaRow}>
                    <span className={ui.help}>{formatBytes(f.size)}</span>
                    <a href={repo.files.url(f.path)} target="_blank" rel="noreferrer" className={ui.help}>
                      Open
                    </a>
                  </div>
                  {uses.length ? (
                    <>
                      <span className="label">Used by</span>
                      <ul className={styles.usage}>
                        {uses.map((u) => (
                          <li key={`${u.table}-${u.id}`}>
                            <Link to={usageLink(u)}>{u.label}</Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div className={styles.mediaRow}>
                      <span className={styles.unused}>Unused</span>
                      <Button size="small" variant="ghost" icon="trash" onClick={() => removeFiles([f])}>
                        Delete
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
