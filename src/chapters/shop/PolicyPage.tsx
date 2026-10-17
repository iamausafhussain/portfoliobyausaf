/** /terms, /refunds, /privacy — the shop's policy pages (spec 08 AD-8.6). */
import { useLocation } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { LazyMarkdown } from '../../components/markdown/LazyMarkdown';
import { useShopPage } from '../../data/queries/public';
import { useDocumentTitle } from '../../shell/hooks';
import pageStyles from '../pages.module.css';
import styles from './shop.module.css';

const slugs = ['terms', 'refunds', 'privacy'] as const;
type Slug = (typeof slugs)[number];

export function Component() {
  const { pathname } = useLocation();
  const slug = (slugs.find((s) => pathname.replace(/\/+$/, '') === `/${s}`) ?? 'terms') as Slug;
  const q = useShopPage(slug);
  useDocumentTitle(q.isPending ? undefined : (q.data?.title ?? 'Page not found'));
  if (q.isPending)
    return (
      <article className={pageStyles.page} aria-busy="true">
        <div className={pageStyles.skeletonBlock} />
      </article>
    );
  if (!q.data) return <NotFoundPage />;
  const updated = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
    new Date(q.data.updated_at),
  );
  return (
    <article className={pageStyles.page}>
      <header className={pageStyles.head}>
        <p className="label">Box Office</p>
        <h1 className={pageStyles.title}>{q.data.title}</h1>
        <p className={pageStyles.muted}>Last updated {updated}</p>
      </header>
      <div className={styles.description}>
        <LazyMarkdown>{q.data.body}</LazyMarkdown>
      </div>
    </article>
  );
}
