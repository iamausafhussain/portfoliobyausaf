/** Credits Roll — achievements (spec 06 §2.4). */
import type { CSSProperties } from 'react';
import { Img } from '../../components/Img';
import { usePublishedAchievements } from '../../data/queries/public';
import type { Achievement } from '../../data/schemas';
import styles from './credits.module.css';

/** End-credits order and headings (CR-2). */
export const creditGroups: { kind: Achievement['kind']; heading: string }[] = [
  { kind: 'award', heading: 'Awards' },
  { kind: 'certification', heading: 'Certifications' },
  { kind: 'title', heading: 'Titles' },
  { kind: 'recognition', heading: 'Recognition' },
  { kind: 'publication', heading: 'Publications' },
  { kind: 'other', heading: 'Also' },
];

const year = (d: string | null) => (d ? d.slice(0, 4) : '');

function Title({ a }: { a: Achievement }) {
  return a.link ? (
    <a href={a.link} target="_blank" rel="noopener" className={styles.titleLink}>
      {a.title}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <>{a.title}</>
  );
}

export function CreditsChapter() {
  const q = usePublishedAchievements();
  const list = q.data ?? [];

  if (q.isPending) {
    return (
      <div className={styles.skeleton} aria-hidden>
        <span />
        <span />
        <span />
      </div>
    );
  }
  if (q.isError) return <p className={styles.muted}>This chapter couldn&rsquo;t load right now.</p>;
  if (list.length === 0) return <p className={styles.muted}>Credits are being added.</p>;

  const starring = list.filter((a) => a.is_highlighted);
  const rest = list.filter((a) => !a.is_highlighted);
  const groups = creditGroups
    .map((g) => ({ ...g, items: rest.filter((a) => a.kind === g.kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className={styles.credits}>
      {/* starring (CR-1) */}
      {starring.length > 0 && (
        <section aria-labelledby="credits-starring">
          <h3 id="credits-starring" className={`label ${styles.groupTitle}`}>
            Starring
          </h3>
          <ul className={styles.starring}>
            {starring.map((a, i) => (
              <li key={a.id} className={styles.star} data-reveal="up" style={{ '--i': i } as CSSProperties}>
                {a.image && <Img image={a.image} className={styles.badge} />}
                <div className={styles.starBody}>
                  <p className={`label ${styles.kind}`}>{a.kind}</p>
                  <p className={styles.starTitle}>
                    <Title a={a} />
                  </p>
                  <p className={styles.meta}>{[a.issuer, year(a.awarded_on)].filter(Boolean).join(' · ')}</p>
                  {a.description && <p className={styles.description}>{a.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* the roll (CR-2, CR-3) */}
      {groups.map((g) => (
        <section key={g.kind} aria-labelledby={`credits-${g.kind}`} className={styles.group}>
          <h3 id={`credits-${g.kind}`} className={`label ${styles.groupTitle}`} data-reveal="up">
            {g.heading}
          </h3>
          <ul className={styles.lines}>
            {g.items.map((a, i) => (
              <li key={a.id} className={styles.line} data-reveal="up" style={{ '--i': i } as CSSProperties}>
                <span className={styles.lineTitle}>
                  <Title a={a} />
                </span>
                <span className={styles.leader} aria-hidden />
                <span className={styles.lineMeta}>
                  {[a.issuer, year(a.awarded_on)].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
