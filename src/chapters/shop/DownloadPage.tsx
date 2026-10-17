/** /d/:token — a buyer's download page (spec 08 CO-5, CO-6). */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { getPublicSource } from '../../data/source';
import { DOWNLOAD_LIMIT, formatSize, ShopError, shopErrorText, type DownloadInfo } from '../../data/shop';
import { useDocumentTitle } from '../../shell/hooks';
import pageStyles from '../pages.module.css';
import styles from './shop.module.css';
import { startDownload, Ticket } from './Ticket';

const longDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(iso));

const blockText: Record<NonNullable<DownloadInfo['block']>, string> = {
  refunded: shopErrorText.refunded,
  revoked: shopErrorText.revoked,
  expired: 'This download link has expired.',
  used_up: `This link has been used ${DOWNLOAD_LIMIT} times, the most it allows.`,
};

export function Component() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const key = ['shop', 'download', token];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => (await getPublicSource()).shop.downloadInfo(token),
    // limits change with every download, so never show an old answer
    staleTime: 0,
    retry: (n, err) => !(err instanceof ShopError && err.code === 'not_found') && n < 2,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useDocumentTitle('Your download');

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await (await getPublicSource()).shop.download(token);
      startDownload(url);
    } catch (err) {
      setError(shopErrorText[err instanceof ShopError ? err.code : 'server']);
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: key });
    }
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const r = await (await getPublicSource()).shop.refresh(token);
      setSentTo(r.email);
    } catch (err) {
      setError(shopErrorText[err instanceof ShopError ? err.code : 'server']);
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (q.isPending) {
    body = <div className={pageStyles.skeletonBlock} aria-hidden />;
  } else if (q.isError || !q.data) {
    const notFound = q.error instanceof ShopError && q.error.code === 'not_found';
    body = (
      <Ticket
        title={notFound ? 'This link isn’t valid' : 'Couldn’t load your download'}
        eyebrow="Box Office"
        state="invalid"
      >
        <p className={pageStyles.muted}>
          {notFound
            ? 'Check that you opened the whole link from your email. A newer link may have replaced this one.'
            : shopErrorText.server}
        </p>
        <Link to="/shop">Back to the shop</Link>
      </Ticket>
    );
  } else {
    const d = q.data;
    const meta = [
      d.product.format,
      formatSize(d.product.size),
      d.product.version && `v${d.product.version.replace(/^v/i, '')}`,
    ]
      .filter(Boolean)
      .join(' · ');
    body = (
      <Ticket title={d.product.title} cover={d.product.cover} state={d.block ?? 'ok'}>
        {meta && <p className={pageStyles.muted}>{meta}</p>}
        {!d.block ? (
          <>
            <div className={styles.ticketActions}>
              <button
                type="button"
                className={styles.buy}
                onClick={download}
                aria-busy={busy || undefined}
                data-download
              >
                {busy ? 'Preparing…' : 'Download'}
              </button>
            </div>
            <p className={styles.buyNote} data-left>
              {d.left} of {DOWNLOAD_LIMIT} downloads left · link valid until {longDate(d.expires_at)}
            </p>
          </>
        ) : (
          <>
            <p data-block={d.block}>{blockText[d.block]}</p>
            {sentTo ? (
              <p role="status" data-sent>
                A fresh link is on its way to {sentTo}. This one no longer works.
              </p>
            ) : d.can_refresh ? (
              <div className={styles.ticketActions}>
                <button
                  type="button"
                  className={styles.buy}
                  onClick={refresh}
                  aria-busy={busy || undefined}
                  data-refresh
                >
                  Send me a fresh link
                </button>
                <p className={styles.buyNote}>It goes to the email you used ({d.email}).</p>
              </div>
            ) : d.block === 'expired' || d.block === 'used_up' ? (
              <p className={pageStyles.muted}>
                Need it again? Get in touch through the contact form and I&rsquo;ll help.
              </p>
            ) : null}
          </>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </Ticket>
    );
  }

  return (
    <article className={pageStyles.page}>
      <header className={pageStyles.head}>
        <p className="label">Box Office</p>
        <h1 className={pageStyles.title}>Your download</h1>
      </header>
      {body}
    </article>
  );
}
