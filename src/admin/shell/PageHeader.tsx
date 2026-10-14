import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '../ui/Icon';
import styles from './page.module.css';

export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  eyebrow?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      {back && (
        <Link to={back.to} className={styles.back}>
          <Icon name="chevronLeft" size={16} />
          {back.label}
        </Link>
      )}
      <div className={styles.headRow}>
        <div className={styles.titles}>
          {eyebrow && <p className="label">{eyebrow}</p>}
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}

export function PageBody({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? styles.bodyWide : styles.body}>{children}</div>;
}
