/** Resume · Projects · Contact — always one click away (spec 03 NV-4). */
import { track } from '../analytics/track';
import { useRef } from 'react';
import { useMagnetic } from '../cursor/magnetic';
import { useSiteSettings } from '../data/queries/public';
import { publicMediaUrl } from '../data/source';
import { useNavigateToChapter } from './useNavigateToChapter';
import styles from './shell.module.css';

export function FastLane({ variant }: { variant: 'bar' | 'floating' }) {
  const settings = useSiteSettings();
  const goTo = useNavigateToChapter();
  const contact = useRef<HTMLButtonElement>(null);
  useMagnetic(contact);
  const resume = settings.data?.resume_path ? publicMediaUrl(settings.data.resume_path) : '';

  return (
    <nav
      aria-label="Fast lane"
      className={variant === 'bar' ? styles.fastLaneBar : styles.fastLaneFloating}
      data-fast-lane={variant}
    >
      {resume && (
        <a
          href={resume}
          target="_blank"
          rel="noopener"
          onClick={() => track('resume_open')}
          className={styles.fastItem}
        >
          Resume
        </a>
      )}
      <button type="button" className={styles.fastItem} onClick={() => goTo('projects')}>
        Projects
      </button>
      <button
        ref={contact}
        type="button"
        className={`${styles.fastItem} ${styles.fastPrimary}`}
        onClick={() => goTo('contact')}
      >
        Contact
      </button>
    </nav>
  );
}
