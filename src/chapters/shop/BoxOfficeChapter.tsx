/** Box Office — featured products on the home page (spec 08 BX-1). */
import { Link } from 'react-router';
import { usePublishedProducts } from '../../data/queries/public';
import { Poster } from './Poster';
import styles from './shop.module.css';

export const FEATURED_MAX = 3;

/** Featured products first (up to 3); if none are featured, the first ones in order. */
export function featuredProducts<T extends { is_featured: boolean }>(all: T[]): T[] {
  const featured = all.filter((p) => p.is_featured);
  return (featured.length ? featured : all).slice(0, FEATURED_MAX);
}

export function BoxOfficeChapter() {
  const q = usePublishedProducts();
  const all = q.data ?? [];
  const shown = featuredProducts(all);
  if (q.isPending) return <div className={styles.skeletonPosters} aria-hidden />;
  if (shown.length === 0) return null;
  return (
    <div className={styles.boxOffice}>
      <p className={styles.lead}>Tools and guides from my own edits, ready to download.</p>
      <ul className={styles.posters}>
        {shown.map((p, i) => (
          <Poster key={p.id} product={p} index={i} />
        ))}
      </ul>
      <p>
        <Link to="/shop" viewTransition className={styles.seeAll}>
          {all.length > shown.length ? `See all ${all.length} products` : 'Visit the shop'}{' '}
          <span aria-hidden>→</span>
        </Link>
      </p>
    </div>
  );
}
