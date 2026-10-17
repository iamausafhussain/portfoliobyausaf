import { Link } from 'react-router';
import { useDocumentTitle, useNoIndex } from '../shell/hooks';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  useDocumentTitle('Scene not found');
  useNoIndex();
  return (
    <section className={styles.wrap}>
      <p className="label">Error 404</p>
      <h1 className={styles.title}>Scene not found</h1>
      <p className={styles.text}>This shot didn&rsquo;t make the final cut.</p>
      <Link to="/" viewTransition>
        Back to the opening scene
      </Link>
    </section>
  );
}
