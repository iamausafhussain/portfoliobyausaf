/** Reviews — testimonials (spec 06 §2.6). */
import { Link } from 'react-router';
import { Img } from '../../components/Img';
import { usePublishedProjects, usePublishedTestimonials } from '../../data/queries/public';
import type { Project, Testimonial } from '../../data/schemas';
import { QuoteCarousel } from './QuoteCarousel';
import styles from './reviews.module.css';

/** Three or more: one at a time; one or two: a plain stack (RV-3). */
export const CAROUSEL_FROM = 3;

function Review({ t, project }: { t: Testimonial; project?: Project }) {
  const who = [t.author_role, t.author_company].filter(Boolean).join(', ');
  return (
    <figure className={styles.review}>
      <blockquote className={styles.quote}>
        <p>{t.quote}</p>
      </blockquote>
      <figcaption className={styles.cite}>
        {t.avatar && <Img image={t.avatar} className={styles.avatar} />}
        <span className={styles.citeText}>
          <span className={styles.author}>{t.author_name}</span>
          {who && <span className={styles.muted}>{who}</span>}
          {t.rating ? (
            <span className={styles.stars}>
              <span aria-hidden>{'★'.repeat(t.rating)}</span>
              <span className="sr-only">Rated {t.rating} out of 5</span>
            </span>
          ) : null}
        </span>
        <span className={styles.citeLinks}>
          {project && (
            <Link to={`/projects/${project.slug}`} viewTransition data-cursor="view">
              On: {project.title}
            </Link>
          )}
          {t.source_url && (
            <a href={t.source_url} target="_blank" rel="noopener">
              Source <span aria-hidden>↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

export function ReviewsChapter() {
  const q = usePublishedTestimonials();
  const projects = usePublishedProjects();
  const list = q.data ?? [];
  const projectOf = (id: string | null) => (id ? projects.data?.find((p) => p.id === id) : undefined);

  if (q.isPending) {
    return (
      <div className={styles.skeleton} aria-hidden>
        <span />
      </div>
    );
  }
  if (q.isError) return <p className={styles.muted}>This chapter couldn&rsquo;t load right now.</p>;
  if (list.length === 0) return <p className={styles.muted}>Nothing here yet.</p>;

  if (list.length < CAROUSEL_FROM) {
    return (
      <ul className={styles.stack}>
        {list.map((t) => (
          <li key={t.id} data-reveal="up">
            <Review t={t} project={projectOf(t.project_id)} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div data-reveal="up">
      <QuoteCarousel
        items={list}
        label="Testimonials"
        render={(t) => <Review t={t} project={projectOf(t.project_id)} />}
      />
    </div>
  );
}
