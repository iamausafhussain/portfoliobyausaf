/** Top bar: name, chapter timecode, menu, Fast Lane (desktop), theme toggle (spec 03 NV-1, NV-2). */
import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useReducedMotion } from '../device/useReducedMotion';
import { ThemeToggle } from '../theme/ThemeToggle';
import { chapterCode } from './chapters';
import { ChapterMenu } from './ChapterMenu';
import { useChapterRegistry } from './ChapterRegistry';
import { FastLane } from './FastLane';
import { useScrollState } from './hooks';
import styles from './shell.module.css';

function pageLabel(pathname: string): string | null {
  if (pathname.startsWith('/projects/')) return 'Project';
  if (pathname.startsWith('/s/')) return 'Section';
  if (pathname === '/resume') return 'Resume';
  return null;
}

export function TopBar() {
  const { active } = useChapterRegistry();
  const { scrolled, hidden, progress } = useScrollState();
  const reduced = useReducedMotion();
  const { pathname } = useLocation();
  const ref = useRef<HTMLElement>(null);
  const [focusInside, setFocusInside] = useState(false);
  const label = pageLabel(pathname);
  const isHome = pathname === '/';

  return (
    <header
      ref={ref}
      className={styles.topbar}
      data-scrolled={scrolled || !isHome || undefined}
      data-hidden={(hidden && !reduced && !focusInside) || undefined}
      onFocus={() => setFocusInside(true)}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node | null)) setFocusInside(false);
      }}
    >
      <Link to="/" className={styles.brand} viewTransition>
        Ausaf Hussain
      </Link>

      <p className={styles.timecode} aria-live="polite" aria-atomic="true" data-timecode>
        {isHome && active ? (
          <>
            <span className={`label ${styles.timecodeCode}`}>{chapterCode(active.number)}</span>
            <span className={styles.timecodeDot} aria-hidden>
              ·
            </span>
            <span className={styles.timecodeTitle}>{active.title}</span>
          </>
        ) : label ? (
          <span className="label">{label}</span>
        ) : null}
      </p>

      <div className={styles.topActions}>
        <FastLane variant="bar" />
        <ChapterMenu />
        <ThemeToggle />
      </div>

      {isHome && (
        <span className={styles.progress} style={{ transform: `scaleX(${progress})` }} aria-hidden />
      )}
    </header>
  );
}
