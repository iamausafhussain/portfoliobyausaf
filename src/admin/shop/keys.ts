/** Query keys for the shop admin (spec 08 §2.4); all under "admin" so sign-out clears them. */
import type { OrderQuery } from '../repository/types';

export const shopKeys = {
  all: ['admin', 'shop'] as const,
  status: ['admin', 'shop', 'status'] as const,
  file: (productId: string) => ['admin', 'shop', 'file', productId] as const,
  orders: ['admin', 'shop', 'orders'] as const,
  orderList: (q: OrderQuery) =>
    ['admin', 'shop', 'orders', q.status ?? '', q.productId ?? '', q.search ?? '', q.limit] as const,
  sales: (days: number) => ['admin', 'shop', 'orders', 'sales', days] as const,
  pages: ['admin', 'shop', 'pages'] as const,
  discounts: ['admin', 'shop', 'discounts'] as const,
};
