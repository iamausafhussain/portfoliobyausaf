/** A project card: used by the tour, the "All projects" grid and the non-3D version (spec 05 SY-1, SY-2). */
import type { FocusEventHandler } from 'react';
import { Link } from 'react-router';
import { Img } from '../../components/Img';
import type { Project } from '../../data/schemas';
import styles from './system.module.css';

export const projectAnchor = (slug: string) => `project-${slug}`;

export function ProjectCard({
  project: p,
  onHover,
  onFocus,
  variant = 'grid',
  id,
  highlighted = false,
}: {
  project: Project;
  onHover?: (id: string | null) => void;
  onFocus?: FocusEventHandler<HTMLAnchorElement>;
  variant?: 'tour' | 'grid';
  id?: string;
  /** its node is hovered on the globe (SY-3) */
  highlighted?: boolean;
}) {
  return (
    <article
      id={id}
      className={variant === 'tour' ? `${styles.card} ${styles.tourCard}` : styles.card}
      data-cursor="view"
      data-project={p.slug}
      data-highlighted={highlighted || undefined}
      onPointerEnter={() => onHover?.(p.id)}
      onPointerLeave={() => onHover?.(null)}
    >
      {p.cover && <Img image={p.cover} className={styles.cover} />}
      <div className={styles.cardBody}>
        <p className="label">
          {[p.category, p.year].filter(Boolean).join(' · ')}
          {p.is_featured ? ' · Featured' : ''}
        </p>
        <h3 className={styles.cardTitle}>
          <Link
            to={`/projects/${p.slug}`}
            viewTransition
            className={styles.cardLink}
            onFocus={(e) => {
              onHover?.(p.id);
              onFocus?.(e);
            }}
            onBlur={() => onHover?.(null)}
          >
            {p.title}
          </Link>
        </h3>
        <p className={styles.summary}>{p.summary}</p>
        {p.tech.length > 0 && (
          <ul className={styles.tags} aria-label="Tech">
            {p.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <span className={styles.viewLink} aria-hidden>
          View project <span className={styles.arrow}>→</span>
        </span>
      </div>
    </article>
  );
}
