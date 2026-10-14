/** /projects/:slug — plain readable version; styled properly in Part 5 (spec 03 RT-1). */
import Markdown from 'react-markdown';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '../app/NotFoundPage';
import { Img } from '../components/Img';
import { useProject } from '../data/queries/public';
import { useDocumentTitle } from '../shell/hooks';
import { useNavigateToChapter } from '../shell/useNavigateToChapter';
import styles from './pages.module.css';

const linkLabels: Record<string, string> = {
  live: 'Live site',
  repo: 'Code',
  case_study: 'Case study',
  video: 'Video',
};

export function Component() {
  const { slug = '' } = useParams();
  const q = useProject(slug);
  const goTo = useNavigateToChapter();
  const p = q.data;
  useDocumentTitle(q.isPending ? undefined : (p?.title ?? 'Scene not found'));

  if (q.isPending) {
    return (
      <article className={styles.page} aria-busy="true">
        <div className={styles.skeletonTitle} />
        <div className={styles.skeletonBlock} />
      </article>
    );
  }
  if (q.isError) {
    return (
      <article className={styles.page}>
        <h1 className={styles.title}>Couldn&rsquo;t load this project</h1>
        <p className={styles.muted}>Check your connection and try again.</p>
        <button type="button" className={styles.retry} onClick={() => q.refetch()}>
          Retry
        </button>
      </article>
    );
  }
  if (!p) return <NotFoundPage />;

  const links = Object.entries(p.links).filter((e): e is [string, string] => typeof e[1] === 'string');
  const meta = [p.role, p.client, p.year].filter(Boolean).join(' · ');

  return (
    <article className={styles.page}>
      <button type="button" className={styles.back} onClick={() => goTo('projects')}>
        ← All projects
      </button>
      <header className={styles.head}>
        <p className="label">{[p.category, p.is_featured ? 'Featured' : null].filter(Boolean).join(' · ')}</p>
        <h1 className={styles.title}>{p.title}</h1>
        <p className={styles.lead}>{p.summary}</p>
        {meta && <p className={styles.muted}>{meta}</p>}
        {links.length > 0 && (
          <ul className={styles.links}>
            {links.map(([k, url]) => (
              <li key={k}>
                <a href={url} target="_blank" rel="noopener">
                  {linkLabels[k] ?? k} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>

      {p.cover && <Img image={p.cover} className={styles.cover} loading="eager" />}

      {p.tech.length > 0 && (
        <section aria-label="Tech" className={styles.section}>
          <ul className={styles.tags}>
            {p.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {p.body.trim() && (
        <section className={`${styles.section} ${styles.prose}`} aria-label="Story">
          <Markdown skipHtml>{p.body}</Markdown>
        </section>
      )}

      {p.gallery.length > 0 && (
        <section className={styles.section} aria-label="Gallery">
          <ul className={styles.gallery}>
            {p.gallery.map((g) => (
              <li key={g.path}>
                <Img image={g} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.section}>
        <Link to="/" viewTransition>
          Back to the opening scene
        </Link>
      </p>
    </article>
  );
}
