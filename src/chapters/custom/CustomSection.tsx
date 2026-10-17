/**
 * A custom section in the layout chosen in the admin (spec 06 §2.7): grid, list,
 * timeline, carousel or gallery. Used on the home page (up to 6 items, "See all") and on
 * the section's own page.
 */
import { createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { LazyMarkdown } from '../../components/markdown/LazyMarkdown';
import { Link } from 'react-router';
import { Img } from '../../components/Img';
import type { CustomItem, CustomSection as Section } from '../../data/schemas';
import { GalleryViewer } from '../project/GalleryViewer';
import { QuoteCarousel } from '../reviews/QuoteCarousel';
import { formatMonth } from '../shared/dates';
import { byDateDesc, itemView, type ItemView } from './itemView';
import styles from './custom.module.css';

export const HOME_LIMIT = 6;

/** Item titles are h3 under a home-page chapter (h2), h2 on the section's own page (h1). */
const HeadingLevel = createContext<'h2' | 'h3'>('h3');
function ItemHeading({ className, children }: { className?: string; children: ReactNode }) {
  return useContext(HeadingLevel) === 'h2' ? (
    <h2 className={className}>{children}</h2>
  ) : (
    <h3 className={className}>{children}</h3>
  );
}

interface Entry {
  id: string;
  view: ItemView;
}

/** "Jul 2023" for a full date, or the year alone for "2023". */
const when = (d: string | null) => (d ? (/^\d{4}-\d{2}/.test(d) ? formatMonth(d) : d) : null);

function Links({ view }: { view: ItemView }) {
  if (!view.links.length) return null;
  return (
    <span className={styles.links}>
      {view.links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noopener">
          {l.label} <span aria-hidden>↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
    </span>
  );
}

function Tags({ view }: { view: ItemView }) {
  if (!view.tags.length) return null;
  return (
    <ul className={styles.tags}>
      {view.tags.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Meta({ view }: { view: ItemView }) {
  const parts = [view.subtitle, when(view.date)].filter(Boolean);
  return parts.length ? <p className={styles.meta}>{parts.join(' · ')}</p> : null;
}

/* ------------------------------------------------------------------ */
/* Layouts                                                             */
/* ------------------------------------------------------------------ */

function Grid({ entries }: { entries: Entry[] }) {
  return (
    <ul className={styles.grid}>
      {entries.map(({ id, view }, i) => (
        <li key={id} className={styles.card} data-reveal="up" style={{ '--i': i } as CSSProperties}>
          {view.image && <Img image={view.image} className={styles.cardImage} />}
          <div className={styles.cardBody}>
            <ItemHeading className={styles.cardTitle}>{view.title}</ItemHeading>
            <Meta view={view} />
            {view.body && (
              <div className={`${styles.prose} ${styles.clamp}`}>
                <LazyMarkdown>{view.body}</LazyMarkdown>
              </div>
            )}
            <Tags view={view} />
            <Links view={view} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function List({ entries }: { entries: Entry[] }) {
  return (
    <ul className={styles.list}>
      {entries.map(({ id, view }, i) => (
        <li key={id} className={styles.row} data-reveal="up" style={{ '--i': i } as CSSProperties}>
          {view.image && <Img image={view.image} className={styles.rowImage} />}
          <div className={styles.rowMain}>
            <ItemHeading className={styles.rowTitle}>{view.title}</ItemHeading>
            {view.subtitle && <p className={styles.muted}>{view.subtitle}</p>}
            <Tags view={view} />
          </div>
          <div className={styles.rowSide}>
            {view.date && <span className={`label ${styles.muted}`}>{when(view.date)}</span>}
            <Links view={view} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ entries }: { entries: Entry[] }) {
  return (
    <ol className={styles.timeline}>
      {byDateDesc(entries).map(({ id, view }, i) => (
        <li key={id} className={styles.tlItem} data-reveal="up" style={{ '--i': i } as CSSProperties}>
          <span className={`label ${styles.tlDate}`}>{when(view.date) ?? '—'}</span>
          <div className={styles.tlBody}>
            <ItemHeading className={styles.rowTitle}>{view.title}</ItemHeading>
            {view.subtitle && <p className={styles.muted}>{view.subtitle}</p>}
            {view.body && (
              <div className={styles.prose}>
                <LazyMarkdown>{view.body}</LazyMarkdown>
              </div>
            )}
            {view.image && <Img image={view.image} className={styles.tlImage} />}
            <Tags view={view} />
            <Links view={view} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Carousel({ entries, name }: { entries: Entry[]; name: string }) {
  return (
    <QuoteCarousel
      items={entries}
      label={name}
      render={({ view }) => (
        <article className={styles.slide}>
          {view.image && <Img image={view.image} className={styles.slideImage} />}
          <div className={styles.slideText}>
            <ItemHeading className={styles.slideTitle}>{view.title}</ItemHeading>
            <Meta view={view} />
            {view.body && (
              <div className={styles.prose}>
                <LazyMarkdown>{view.body}</LazyMarkdown>
              </div>
            )}
            <Tags view={view} />
            <Links view={view} />
          </div>
        </article>
      )}
    />
  );
}

function Gallery({ entries }: { entries: Entry[] }) {
  const withImages = entries.filter((e) => e.view.image);
  const images = withImages.map((e) => e.view.image!);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <ul className={styles.gallery}>
        {withImages.map(({ id, view }, i) => (
          <li key={id} data-reveal="up" style={{ '--i': i } as CSSProperties}>
            <button
              type="button"
              className={styles.thumb}
              onClick={() => setOpen(i)}
              data-cursor="view"
              aria-label={`Open ${view.title}`}
            >
              <Img image={view.image!} />
              <span className={styles.thumbCaption}>
                <span className={styles.thumbTitle}>{view.title}</span>
                {(view.subtitle || view.date) && (
                  <span className="label">
                    {[view.subtitle, when(view.date)].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <GalleryViewer images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */

export function CustomSectionView({
  section,
  items,
  variant,
}: {
  section: Section;
  items: CustomItem[];
  variant: 'home' | 'page';
}) {
  const entries = useMemo<Entry[]>(
    () =>
      items.map((it, i) => ({
        id: it.id,
        view: itemView(section.fields, it.data as Record<string, unknown>, i),
      })),
    [items, section.fields],
  );
  const shown = variant === 'home' ? entries.slice(0, HOME_LIMIT) : entries;

  return (
    <HeadingLevel.Provider value={variant === 'page' ? 'h2' : 'h3'}>
      <div className={styles.section} data-layout={section.layout}>
        {variant === 'home' && section.intro && <p className={styles.intro}>{section.intro}</p>}
        {shown.length === 0 ? (
          <p className={styles.muted}>Nothing here yet.</p>
        ) : section.layout === 'grid' ? (
          <Grid entries={shown} />
        ) : section.layout === 'timeline' ? (
          <Timeline entries={shown} />
        ) : section.layout === 'carousel' ? (
          shown.length < 3 ? (
            <Grid entries={shown} />
          ) : (
            <Carousel entries={shown} name={section.name} />
          )
        ) : section.layout === 'gallery' ? (
          <Gallery entries={shown} />
        ) : (
          <List entries={shown} />
        )}
        {variant === 'home' && section.has_page && (
          <p>
            <Link to={`/s/${section.slug}`} viewTransition className={styles.seeAll}>
              See all of {section.name}
              {entries.length > shown.length ? ` (${entries.length})` : ''} <span aria-hidden>→</span>
            </Link>
          </p>
        )}
      </div>
    </HeadingLevel.Provider>
  );
}
