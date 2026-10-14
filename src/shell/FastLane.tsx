/** Resume · Projects · Contact — always one click away (spec 03 NV-4). */
import { useSiteSettings } from '../data/queries/public';
import { publicMediaUrl } from '../data/source';
import { useNavigateToChapter } from './useNavigateToChapter';
import styles from './shell.module.css';

export function FastLane({ variant }: { variant: 'bar' | 'floating' }) {
  const settings = useSiteSettings();
  const goTo = useNavigateToChapter();
  const resume = settings.data?.resume_path ? publicMediaUrl(settings.data.resume_path) : '';

  return (
    <nav
      aria-label="Fast lane"
      className={variant === 'bar' ? styles.fastLaneBar : styles.fastLaneFloating}
      data-fast-lane={variant}
    >
      {resume && (
        <a href={resume} target="_blank" rel="noopener" className={styles.fastItem}>
          Resume
        </a>
      )}
      <button type="button" className={styles.fastItem} onClick={() => goTo('projects')}>
        Projects
      </button>
      <button
        type="button"
        className={`${styles.fastItem} ${styles.fastPrimary}`}
        onClick={() => goTo('contact')}
      >
        Contact
      </button>
    </nav>
  );
}
