import { Link } from 'react-router';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <section className={styles.wrap}>
      <p className="label">Error 404</p>
      <h1 className={styles.title}>Scene not found</h1>
      <p className={styles.text}>This shot didn&rsquo;t make the final cut.</p>
      <Link to="/">Back to the opening scene</Link>
    </section>
  );
}
