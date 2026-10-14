/** Tags: type and press Enter or comma; suggestions from tags used elsewhere (AD-27). */
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useController } from 'react-hook-form';
import { FieldShell } from '../ui/FieldShell';
import { Icon } from '../ui/Icon';
import { ui } from '../ui/primitives';
import { useFieldError, type BaseFieldProps } from './basic';
import styles from './fields.module.css';

export function TagsField({
  name,
  label,
  required,
  help,
  suggestions = [],
  maxItems = 20,
  maxLength = 40,
}: BaseFieldProps & { suggestions?: readonly string[]; maxItems?: number; maxLength?: number }) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const tags: string[] = useMemo(
    () => (Array.isArray(field.value) ? (field.value as string[]) : []),
    [field.value],
  );
  const [draft, setDraft] = useState('');
  const listId = useId();

  const add = (raw: string) => {
    const tag = raw.trim().slice(0, maxLength);
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase()) || tags.length >= maxItems) {
      setDraft('');
      return;
    }
    field.onChange([...tags, tag]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && tags.length) {
      field.onChange(tags.slice(0, -1));
    }
  };

  const options = useMemo(
    () =>
      [...new Set(suggestions)].filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())).sort(),
    [suggestions, tags],
  );

  return (
    <FieldShell
      label={label}
      required={required}
      error={error}
      help={help ?? `Press Enter or comma to add. Up to ${maxItems}.`}
      count={{ length: tags.length, max: maxItems }}
    >
      {(a11y) => (
        <div className={styles.tags}>
          {tags.length > 0 && (
            <ul className={styles.tagList} aria-label={`${label} added`}>
              {tags.map((t) => (
                <li key={t} className={styles.tag}>
                  <span>{t}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${t}`}
                    onClick={() => field.onChange(tags.filter((x) => x !== t))}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            {...a11y}
            ref={field.ref}
            className={ui.input}
            value={draft}
            list={options.length ? listId : undefined}
            placeholder={tags.length >= maxItems ? 'Limit reached' : 'Add a tag…'}
            disabled={tags.length >= maxItems}
            onChange={(e) => {
              const v = e.target.value;
              if (v.endsWith(',')) add(v.slice(0, -1));
              else setDraft(v);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (draft.trim()) add(draft);
              field.onBlur();
            }}
          />
          {options.length > 0 && (
            <datalist id={listId}>
              {options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
        </div>
      )}
    </FieldShell>
  );
}
