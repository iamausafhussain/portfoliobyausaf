/** /shop — every published product (spec 08 BX-2). */
import { useState } from 'react';
import { usePublishedProducts } from '../../data/queries/public';
import type { Product } from '../../data/schemas';
import { productKindLabels } from '../../data/shop';
import { useDocumentTitle } from '../../shell/hooks';
import pageStyles from '../pages.module.css';
import { Poster } from './Poster';
import { PolicyLinks } from './PolicyLinks';
import styles from './shop.module.css';

type Kind = Product['kind'];

export function Component() {
  const q = usePublishedProducts();
  const all = q.data ?? [];
  const kinds = [...new Set(all.map((p) => p.kind))] as Kind[];
  const [kind, setKind] = useState<Kind | null>(null);
  const shown = kind ? all.filter((p) => p.kind === kind) : all;
  useDocumentTitle(q.isPending ? undefined : 'Box Office');

  return (
    <article className={pageStyles.wide}>
      <header className={pageStyles.titleCard}>
        <p className="label">Shop</p>
        <h1 className={pageStyles.bigTitle}>Box Office</h1>
        <p className={pageStyles.lead}>
          LUTs, presets and guides from my own films. Instant download after checkout.
        </p>
      </header>

      {kinds.length > 1 && (
        <div className={styles.filters} role="group" aria-label="Show">
          <button type="button" aria-pressed={kind === null} onClick={() => setKind(null)}>
            All <span>{all.length}</span>
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} data-kind={k}>
              {productKindLabels[k]} <span>{all.filter((p) => p.kind === k).length}</span>
            </button>
          ))}
        </div>
      )}

      {q.isPending ? (
        <div className={styles.skeletonPosters} aria-hidden />
      ) : q.isError ? (
        <p className={pageStyles.muted}>The shop couldn&rsquo;t load right now. Please try again.</p>
      ) : all.length === 0 ? (
        <p className={pageStyles.muted}>Nothing for sale yet. Check back soon.</p>
      ) : (
        <ul className={styles.posters} data-shop-grid>
          {shown.map((p, i) => (
            <Poster key={p.id} product={p} index={i} headingLevel={2} />
          ))}
        </ul>
      )}
      <PolicyLinks />
    </article>
  );
}
