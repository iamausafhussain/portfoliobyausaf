/** Dashboard card: paid orders and revenue over the last 30 days (spec 08 AD-8.5). */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { formatPrice } from '../../data/shop';
import styles from '../pages/pages.module.css';
import { useRepository } from '../repository';
import { shopKeys } from './keys';

export const SALES_DAYS = 30;

export function SalesCard() {
  const repo = useRepository();
  const q = useQuery({
    queryKey: shopKeys.sales(SALES_DAYS),
    queryFn: () => repo.shop.sales(SALES_DAYS),
    staleTime: 0,
  });
  const revenue = Object.entries(q.data?.revenue ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => formatPrice(amount, currency));
  return (
    <div className={styles.stat} data-sales>
      <Link to="/admin/orders" className={styles.cardLink}>
        <span className={styles.cardTitle}>Sales</span>
      </Link>
      <p className={styles.counts}>
        <span className={styles.big}>{q.data ? q.data.orders : '–'}</span>{' '}
        {q.data?.orders === 1 ? 'order' : 'orders'}
      </p>
      <span className={styles.drafts}>
        {q.isError
          ? 'Couldn’t load sales.'
          : revenue.length
            ? `${revenue.join(' + ')} in the last ${SALES_DAYS} days`
            : `No paid orders in the last ${SALES_DAYS} days.`}
      </span>
    </div>
  );
}
