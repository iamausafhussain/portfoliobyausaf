/** "Admit one" ticket for the thank-you and download pages (spec 08 §3.5). */
import type { ReactNode } from 'react';
import { Img } from '../../components/Img';
import type { ImageRef } from '../../data/schemas';
import styles from './shop.module.css';

export function Ticket({
  title,
  cover,
  eyebrow = 'Admit one',
  children,
  state,
  label = 'Your download',
}: {
  title: string;
  cover?: ImageRef | null;
  eyebrow?: string;
  children: ReactNode;
  state?: string;
  label?: string;
}) {
  return (
    <section className={styles.ticket} data-ticket={state} aria-label={label}>
      {cover && <Img image={cover} className={styles.ticketCover} />}
      <div className={styles.ticketBody}>
        <p className={`label ${styles.ticketEyebrow}`}>{eyebrow}</p>
        <h2 className={styles.ticketTitle}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

/**
 * Starts a download from a short-lived link. Stored files arrive as attachments (the page
 * stays); an external link (e.g. Google Drive) opens in place of this page.
 */
export function startDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  if (url.startsWith('blob:')) a.download = '';
  document.body.append(a);
  a.click();
  a.remove();
}
