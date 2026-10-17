/** Contact chapter until Part 7 adds the form: the public email, or a short note. */
import { useSiteSettings } from '../data/queries/public';
import styles from './home.module.css';

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
        <p className={styles.muted}>Reach me through the links below.</p>
      )}
    </div>
  );
}
