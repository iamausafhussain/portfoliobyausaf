/** /shop/:slug — one product (spec 08 BX-3 – BX-6, CO-1, CO-9). */
import { track } from '../../analytics/track';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { Img } from '../../components/Img';
import { LazyMarkdown } from '../../components/markdown/LazyMarkdown';
import { useProduct } from '../../data/queries/public';
import { getPublicSource } from '../../data/source';
import {
  codeFromSearch,
  DOWNLOAD_DAYS,
  DOWNLOAD_LIMIT,
  formatPrice,
  formatSize,
  preferredCurrency,
  productKindLabels,
  ShopError,
  shopErrorText,
  type Currency,
} from '../../data/shop';
import { useDocumentTitle, useMetaDescription, useNoIndex } from '../../shell/hooks';
import { GalleryViewer } from '../project/GalleryViewer';
import pageStyles from '../pages.module.css';
import { PolicyLinks } from './PolicyLinks';
import styles from './shop.module.css';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const monthYear = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(iso));

function FreeClaim({ productId }: { productId: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setState('sending');
    setError(null);
    try {
      await (await getPublicSource()).shop.claimFree(productId, email.trim());
      track('free_claim', { product: productId });
      setState('sent');
    } catch (err) {
      setError(shopErrorText[err instanceof ShopError ? err.code : 'server']);
      setState('idle');
    }
  }
  if (state === 'sent') {
    return (
      <p className={styles.claimSent} role="status" data-claim-sent>
        Check your inbox: the download link is on its way to <strong>{email.trim()}</strong>.
      </p>
    );
  }
  return (
    <form className={styles.claim} onSubmit={submit} noValidate data-claim>
      <label htmlFor="claim-email" className={styles.claimLabel}>
        Where should I send it?
      </label>
      <div className={styles.claimRow}>
        <input
          id="claim-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'claim-error' : undefined}
        />
        <button type="submit" className={styles.buy} aria-busy={state === 'sending' || undefined}>
          {state === 'sending' ? 'Sending…' : 'Send me the download'}
        </button>
      </div>
      {error && (
        <p id="claim-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function Component() {
  const { slug = '' } = useParams();
  const q = useProduct(slug);
  const p = q.data;
  const navigate = useNavigate();
  useDocumentTitle(q.isPending ? undefined : (p?.title ?? 'Product not found'));
  useMetaDescription(p?.tagline);
  useNoIndex(!q.isPending && !p);
  const hasInr = p?.price_inr != null;
  const [chosen, setChosen] = useState<Currency | null>(null);
  const currency: Currency = chosen ?? preferredCurrency(hasInr);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  // a code link (?code=…) applies its discount at checkout (spec 08 DC-4)
  const { search } = useLocation();
  const linkCode = codeFromSearch(search);
  const [codeRemoved, setCodeRemoved] = useState(false);
  const [codeRejected, setCodeRejected] = useState(false);
  const code = linkCode && !codeRemoved ? linkCode : null;
  // a discount-code link was opened (spec 09 TR-3)
  const productId = q.data?.id;
  useEffect(() => {
    if (productId && linkCode) track('code_link', { product: productId, detail: linkCode });
  }, [productId, linkCode]);

  if (q.isPending) {
    return (
      <article className={pageStyles.wide} aria-busy="true">
        <div className={pageStyles.skeletonTitle} />
        <div className={pageStyles.skeletonBlock} />
      </article>
    );
  }
  if (!p) return <NotFoundPage />;

  const price = currency === 'INR' && p.price_inr != null ? p.price_inr : (p.price_usd ?? 0);
  const shownCurrency: Currency = currency === 'INR' && p.price_inr != null ? 'INR' : 'USD';

  async function buy(withCode = code) {
    if (!p) return;
    setBusy(true);
    setError(null);
    setCodeRejected(false);
    track('buy_click', { product: p.id, detail: shownCurrency });
    try {
      const { url } = await (await getPublicSource()).shop.checkout(p.id, shownCurrency, withCode);
      // the demo's stand-in checkout is a page of this site; the real one is the provider's
      if (url.startsWith('/')) navigate(url);
      else window.location.assign(url);
    } catch (err) {
      const why = err instanceof ShopError ? err.code : 'server';
      setError(shopErrorText[why]);
      setCodeRejected(why === 'code_invalid');
      setBusy(false);
    }
  }

  const facts = [
    p.file_format && {
      label: 'Format',
      value: [p.file_format, formatSize(p.file_size)].filter(Boolean).join(' · '),
    },
    p.version && { label: 'Version', value: p.version },
    p.requirements && { label: 'Works with', value: p.requirements },
    { label: 'Updated', value: monthYear(p.updated_at) },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <article className={`${pageStyles.wide} ${styles.productPage}`} data-product-page={p.slug}>
      <Link to="/shop" viewTransition className={styles.back}>
        <span aria-hidden>←</span> Box Office
      </Link>
      <div className={styles.productLayout}>
        <div className={styles.productArt}>
          {p.cover ? (
            <Img image={p.cover} className={styles.productCover} />
          ) : (
            <span className={`${styles.productCover} ${styles.posterBlank}`} aria-hidden>
              {p.title.slice(0, 1)}
            </span>
          )}
          {p.gallery.length > 0 && (
            <ul className={styles.thumbs} aria-label="Previews">
              {p.gallery.map((img, i) => (
                <li key={img.path}>
                  <button
                    type="button"
                    onClick={() => setViewer(i)}
                    data-cursor="view"
                    aria-label={`Open preview ${i + 1}: ${img.alt}`}
                  >
                    <Img image={img} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.productInfo}>
          <p className="label">
            {productKindLabels[p.kind]}
            {p.version ? ` · v${p.version.replace(/^v/i, '')}` : ''}
          </p>
          <h1 className={styles.productTitle}>{p.title}</h1>
          {p.tagline && <p className={pageStyles.lead}>{p.tagline}</p>}

          <section className={styles.buyBox} aria-label={p.is_free ? 'Download' : 'Buy'} data-buy-box>
            {p.is_free ? (
              <>
                <p className={styles.price}>Free</p>
                <FreeClaim productId={p.id} />
              </>
            ) : (
              <>
                <div className={styles.priceRow}>
                  <p className={styles.price} data-price>
                    {formatPrice(price, shownCurrency)}
                  </p>
                  {hasInr && (
                    <div className={styles.currency} role="group" aria-label="Currency">
                      {(['USD', 'INR'] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={shownCurrency === c}
                          onClick={() => setChosen(c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {code && (
                  <p className={styles.codeNote} data-code={code}>
                    Code <span className={styles.codeChip}>{code}</span> is applied at checkout.
                    <button
                      type="button"
                      className={styles.codeRemove}
                      onClick={() => {
                        setCodeRemoved(true);
                        setError(null);
                        setCodeRejected(false);
                      }}
                    >
                      Remove
                    </button>
                  </p>
                )}
                <button
                  type="button"
                  className={styles.buy}
                  onClick={() => void buy()}
                  aria-busy={busy || undefined}
                  disabled={busy}
                  data-buy
                >
                  {busy ? 'Opening checkout…' : `Buy · ${formatPrice(price, shownCurrency)}`}
                </button>
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                    {codeRejected && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className={styles.codeRemove}
                          onClick={() => {
                            setCodeRemoved(true);
                            void buy(null);
                          }}
                          data-buy-without-code
                        >
                          Buy without the code
                        </button>
                      </>
                    )}
                  </p>
                )}
                <p className={styles.buyNote}>
                  Secure checkout on our payment partner&rsquo;s page; you&rsquo;ll get a receipt by email.
                  Have a discount code? Enter it there.
                  {shownCurrency === 'INR' ? ' Prices in INR are for buyers in India.' : ''}
                </p>
              </>
            )}
            <p className={styles.buyNote}>
              Instant download · the link works {DOWNLOAD_LIMIT} times within {DOWNLOAD_DAYS} days.
            </p>
          </section>

          {p.included.length > 0 && (
            <section className={styles.detailBlock}>
              <h2 className="label">What&rsquo;s included</h2>
              <ul className={styles.included}>
                {p.included.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}
          <dl className={styles.facts}>
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="label">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          {p.description.trim() && (
            <div className={styles.description}>
              <LazyMarkdown>{p.description}</LazyMarkdown>
            </div>
          )}
          <PolicyLinks />
        </div>
      </div>
      <GalleryViewer images={p.gallery} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
    </article>
  );
}
