/**
 * /shop/thanks?ref=…&payment_id=…&status=… — after checkout (spec 08 CO-3, CO-3a). Waits for
 * the payment to be confirmed (the provider's webhook), then offers the download; a payment
 * that didn't go through says so and offers to try again. The ref is the buyer's private
 * reference from their return address; Dodo adds payment_id and status.
 */
import { track } from '../../analytics/track';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getPublicSource } from '../../data/source';
import { ShopError, shopErrorText, type OrderStatusReply } from '../../data/shop';
import { useDocumentTitle, useNoIndex } from '../../shell/hooks';
import pageStyles from '../pages.module.css';
import styles from './shop.module.css';
import { startDownload, Ticket } from './Ticket';

export const POLL_MS = 1500;
/** After this long the page stops waiting and points to the email (about a minute). */
export const POLL_TRIES = 40;

/** Dodo's own verdict in the return address; display only (the server decides about money). */
export const FAILED_RETURN_STATUSES = ['failed', 'cancelled', 'requires_payment_method'];

export function Component() {
  const [params] = useSearchParams();
  const ref = params.get('ref') ?? '';
  const validRef = /^[A-Za-z0-9_-]{43}$/.test(ref);
  const paymentId = params.get('payment_id');
  const returnedFailed = FAILED_RETURN_STATUSES.includes(params.get('status') ?? '');
  const [reply, setReply] = useState<OrderStatusReply | null>(null);
  const [failed, setFailed] = useState<OrderStatusReply['product'] | false>(false);
  const [slow, setSlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useNoIndex();
  useDocumentTitle('Thank you');

  useEffect(() => {
    if (!validRef) return;
    let tries = 0;
    let timer = 0;
    let stopped = false;
    const poll = async () => {
      tries += 1;
      try {
        const r = await (await getPublicSource()).shop.orderStatus(ref, paymentId);
        if (stopped) return;
        if (r.ready || r.expired) {
          if (r.ready) track('checkout_return', { detail: 'paid' });
          setReply(r);
          return;
        }
        // a failed payment never turns into a paid one: stop waiting
        if (r.failed || returnedFailed) {
          track('checkout_return', { detail: 'failed' });
          setFailed(r.product ?? null);
          return;
        }
      } catch {
        if (stopped) return;
        if (returnedFailed) {
          setFailed(null);
          return;
        }
        /* keep waiting; the email is the fallback */
      }
      if (stopped) return;
      if (tries >= POLL_TRIES) setSlow(true);
      else timer = window.setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ref, validRef, paymentId, returnedFailed]);

  async function download() {
    if (!reply?.token) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await (await getPublicSource()).shop.download(reply.token);
      track('download');
      startDownload(url);
    } catch (err) {
      setError(shopErrorText[err instanceof ShopError ? err.code : 'server']);
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (!validRef) {
    body = (
      <Ticket title="Nothing to show here" eyebrow="Box Office" state="missing">
        <p className={pageStyles.muted}>
          This page is for after a purchase. If you&rsquo;ve just bought something, the download link is in
          your email.
        </p>
        <Link to="/shop">Back to the shop</Link>
      </Ticket>
    );
  } else if (reply?.ready && reply.token && reply.product) {
    body = (
      <Ticket title={reply.product.title} cover={reply.product.cover} state="ready">
        <p>Thank you! Your payment went through.</p>
        <div className={styles.ticketActions}>
          <button
            type="button"
            className={styles.buy}
            onClick={download}
            aria-busy={busy || undefined}
            data-download
          >
            {busy ? 'Preparing…' : 'Download now'}
          </button>
          <Link to={`/d/${reply.token}`} className={styles.secondaryLink}>
            Open the download page
          </Link>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <p className={styles.buyNote}>The same link is in your email, along with your receipt.</p>
      </Ticket>
    );
  } else if (failed !== false) {
    const again = failed?.slug ? `/shop/${failed.slug}` : '/shop';
    body = (
      <Ticket
        title={failed?.title ?? 'Your order'}
        eyebrow="Not paid"
        cover={failed?.cover ?? null}
        state="failed"
        label="Payment"
      >
        <p>Your payment didn&rsquo;t go through, so nothing was bought. Please try again.</p>
        <p className={pageStyles.muted}>
          If your bank shows a deduction for this attempt, it&rsquo;s reversed automatically by your bank.
        </p>
        <div className={styles.ticketActions}>
          <Link to={again} className={styles.buy} data-try-again>
            Try again
          </Link>
          <Link to="/shop" className={styles.secondaryLink}>
            Back to the shop
          </Link>
        </div>
      </Ticket>
    );
  } else if (slow || reply?.expired) {
    body = (
      <Ticket title="Your payment is being confirmed" eyebrow="Almost there" state="slow">
        <p>
          This is taking longer than usual. As soon as the payment is confirmed, your download link arrives by
          email, so you can safely close this page.
        </p>
        <p className={pageStyles.muted}>
          Nothing there after a few minutes? Check spam, or get in touch through the contact form.
        </p>
      </Ticket>
    );
  } else {
    body = (
      <Ticket title="Confirming your payment…" eyebrow="One moment" state="confirming">
        <p className={styles.spinnerRow} role="status">
          <span className={styles.spinner} aria-hidden /> Waiting for the payment provider to confirm. This
          usually takes a few seconds.
        </p>
      </Ticket>
    );
  }

  return (
    <article className={pageStyles.page}>
      <header className={pageStyles.head}>
        <p className="label">Box Office</p>
        <h1 className={pageStyles.title}>{failed !== false ? 'Payment failed' : 'Thank you'}</h1>
      </header>
      {body}
    </article>
  );
}
