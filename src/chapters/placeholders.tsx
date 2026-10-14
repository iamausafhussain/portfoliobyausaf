/**
 * Plain, readable chapter content until Parts 5–7 replace it (spec 03 HP-4). It also
 * serves as the non-3D version of each chapter (master spec A-3).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Img } from '../components/Img';
import {
  usePublishedAchievements,
  usePublishedCustomSections,
  usePublishedExperience,
  usePublishedProjects,
  usePublishedSkills,
  usePublishedTestimonials,
  useSiteSettings,
} from '../data/queries/public';
import type { CustomSection } from '../data/schemas';
import { itemTitle } from '../data/schemas';
import styles from './home.module.css';

function Pending({ part }: { part: number }) {
  return (
    <p className={`label ${styles.pending}`}>Placeholder · the cinematic version arrives in Part {part}</p>
  );
}

function State({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className={styles.skeleton} aria-hidden>
        <span />
        <span />
        <span />
      </div>
    );
  if (error) return <p className={styles.muted}>This chapter couldn&rsquo;t load right now.</p>;
  if (empty) return <p className={styles.muted}>Nothing here yet.</p>;
  return <>{children}</>;
}

const year = (d: string | null | undefined) => (d ? d.slice(0, 4) : '');

/* ------------------------------------------------------------------ */

export function AboutPlaceholder() {
  const settings = useSiteSettings();
  const s = settings.data;
  return (
    <State loading={settings.isPending} error={settings.isError} empty={!s?.bio_short && !s?.portrait}>
      <div className={styles.about}>
        {s?.portrait && <Img image={s.portrait} className={styles.portrait} />}
        <div className={styles.aboutText}>
          {s?.bio_short && <p className={styles.lead}>{s.bio_short}</p>}
          {s?.location && <p className={styles.muted}>Based in {s.location}</p>}
        </div>
      </div>
      <Pending part={6} />
    </State>
  );
}

export function ProjectsPlaceholder() {
  const projects = usePublishedProjects();
  const list = projects.data ?? [];
  return (
    <State loading={projects.isPending} error={projects.isError} empty={list.length === 0}>
      <ul className={styles.cards}>
        {list.map((p) => (
          <li key={p.id} className={styles.card} data-cursor="view">
            {p.cover && <Img image={p.cover} className={styles.cardImage} />}
            <div className={styles.cardBody}>
              <p className="label">
                {[p.category, p.year].filter(Boolean).join(' · ')}
                {p.is_featured ? ' · Featured' : ''}
              </p>
              <h3 className={styles.cardTitle}>
                <Link to={`/projects/${p.slug}`} viewTransition className={styles.cardLink}>
                  {p.title}
                </Link>
              </h3>
              <p className={styles.muted}>{p.summary}</p>
              {p.tech.length > 0 && (
                <ul className={styles.tags} aria-label="Tech">
                  {p.tech.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Pending part={5} />
    </State>
  );
}

export function CreditsPlaceholder() {
  const q = usePublishedAchievements();
  const list = q.data ?? [];
  return (
    <State loading={q.isPending} error={q.isError} empty={list.length === 0}>
      <ul className={styles.credits}>
        {list.map((a) => (
          <li key={a.id} data-highlighted={a.is_highlighted || undefined}>
            <span className={`label ${styles.creditKind}`}>{a.kind}</span>
            <span className={styles.creditTitle}>
              {a.link ? (
                <a href={a.link} target="_blank" rel="noopener">
                  {a.title}
                </a>
              ) : (
                a.title
              )}
            </span>
            <span className={styles.muted}>{[a.issuer, year(a.awarded_on)].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
      <Pending part={6} />
    </State>
  );
}

export function TimelinePlaceholder() {
  const exp = usePublishedExperience();
  const skills = usePublishedSkills();
  const roles = exp.data ?? [];
  const groups = new Map<string, string[]>();
  for (const s of skills.data ?? []) groups.set(s.category, [...(groups.get(s.category) ?? []), s.name]);
  return (
    <State
      loading={exp.isPending || skills.isPending}
      error={exp.isError && skills.isError}
      empty={roles.length === 0 && groups.size === 0}
    >
      {roles.length > 0 && (
        <ol className={styles.timeline}>
          {roles.map((r) => (
            <li key={r.id}>
              <span className={`label ${styles.when}`}>
                {year(r.start_date)}–{r.end_date ? year(r.end_date) : 'now'}
              </span>
              <span className={styles.creditTitle}>{r.role}</span>
              <span className={styles.muted}>{[r.company, r.location].filter(Boolean).join(' · ')}</span>
              {r.highlights.length > 0 && (
                <ul className={styles.highlights}>
                  {r.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {groups.size > 0 && (
        <div className={styles.skillGroups}>
          {[...groups].map(([cat, names]) => (
            <div key={cat}>
              <p className="label">{cat}</p>
              <ul className={styles.tags}>
                {names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <Pending part={6} />
    </State>
  );
}

export function ReviewsPlaceholder() {
  const q = usePublishedTestimonials();
  const list = q.data ?? [];
  return (
    <State loading={q.isPending} error={q.isError} empty={list.length === 0}>
      <ul className={styles.quotes}>
        {list.map((t) => (
          <li key={t.id}>
            <blockquote className={styles.quote}>
              <p>&ldquo;{t.quote}&rdquo;</p>
            </blockquote>
            <p className={styles.muted}>
              — {t.author_name}
              {[t.author_role, t.author_company].filter(Boolean).length > 0 &&
                `, ${[t.author_role, t.author_company].filter(Boolean).join(', ')}`}
              {t.rating ? (
                <span className={styles.stars} aria-label={`${t.rating} out of 5`}>
                  {' '}
                  {'★'.repeat(t.rating)}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      <Pending part={6} />
    </State>
  );
}

export function CustomSectionPlaceholder({ section }: { section: CustomSection }) {
  const q = usePublishedCustomSections();
  const items = q.data?.find((s) => s.section.id === section.id)?.items ?? [];
  return (
    <>
      {section.intro && <p className={styles.lead}>{section.intro}</p>}
      <State loading={q.isPending} error={q.isError} empty={items.length === 0}>
        <ul className={styles.itemList}>
          {items.map((item, i) => (
            <li key={item.id}>{itemTitle(section.fields, item.data, i)}</li>
          ))}
        </ul>
        {section.has_page && (
          <p>
            <Link to={`/s/${section.slug}`} viewTransition>
              See all of {section.name}
            </Link>
          </p>
        )}
      </State>
      <Pending part={6} />
    </>
  );
}

export function ContactPlaceholder() {
  const settings = useSiteSettings();
  const s = settings.data;
  return (
    <div className={styles.contact}>
      <p className={styles.lead}>Have a role, a project or a shoot in mind?</p>
      {s?.public_email ? (
        <p>
          <a className={styles.bigLink} href={`mailto:${s.public_email}`}>
            {s.public_email}
          </a>
        </p>
      ) : (
        <p className={styles.muted}>The contact form arrives in Part 7.</p>
      )}
      <Pending part={7} />
    </div>
  );
}
