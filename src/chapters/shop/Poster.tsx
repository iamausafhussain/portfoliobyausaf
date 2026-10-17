/**
 * A product as a film poster (spec 08 §3.5): tall cover, title, and a ticket-stub strip with
 * the type and the price. Used by the Box Office chapter and /shop.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Img } from '../../components/Img';
import type { Product } from '../../data/schemas';
import { formatPrice, productKindLabels } from '../../data/shop';
import styles from './shop.module.css';

export const priceLabel = (p: Pick<Product, 'is_free' | 'price_usd'>) =>
  p.is_free ? 'Free' : p.price_usd != null ? formatPrice(p.price_usd, 'USD') : '';

export function Poster({
  product,
  index = 0,
  headingLevel = 3,
}: {
  product: Product;
  index?: number;
  headingLevel?: 2 | 3;
}) {
  const Title = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <li className={styles.posterItem} data-reveal="up" style={{ '--i': index } as CSSProperties}>
      <Link
        to={`/shop/${product.slug}`}
        viewTransition
        className={styles.poster}
        data-cursor="view"
        data-product={product.slug}
      >
        <span className={styles.posterArt}>
          {product.cover ? (
            <Img image={product.cover} className={styles.posterImg} />
          ) : (
            <span className={styles.posterBlank} aria-hidden>
              {product.title.slice(0, 1)}
            </span>
          )}
          {product.is_free && <span className={`label ${styles.freeBadge}`}>Free</span>}
        </span>
        <span className={styles.posterBody}>
          <Title className={styles.posterTitle}>{product.title}</Title>
          {product.tagline && <span className={styles.posterLine}>{product.tagline}</span>}
        </span>
        <span className={`label ${styles.stub}`}>
          <span>{productKindLabels[product.kind]}</span>
          <span className={styles.stubPrice}>{priceLabel(product)}</span>
        </span>
      </Link>
    </li>
  );
}
