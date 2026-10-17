/**
 * Demo mode only: a stand-in for the payment provider's hosted checkout (spec 08 CO-10).
 * Registered only in development with the demo backend; never in a production build.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { usePublishedProducts } from '../../data/queries/public';
import { getPublicSource } from '../../data/source';
import { formatPrice } from '../../data/shop';
import pageStyles from '../pages.module.css';
import styles from './shop.module.css';

interface DemoShop {
  demoCheckout(
    ref: string,
  ): { productId: string; currency: 'USD' | 'INR'; code: string | null; percent: number } | null;
  demoPay(ref: string, email: string, name: string): Promise<void>;
  demoFail(ref: string): Promise<string>;
}

export function Component() {
  const [params] = useSearchParams();
  const ref = params.get('ref') ?? '';
  const navigate = useNavigate();
  const products = usePublishedProducts();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [session, setSession] = useState<ReturnType<DemoShop['demoCheckout']> | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void getPublicSource().then((s) => {
      if (live) setSession((s.shop as unknown as DemoShop).demoCheckout(ref));
    });
    return () => {
      live = false;
    };
  }, [ref]);
  const product = products.data?.find((p) => p.id === session?.productId);
  const full = session?.currency === 'INR' ? product?.price_inr : product?.price_usd;
  const amount = full != null && session ? Math.round(full * (1 - session.percent / 100)) : full;

  async function pay(e: FormEvent) {
    e.preventDefault();
    const shop = (await getPublicSource()).shop as unknown as DemoShop;
    await shop.demoPay(ref, email || 'buyer@example.com', name);
    // Dodo adds the payment id and its status to the return address
    navigate(`/shop/thanks?ref=${ref}&payment_id=pay_demo&status=succeeded`);
  }

  async function fail() {
    const shop = (await getPublicSource()).shop as unknown as DemoShop;
    const paymentId = await shop.demoFail(ref);
    navigate(`/shop/thanks?ref=${ref}&payment_id=${paymentId}&status=failed`);
  }

  return (
    <article className={pageStyles.page} data-demo-checkout>
      <header className={pageStyles.head}>
        <p className="label">Demo checkout · no real payment</p>
        <h1 className={pageStyles.title}>Checkout</h1>
        <p className={pageStyles.muted}>
          In the live site this is the payment provider&rsquo;s own page (cards, UPI and more).
        </p>
      </header>
      {session === null ? (
        <p>
          This checkout has expired. <Link to="/shop">Back to the shop</Link>
        </p>
      ) : (
        <form className={styles.demoCheckout} onSubmit={pay}>
          <p>
            <strong>{product?.title ?? '…'}</strong>{' '}
            {amount != null && session && (
              <span data-demo-amount>{formatPrice(amount, session.currency)}</span>
            )}
          </p>
          {session?.code && (
            <p data-demo-code>
              Discount {session.code}: {session.percent}% off
            </p>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="buyer@example.com"
            />
          </label>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className={styles.buy}>
            Pay (demo)
          </button>
          <button type="button" className={styles.codeRemove} onClick={() => void fail()} data-demo-fail>
            Simulate a failed payment
          </button>
          {product && <Link to={`/shop/${product.slug}`}>Cancel</Link>}
        </form>
      )}
    </article>
  );
}
