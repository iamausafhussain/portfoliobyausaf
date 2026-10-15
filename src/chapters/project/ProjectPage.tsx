/** /projects/:slug — the styled project page (spec 05 §2.6). */
import { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import { Link, useNavigate, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { Img } from '../../components/Img';
import { usePublishedProjects, useProject } from '../../data/queries/public';
import { useDocumentTitle } from '../../shell/hooks';
import { projectAnchor } from '../system/ProjectCard';
import { GalleryViewer } from './GalleryViewer';
import styles from './project.module.css';

const linkLabels: Record<string, string> = {
  live: 'Live site',
  repo: 'Code',
  case_study: 'Case study',
  video: 'Video',
};

export function Component() {
  const { slug = '' } = useParams();
  const q = useProject(slug);
  const all = usePublishedProjects();
  const navigate = useNavigate();
  const [viewing, setViewing] = useState<number | null>(null);
  const p = q.data;
  useDocumentTitle(q.isPending ? undefined : (p?.title ?? 'Scene not found'));

  // prev / next in display order (PP-4)
  const [prev, next] = useMemo(() => {
    const list = all.data ?? [];
    const i = list.findIndex((x) => x.slug === slug);
    if (i < 0 || list.length < 2) return [null, null];
    return [list[(i - 1 + list.length) % list.length]!, list[(i + 1) % list.length]!];
  }, [all.data, slug]);

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
        <button type="button" className={styles.pill} onClick={() => q.refetch()}>
          Retry
        </button>
      </article>
    );
  }
  if (!p) return <NotFoundPage />;

  const links = Object.entries(p.links).filter((e): e is [string, string] => typeof e[1] === 'string');
  const credit = [p.role, p.client].filter(Boolean).join(' · ');
  // "Back to The System" lands on this project's stop or card on the globe (PP-4)
  const back = () => void navigate(`/#${projectAnchor(p.slug)}`, { viewTransition: true });

  return (
    <article className={styles.page}>
      <button type="button" className={styles.pill} onClick={back}>
        ← Back to The System
      </button>

      {/* title card (PP-1) */}
      <header className={styles.titleCard}>
        <p className={`label ${styles.kicker}`}>
          <span>{p.category}</span>
          {p.year && <span>{p.year}</span>}
          {p.is_featured && <span className={styles.featured}>Featured</span>}
        </p>
        <h1 className={styles.title}>{p.title}</h1>
        {credit && <p className={styles.credit}>{credit}</p>}
        <p className={styles.lead}>{p.summary}</p>
      </header>

      {p.cover && (
        <figure className={styles.frame}>
          <Img image={p.cover} className={styles.cover} loading="eager" fetchPriority="high" />
        </figure>
      )}

      <div className={styles.columns}>
        <div className={styles.prose}>
          {p.body.trim() ? (
            <Markdown skipHtml>{p.body}</Markdown>
          ) : (
            <p className={styles.muted}>{p.summary}</p>
          )}
        </div>
        <aside className={styles.side}>
          {p.tech.length > 0 && (
            <section aria-labelledby="tech-title" className={styles.sideBlock}>
              <h2 id="tech-title" className="label">
                Tech
              </h2>
              <ul className={styles.tags}>
                {p.tech.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
          {links.length > 0 && (
            <section aria-labelledby="links-title" className={styles.sideBlock}>
              <h2 id="links-title" className="label">
                Links
              </h2>
              <ul className={styles.links}>
                {links.map(([k, url]) => (
                  <li key={k}>
                    <a href={url} target="_blank" rel="noopener" className={styles.linkButton}>
                      {linkLabels[k] ?? k} <span aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {/* gallery (PP-3) */}
      {p.gallery.length > 0 && (
        <section aria-labelledby="gallery-title" className={styles.gallerySection}>
          <h2 id="gallery-title" className="label">
            Gallery
          </h2>
          <ul className={styles.gallery}>
            {p.gallery.map((g, i) => (
              <li key={g.path}>
                <button
                  type="button"
                  className={styles.thumb}
                  onClick={() => setViewing(i)}
                  aria-label={`Open image ${i + 1}: ${g.alt}`}
                  data-cursor="view"
                >
                  <Img image={g} />
                </button>
              </li>
            ))}
          </ul>
          <GalleryViewer
            images={p.gallery}
            index={viewing}
            onIndex={setViewing}
            onClose={() => setViewing(null)}
          />
        </section>
      )}

      {/* prev / next (PP-4) */}
      {prev && next && (
        <nav className={styles.prevNext} aria-label="More projects">
          <Link to={`/projects/${prev.slug}`} viewTransition className={styles.pn} data-cursor="view">
            <span className="label">← Previous</span>
            <span className={styles.pnTitle}>{prev.title}</span>
          </Link>
          <Link
            to={`/projects/${next.slug}`}
            viewTransition
            className={`${styles.pn} ${styles.pnNext}`}
            data-cursor="view"
          >
            <span className="label">Next →</span>
            <span className={styles.pnTitle}>{next.title}</span>
          </Link>
        </nav>
      )}
    </article>
  );
}
