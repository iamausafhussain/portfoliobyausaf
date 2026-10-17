/** Links to the shop's policy pages (spec 08 AD-8.6), shown only once they're published. */
import { Link } from 'react-router';
import { useShopPage } from '../../data/queries/public';
import styles from './shop.module.css';

const pages = [
  { slug: 'terms', label: 'Terms' },
  { slug: 'refunds', label: 'Refund policy' },
  { slug: 'privacy', label: 'Privacy' },
] as const;

function PolicyLink({ slug, label }: { slug: (typeof pages)[number]['slug']; label: string }) {
  const q = useShopPage(slug);
  if (!q.data) return null;
  return (
    <li>
      <Link to={`/${slug}`}>{label}</Link>
    </li>
  );
}

export function PolicyLinks({ note }: { note?: string }) {
  return (
    <nav className={styles.policyLinks} aria-label="Shop policies">
      {note && <p>{note}</p>}
      <ul>
        {pages.map((p) => (
          <PolicyLink key={p.slug} {...p} />
        ))}
      </ul>
    </nav>
  );
}
