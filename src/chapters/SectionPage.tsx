/** /s/:slug — a custom section's own page (spec 06 CS-3), in its chosen layout. */
import { useParams } from 'react-router';
import { NotFoundPage } from '../app/NotFoundPage';
import { usePublishedCustomSections } from '../data/queries/public';
import { useDocumentTitle, useMetaDescription, useNoIndex } from '../shell/hooks';
import { CustomSectionView } from './custom/CustomSection';
import styles from './pages.module.css';

export function Component() {
  const { slug = '' } = useParams();
  const q = usePublishedCustomSections();
  const found = q.data?.find((s) => s.section.slug === slug && s.section.has_page);
  useDocumentTitle(q.isPending ? undefined : (found?.section.name ?? 'Scene not found'));
  useMetaDescription(found?.section.intro);
  useNoIndex(!q.isPending && !found);

  if (q.isPending) {
    return (
      <article className={styles.wide} aria-busy="true">
        <div className={styles.skeletonTitle} />
        <div className={styles.skeletonBlock} />
      </article>
    );
  }
  if (!found) return <NotFoundPage />;

  const { section, items } = found;
  return (
    <article className={styles.wide}>
      <header className={styles.titleCard}>
        <p className="label">Section</p>
        <h1 className={styles.bigTitle}>{section.name}</h1>
        {section.intro && <p className={styles.lead}>{section.intro}</p>}
      </header>
      <CustomSectionView section={section} items={items} variant="page" />
    </article>
  );
}
