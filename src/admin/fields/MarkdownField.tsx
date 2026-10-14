/** Markdown with a small toolbar and a safe preview (AD-26: raw HTML is never rendered). */
import { useRef, useState } from 'react';
import { useController } from 'react-hook-form';
import Markdown from 'react-markdown';
import { FieldShell } from '../ui/FieldShell';
import { cx, ui } from '../ui/primitives';
import { useFieldError, type BaseFieldProps } from './basic';
import styles from './fields.module.css';

type Action = { label: string; title: string; apply: (sel: string) => { text: string; cursor?: number } };

const actions: Action[] = [
  { label: 'B', title: 'Bold', apply: (s) => ({ text: `**${s || 'bold text'}**` }) },
  { label: 'I', title: 'Italic', apply: (s) => ({ text: `*${s || 'italic text'}*` }) },
  { label: 'H', title: 'Heading', apply: (s) => ({ text: `\n## ${s || 'Heading'}\n` }) },
  {
    label: '•',
    title: 'Bulleted list',
    apply: (s) => ({ text: `\n- ${(s || 'Item').split('\n').join('\n- ')}\n` }),
  },
  { label: 'Link', title: 'Link', apply: (s) => ({ text: `[${s || 'link text'}](https://)` }) },
];

/** Insert markdown around the current selection. Exported for tests. */
export function applyAction(
  value: string,
  start: number,
  end: number,
  action: Action,
): { value: string; cursor: number } {
  const { text } = action.apply(value.slice(start, end));
  return { value: value.slice(0, start) + text + value.slice(end), cursor: start + text.length };
}

export function MarkdownField({
  name,
  label,
  required,
  help,
  max,
  rows = 10,
}: BaseFieldProps & { max: number; rows?: number }) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const area = useRef<HTMLTextAreaElement | null>(null);
  const value = typeof field.value === 'string' ? field.value : '';

  const run = (action: Action) => {
    const el = area.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = applyAction(value, start, end, action);
    field.onChange(next.value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  return (
    <FieldShell
      label={label}
      required={required}
      error={error}
      help={help ?? 'Markdown: **bold**, *italic*, ## headings, - lists, [links](https://…).'}
      count={{ length: value.length, max }}
    >
      {(a11y) => (
        <div className={styles.markdown}>
          <div className={styles.mdBar}>
            <div role="tablist" aria-label={`${label} editor`} className={styles.mdTabs}>
              {(['write', 'preview'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={cx(styles.mdTab, tab === t && styles.mdTabOn)}
                  onClick={() => setTab(t)}
                >
                  {t === 'write' ? 'Write' : 'Preview'}
                </button>
              ))}
            </div>
            {tab === 'write' && (
              <div className={styles.mdTools} role="toolbar" aria-label="Formatting">
                {actions.map((a) => (
                  <button
                    key={a.title}
                    type="button"
                    title={a.title}
                    aria-label={a.title}
                    onClick={() => run(a)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tab === 'write' ? (
            <textarea
              {...a11y}
              ref={(el) => {
                area.current = el;
                field.ref(el);
              }}
              name={field.name}
              className={ui.textarea}
              rows={rows}
              value={value}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
            />
          ) : (
            <div className={styles.mdPreview} tabIndex={0} aria-label={`${label} preview`}>
              {value.trim() ? (
                <Markdown skipHtml>{value}</Markdown>
              ) : (
                <p className={ui.help}>Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </FieldShell>
  );
}
