/**
 * Orders (spec 08 AD-8.3, AD-8.4): newest first, filter by status and product, search by email
 * or name. Actions: re-send the link, reset downloads, revoke.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { expiryFrom } from '../../../supabase/functions/_shared/shop.ts';
import { formatPrice } from '../../data/shop';
import { useAdminList } from '../data/hooks';
import listStyles from '../managers/list.module.css';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import type { OrderRow, OrderStatus } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useConfirm, useToast } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { Button, Notice, Skeleton, ui } from '../ui/primitives';
import { shopKeys } from './keys';
import { ShopModeNotice } from './ShopModeNotice';
import styles from './shop.module.css';

export const ORDERS_PAGE = 50;

export const statusLabels: Record<OrderStatus, string> = {
  paid: 'Paid',
  free: 'Free',
  refunded: 'Refunded',
  revoked: 'Revoked',
};
const statusFilters: (OrderStatus | null)[] = [null, 'paid', 'free', 'refunded', 'revoked'];

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));

/** "2 of 5 used · until 16 Nov 2026", or why the link doesn't work. */
export function downloadsText(o: OrderRow, now = Date.now()): string {
  if (o.status === 'refunded' || o.status === 'revoked') return 'Link stopped';
  const used = `${o.downloads_used} of ${o.download_limit} downloads used`;
  return Date.parse(o.expires_at) < now ? `${used} · expired` : `${used} · until ${shortDate(o.expires_at)}`;
}

function OrderItem({ order }: { order: OrderRow }) {
  const repo = useRepository();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<'resend' | 'reset' | 'revoke' | null>(null);
  const active = order.status === 'paid' || order.status === 'free';

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<unknown>, done: string) => {
    setBusy(kind);
    try {
      await fn();
      toast.success(done);
      await qc.invalidateQueries({ queryKey: shopKeys.orders });
    } catch (e) {
      toast.error(isRepoError(e) ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const resend = () =>
    run('resend', () => repo.shop.resend(order.id), `A fresh link is on its way to ${order.email}.`);
  const reset = () =>
    run(
      'reset',
      () =>
        repo.shop.updateOrder(order.id, { downloads_used: 0, expires_at: expiryFrom(), refresh_count: 0 }),
      'Downloads reset: the link works again for 30 days.',
    );
  const revoke = async () => {
    const ok = await confirm({
      title: 'Revoke this order’s link?',
      body: (
        <p>
          {order.email}&rsquo;s download link stops working. Use this after a refund made outside the payment
          provider; refunds made in the provider&rsquo;s dashboard are applied automatically.
        </p>
      ),
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (ok)
      await run('revoke', () => repo.shop.updateOrder(order.id, { status: 'revoked' }), 'Link revoked.');
  };

  return (
    <li className={styles.order} data-order={order.id} data-status={order.status}>
      <div className={styles.orderMain}>
        <span className={styles.orderBuyer}>
          <span className={styles.orderEmail}>{order.email}</span>
          {order.buyer_name && <span className={ui.help}>{order.buyer_name}</span>}
        </span>
        <span className={styles.orderProduct}>{order.product_title}</span>
        <span className={styles.orderMeta}>
          <time dateTime={order.created_at}>{dateTime(order.created_at)}</time>
          <span data-downloads>{downloadsText(order)}</span>
        </span>
      </div>
      <div className={styles.orderSide}>
        <span className={styles.orderAmount}>
          {order.status === 'free' ? 'Free' : formatPrice(order.amount, order.currency)}
        </span>
        <span className={styles.orderStatus} data-tone={order.status}>
          {statusLabels[order.status]}
        </span>
      </div>
      {active && (
        <div className={styles.orderActions}>
          <Button size="small" icon="mail" onClick={resend} busy={busy === 'resend'} disabled={!!busy}>
            Re-send link
          </Button>
          <Button size="small" icon="undo" onClick={reset} busy={busy === 'reset'} disabled={!!busy}>
            Reset downloads
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => void revoke()}
            busy={busy === 'revoke'}
            disabled={!!busy}
          >
            Revoke
          </Button>
        </div>
      )}
    </li>
  );
}

export function OrdersPage() {
  const repo = useRepository();
  const products = useAdminList('products');
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(ORDERS_PAGE);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filters = { status, productId, search: query, limit };
  const list = useQuery({
    queryKey: shopKeys.orderList(filters),
    queryFn: () => repo.shop.orders(filters),
    placeholderData: (prev) => prev,
    staleTime: 0,
  });
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const filtered = !!(status || productId || query);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Everyone who bought or downloaded a product, newest first. The payment provider sends buyers their receipts."
      />
      <PageBody wide>
        <ShopModeNotice />
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Icon name="search" />
            <span className={ui.visuallyHidden}>Search orders</span>
            <input
              type="search"
              placeholder="Search by email or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className={styles.productFilter}>
            <span className={ui.visuallyHidden}>Product</span>
            <select
              className={ui.select}
              value={productId ?? ''}
              onChange={(e) => {
                setProductId(e.target.value || null);
                setLimit(ORDERS_PAGE);
              }}
            >
              <option value="">All products</option>
              {(products.data ?? []).map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {String(p.title)}
                </option>
              ))}
            </select>
          </label>
          <div className={listStyles.filters} role="group" aria-label="Status">
            {statusFilters.map((s) => (
              <button
                key={s ?? 'all'}
                type="button"
                aria-pressed={status === s}
                className={listStyles.chip}
                onClick={() => {
                  setStatus(s);
                  setLimit(ORDERS_PAGE);
                }}
              >
                {s ? statusLabels[s] : 'All'}
              </button>
            ))}
          </div>
        </div>

        {list.isError ? (
          <Notice
            tone="error"
            action={
              <Button size="small" onClick={() => list.refetch()}>
                Retry
              </Button>
            }
          >
            {isRepoError(list.error) ? list.error.message : 'Couldn’t load orders.'}
          </Notice>
        ) : list.isPending ? (
          <div className={styles.skeletons}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height="4.5rem" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            <p>
              {filtered
                ? 'No orders match.'
                : 'No orders yet. They appear here as soon as a payment is confirmed or someone claims a free product.'}
            </p>
          </div>
        ) : (
          <>
            <ul className={styles.orders} aria-busy={list.isFetching || undefined}>
              {rows.map((o) => (
                <OrderItem key={o.id} order={o} />
              ))}
            </ul>
            <div className={styles.listFoot}>
              <span data-total>
                Showing {rows.length} of {total}
              </span>
              {rows.length < total && (
                <Button size="small" onClick={() => setLimit((n) => n + ORDERS_PAGE)}>
                  Show more
                </Button>
              )}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
