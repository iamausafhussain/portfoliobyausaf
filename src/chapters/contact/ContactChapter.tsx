/** Final Scene — contact (spec 07 §2.2): the slate form beside your direct details. */
import { useState } from 'react';
import { useSiteSettings } from '../../data/queries/public';
import { publicMediaUrl } from '../../data/source';
import { useHomeChapters } from '../../shell/ChapterRegistry';
import { socialNames } from '../../shell/Footer';
import { ContactForm } from './ContactForm';
import styles from './contact.module.css';

function CopyEmail({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  }
  return (
    <button type="button" className={styles.copy} onClick={copy} aria-live="polite">
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : 'Copy'}
      <span className="sr-only"> email address</span>
    </button>
  );
}

export function ContactChapter() {
  const settings = useSiteSettings();
  const { chapters } = useHomeChapters();
  const s = settings.data;
  const scene = chapters.find((c) => c.key === 'contact')?.number ?? 1;
  const socials = Object.entries(s?.socials ?? {}).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
  );
  const resume = s?.resume_path ? publicMediaUrl(s.resume_path) : '';

  return (
    <div className={styles.contact}>
      <p className={styles.lead}>Have a role, a project or a shoot in mind?</p>
      <div className={styles.layout}>
        <ContactForm scene={scene} publicEmail={s?.public_email} />

        <aside className={styles.details} aria-label="Other ways to reach me" data-reveal="up">
          {s?.public_email && (
            <div className={styles.detail}>
              <p className={`label ${styles.detailLabel}`}>Email</p>
              <p className={styles.emailRow}>
                <a className={styles.bigLink} href={`mailto:${s.public_email}`}>
                  {s.public_email}
                </a>
                <CopyEmail email={s.public_email} />
              </p>
            </div>
          )}
          {(s?.available_for_work || s?.location) && (
            <ul className={styles.facts}>
              {s?.available_for_work && (
                <li>
                  <span className={styles.available}>
                    <span className={styles.availableDot} aria-hidden /> Available for work
                  </span>
                </li>
              )}
              {s?.location && (
                <li>
                  <span className={`label ${styles.detailLabel}`}>Based in</span> {s.location}
                </li>
              )}
            </ul>
          )}
          {socials.length > 0 && (
            <div className={styles.detail}>
              <p className={`label ${styles.detailLabel}`} id="contact-elsewhere">
                Elsewhere
              </p>
              <ul className={styles.socials} aria-labelledby="contact-elsewhere">
                {socials.map(([key, url]) => (
                  <li key={key}>
                    <a href={url} target="_blank" rel="noopener">
                      {socialNames[key] ?? key} <span aria-hidden>↗</span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {resume && (
            <p>
              <a
                className={styles.resume}
                href={resume}
                target="_blank"
                rel="noopener"
                data-cursor="view"
                data-cursor-label="PDF"
              >
                Download résumé <span aria-hidden>↓</span>
              </a>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
