import styles from './HomePage.module.css';

/** Placeholder until the chapters are built (Parts 3–7). */
export function HomePage() {
  return (
    <section className={styles.wrap}>
      <p className="label">Portfolio · In production</p>
      <h1 className={styles.name}>Ausaf Hussain</h1>
      <p className={styles.tagline}>Full-stack developer. Filmmaker. Building something worth the wait.</p>
    </section>
  );
}
