/** One home-page chapter: anchor, number, heading, registration (spec 03 HP-3, HP-5). */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { chapterCode, type ChapterEntry } from './chapters';
import { useChapterRegistry } from './ChapterRegistry';
import styles from './Chapter.module.css';

export function Chapter({
  entry,
  children,
  variant = 'default',
  headingLevel = 2,
}: {
  entry: ChapterEntry;
  children?: ReactNode;
  variant?: 'default' | 'hero';
  headingLevel?: 1 | 2;
}) {
  const ref = useRef<HTMLElement>(null);
  const { register } = useChapterRegistry();

  useLayoutEffect(() => {
    if (!ref.current) return;
    return register(entry, ref.current);
  }, [entry, register]);

  const headingId = `${entry.id}-title`;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <section
      ref={ref}
      id={entry.id}
      className={variant === 'hero' ? styles.hero : styles.chapter}
      aria-labelledby={headingId}
      data-chapter={entry.id}
    >
      {variant === 'hero' ? (
        children
      ) : (
        <div className={styles.inner}>
          <header className={styles.head}>
            <p className={`label ${styles.code}`}>
              <span>{chapterCode(entry.number)}</span>
              <span aria-hidden>·</span>
              <span>{entry.subtitle && entry.kind === 'built-in' ? entry.subtitle : 'Section'}</span>
            </p>
            <Heading id={headingId} className={styles.title} tabIndex={-1}>
              {entry.title}
            </Heading>
          </header>
          <div className={styles.body}>{children}</div>
        </div>
      )}
    </section>
  );
}
