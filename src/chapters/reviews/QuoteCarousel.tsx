/**
 * One card at a time, with prev/next, position markers, arrow keys and swipe (spec 06
 * RV-1 – RV-4). No autoplay. Every item stays in the page (the hidden ones are only
 * invisible), so screen readers and search engines get all of them; the change is
 * announced politely. Used by Reviews and by custom sections with the carousel layout.
 */
import { useRef, useState, type ReactNode } from 'react';
import styles from './reviews.module.css';

export function QuoteCarousel<T extends { id: string }>({
  items,
  render,
  label,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  /** what the items are, for screen readers ("Testimonials") */
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const swipe = useRef<{ x: number; id: number } | null>(null);
  const count = items.length;
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  return (
    <section className={styles.carousel} aria-roledescription="carousel" aria-label={label} data-carousel>
      <div
        className={styles.stage}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, id: e.pointerId };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {items.map((item, i) => (
          <div
            key={item.id}
            className={styles.slide}
            data-active={i === index || undefined}
            data-slide={i}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            role="group"
            // tabbing onto a link in a hidden slide brings that slide into view
            onFocus={() => setIndex(i)}
          >
            {render(item, i)}
          </div>
        ))}
      </div>

      <div
        className={styles.controls}
        role="group"
        aria-label={`${label} controls`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(-1);
          }
        }}
      >
        <button type="button" className={styles.arrow} onClick={() => go(-1)} aria-label="Previous">
          ←
        </button>
        <p className={`label ${styles.position}`}>
          <span className={styles.positionNow}>{String(index + 1).padStart(2, '0')}</span> /{' '}
          {String(count).padStart(2, '0')}
        </p>
        <ol className={styles.markers} aria-hidden>
          {items.map((item, i) => (
            <li key={item.id} data-active={i === index || undefined} />
          ))}
        </ol>
        <button type="button" className={styles.arrow} onClick={() => go(1)} aria-label="Next">
          →
        </button>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {label} {index + 1} of {count}
      </p>
    </section>
  );
}
