/** Which payment mode is active and what's still missing (spec 08 CO-10). */
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '../repository';
import type { ShopStatus } from '../repository/types';
import { Notice } from '../ui/primitives';
import { shopKeys } from './keys';

const missingNames: Record<keyof ShopStatus['configured'], string> = {
  provider: 'DODO_API_KEY',
  webhook: 'DODO_WEBHOOK_SECRET',
  tokens: 'SHOP_TOKEN_SECRET',
  email: 'RESEND_API_KEY',
  site: 'SITE_URL',
};

export function ShopModeNotice() {
  const repo = useRepository();
  const q = useQuery({ queryKey: shopKeys.status, queryFn: () => repo.shop.status(), staleTime: 60_000 });
  if (q.isPending) return null;
  if (q.isError)
    return (
      <Notice tone="warn">
        <span data-shop-mode="unknown">
          Couldn&rsquo;t reach the shop functions, so checkout and downloads won&rsquo;t work yet. Deploy them
          (setup guide, step D3).
        </span>
      </Notice>
    );
  const s = q.data;
  const missing = (Object.keys(s.configured) as (keyof ShopStatus['configured'])[]).filter(
    (k) => !s.configured[k],
  );
  const mode =
    s.provider === 'demo'
      ? 'Demo mode: payments are simulated, nothing is charged.'
      : s.mode === 'live'
        ? 'Live mode: buyers are charged for real.'
        : 'Test mode: use the provider’s test cards; nothing is charged.';
  return (
    <Notice tone={missing.length ? 'warn' : 'info'}>
      <span data-shop-mode={s.provider === 'demo' ? 'demo' : s.mode}>
        <strong>{mode}</strong>
        {missing.length > 0 && (
          <>
            {' '}
            Still to set in Supabase secrets: {missing.map((k) => missingNames[k]).join(', ')} (setup guide,
            section D).
          </>
        )}
      </span>
    </Notice>
  );
}
