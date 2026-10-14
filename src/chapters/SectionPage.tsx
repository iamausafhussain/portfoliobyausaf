/** /s/:slug — a custom section's own page (spec 03 RT-2). Items render by field type. */
import Markdown from 'react-markdown';
import { useParams } from 'react-router';
import { NotFoundPage } from '../app/NotFoundPage';
import { Img } from '../components/Img';
import { usePublishedCustomSections } from '../data/queries/public';
import type { FieldDefinition, ImageRef } from '../data/schemas';
import { itemTitle } from '../data/schemas';
import { useDocumentTitle } from '../shell/hooks';
import styles from './pages.module.css';

const isImage = (v: unknown): v is ImageRef => !!v && typeof v === 'object' && 'path' in v && 'alt' in v;

function FieldValue({ field, value }: { field: FieldDefinition; value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  switch (field.type) {
    case 'image':
      return isImage(value) ? <Img image={value} className={styles.itemImage} /> : null;
    case 'markdown':
      return typeof value === 'string' ? (
        <div className={styles.prose}>
          <Markdown skipHtml>{value}</Markdown>
        </div>
      ) : null;
    case 'url':
      return typeof value === 'string' ? (
        <a href={value} target="_blank" rel="noopener">
          {field.label} ↗
        </a>
      ) : null;
    case 'tags':
      return Array.isArray(value) && value.length ? (
        <ul className={styles.tags}>
          {value.map((t) => (
            <li key={String(t)}>{String(t)}</li>
          ))}
        </ul>
      ) : null;
    case 'boolean':
      return value === true ? <span className="label">{field.label}</span> : null;
    case 'date':
      return typeof value === 'string' ? (
        <time dateTime={value} className={styles.muted}>
          {new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </time>
      ) : null;
    case 'long_text':
      return <p className={styles.preLine}>{String(value)}</p>;
    default:
      return (
        <p>
          <span className={styles.muted}>{field.label}: </span>
          {String(value)}
        </p>
      );
  }
}

export function Component() {
  const { slug = '' } = useParams();
  const q = usePublishedCustomSections();
  const found = q.data?.find((s) => s.section.slug === slug && s.section.has_page);
  useDocumentTitle(q.isPending ? undefined : (found?.section.name ?? 'Scene not found'));

  if (q.isPending) {
    return (
      <article className={styles.page} aria-busy="true">
        <div className={styles.skeletonTitle} />
        <div className={styles.skeletonBlock} />
      </article>
    );
  }
  if (!found) return <NotFoundPage />;

  const { section, items } = found;
  const titleField = section.fields.find((f) => f.type === 'text');

  return (
    <article className={styles.page}>
      <header className={styles.head}>
        <p className="label">Section</p>
        <h1 className={styles.title}>{section.name}</h1>
        {section.intro && <p className={styles.lead}>{section.intro}</p>}
      </header>
      {items.length === 0 ? (
        <p className={styles.muted}>Nothing here yet.</p>
      ) : (
        <ul className={styles.items}>
          {items.map((item, i) => (
            <li key={item.id} className={styles.item}>
              <h2 className={styles.itemTitle}>{itemTitle(section.fields, item.data, i)}</h2>
              {section.fields
                .filter((f) => f !== titleField)
                .map((f) => (
                  <FieldValue key={f.key} field={f} value={item.data[f.key]} />
                ))}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
