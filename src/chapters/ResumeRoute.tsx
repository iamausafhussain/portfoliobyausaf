/** /resume — opens the current resume PDF, or explains that there isn't one (spec 03 RT-3). */
import { useEffect } from 'react';
import { useSiteSettings } from '../data/queries/public';
import { publicMediaUrl } from '../data/source';
import { useDocumentTitle } from '../shell/hooks';
import { useNavigateToChapter } from '../shell/useNavigateToChapter';
import styles from './pages.module.css';

export function ResumeRoute() {
  const settings = useSiteSettings();
  const goTo = useNavigateToChapter();
  const path = settings.data?.resume_path;
  const url = path ? publicMediaUrl(path) : '';
  const linkedin = settings.data?.socials.linkedin;
  useDocumentTitle('Resume');

  useEffect(() => {
    if (url) window.location.replace(url);
  }, [url]);

  return (
    <article className={styles.page}>
      <h1 className={styles.title}>Resume</h1>
      {settings.isPending || url ? (
        <p className={styles.muted}>
          Opening the resume…{' '}
          {url && (
            <a href={url} rel="noopener">
              Open it directly
            </a>
          )}
        </p>
      ) : (
        <>
          <p className={styles.lead}>The resume isn&rsquo;t online yet.</p>
          <p className={styles.links}>
            {linkedin && (
              <a href={linkedin} target="_blank" rel="noopener">
                LinkedIn profile ↗
              </a>
            )}
            <button type="button" className={styles.retry} onClick={() => goTo('contact')}>
              Get in touch
            </button>
          </p>
        </>
      )}
    </article>
  );
}
