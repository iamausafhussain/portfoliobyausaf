/** Dashboard (spec 02 AD-60 – AD-63). */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { adminKeys, useAdminList, useNewMessageCount, useSettings } from '../data/hooks';
import { builtInManagers } from '../managers/configs';
import { useRepository } from '../repository';
import { formatBytes } from '../repository/errors';
import { buckets, type Row } from '../repository/types';
import { SalesCard } from '../shop/SalesCard';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { Icon } from '../ui/Icon';
import { ButtonLink, Skeleton } from '../ui/primitives';
import styles from './pages.module.css';

const managers = Object.values(builtInManagers);

function Counts({ rows }: { rows: Row[] | undefined }) {
  if (!rows) return <Skeleton height="1.5rem" width="6rem" />;
  const published = rows.filter((r) => r.is_published).length;
  return (
    <p className={styles.counts}>
      <span className={styles.big}>{published}</span> published
      {rows.length - published > 0 && (
        <span className={styles.drafts}>
          {' '}
          · {rows.length - published} draft{rows.length - published === 1 ? '' : 's'}
        </span>
      )}
    </p>
  );
}

function ManagerCard({
  path,
  plural,
}: {
  path: string;
  plural: string;
  table: Parameters<typeof useAdminList>[0];
}) {
  return (
    <Link to={`/admin/${path}`} className={styles.cardLink}>
      <span className={styles.cardTitle}>{plural}</span>
    </Link>
  );
}

export function DashboardPage() {
  const repo = useRepository();
  const settings = useSettings();
  const messages = useNewMessageCount();
  const lists = {
    hero: useAdminList('hero_media'),
    projects: useAdminList('projects'),
    achievements: useAdminList('achievements'),
    experience: useAdminList('experience'),
    skills: useAdminList('skills'),
    testimonials: useAdminList('testimonials'),
  };
  const sections = useAdminList('custom_sections');
  const storage = useQuery({
    queryKey: [...adminKeys.files, 'total'],
    queryFn: async () => {
      const all = await Promise.all(buckets.map((b) => repo.files.listAll(b)));
      return all.flat().reduce((sum, f) => sum + f.size, 0);
    },
    staleTime: 0,
  });

  const attention: { text: string; to: string }[] = [];
  const projects = lists.projects.data ?? [];
  for (const p of projects.filter((p) => !p.cover)) {
    attention.push({ text: `“${String(p.title)}” has no cover image`, to: `/admin/projects/${p.id}` });
  }
  if (lists.hero.data && !lists.hero.data.some((h) => h.is_published)) {
    attention.push({
      text: 'No published hero clip — the opening scene shows a still image',
      to: '/admin/hero',
    });
  }
  const drafts = Object.entries(lists).reduce(
    (n, [, q]) => n + (q.data ?? []).filter((r) => !r.is_published).length,
    0,
  );
  if (drafts > 0)
    attention.push({
      text: `${drafts} draft${drafts === 1 ? '' : 's'} not yet published`,
      to: '/admin/projects',
    });
  if (settings.data && !settings.data.resume_path) {
    attention.push({ text: 'No resume uploaded yet', to: '/admin/settings' });
  }

  const name = settings.data ? String(settings.data.display_name).split(' ')[0] : '';

  return (
    <>
      <PageHeader
        title={name ? `Hello, ${name}` : 'Dashboard'}
        description="What's on the site, and what needs attention."
        actions={
          <ButtonLink to="/admin/projects/new" variant="primary" icon="plus">
            New project
          </ButtonLink>
        }
      />
      <PageBody wide>
        <div className={styles.statGrid}>
          {managers.map((m) => {
            const key = m.path as keyof typeof lists;
            return (
              <div key={m.path} className={styles.stat}>
                <ManagerCard path={m.path} plural={m.plural} table={m.table} />
                <Counts rows={lists[key]?.data} />
              </div>
            );
          })}
          <div className={styles.stat}>
            <Link to="/admin/sections" className={styles.cardLink}>
              <span className={styles.cardTitle}>Your sections</span>
            </Link>
            {sections.data ? (
              <p className={styles.counts}>
                <span className={styles.big}>{sections.data.length}</span> section
                {sections.data.length === 1 ? '' : 's'}
              </p>
            ) : (
              <Skeleton height="1.5rem" width="6rem" />
            )}
          </div>
          <div className={styles.stat}>
            <Link to="/admin/inbox" className={styles.cardLink}>
              <span className={styles.cardTitle}>New messages</span>
            </Link>
            <p className={styles.counts}>
              <span className={styles.big}>{messages.data ?? '–'}</span> unread
            </p>
            <span className={styles.drafts}>From the contact form on your site.</span>
          </div>
          <SalesCard />
          <div className={styles.stat}>
            <Link to="/admin/media" className={styles.cardLink}>
              <span className={styles.cardTitle}>Storage</span>
            </Link>
            <p className={styles.counts}>
              <span className={styles.big}>
                {storage.data !== undefined ? formatBytes(storage.data) : '–'}
              </span>{' '}
              used
            </p>
          </div>
        </div>

        <section className={styles.panel} aria-labelledby="attention">
          <h2 id="attention" className={styles.panelTitle}>
            Needs attention
          </h2>
          {attention.length === 0 ? (
            <p className={styles.allGood}>
              <Icon name="check" /> Everything looks good.
            </p>
          ) : (
            <ul className={styles.attention}>
              {attention.map((a) => (
                <li key={a.text}>
                  <Icon name="alert" />
                  <Link to={a.to}>{a.text}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageBody>
    </>
  );
}
