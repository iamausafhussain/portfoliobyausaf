/**
 * Form fields bound to React Hook Form (spec 02 §3.4). Each reads its value and error
 * from the surrounding <FormProvider>, so forms stay short and declarative.
 */
import { useEffect, useRef, useState } from 'react';
import { get, useController, useFormContext, useWatch } from 'react-hook-form';
import { FieldShell } from '../ui/FieldShell';
import { Icon } from '../ui/Icon';
import { Button, cx, IconButton, Switch, ui } from '../ui/primitives';
import styles from './fields.module.css';

export interface BaseFieldProps {
  name: string;
  label: string;
  required?: boolean;
  help?: string;
}

/** The error message for a field, including nested errors (e.g. image alt text). */
export function useFieldError(name: string): string | undefined {
  const { formState } = useFormContext();
  const err = get(formState.errors, name) as { message?: unknown } | undefined;
  return typeof err?.message === 'string' ? err.message : undefined;
}

/* ------------------------------------------------------------------ */

export function TextField({
  name,
  label,
  required,
  help,
  max,
  nullable,
  type = 'text',
  placeholder,
  autoComplete,
  multiline,
  rows,
  readOnly,
}: BaseFieldProps & {
  readOnly?: boolean;
  max?: number;
  /** Empty input is stored as null instead of '' */
  nullable?: boolean;
  type?: 'text' | 'email' | 'url';
  placeholder?: string;
  autoComplete?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const value = typeof field.value === 'string' ? field.value : '';
  const onChange = (v: string) => field.onChange(nullable && v === '' ? null : v);

  return (
    <FieldShell
      label={label}
      required={required}
      help={help}
      error={error}
      count={max ? { length: value.length, max } : undefined}
    >
      {(a11y) =>
        multiline ? (
          <textarea
            {...a11y}
            ref={field.ref}
            name={field.name}
            className={ui.textarea}
            rows={rows ?? 4}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onBlur={field.onBlur}
          />
        ) : (
          <input
            {...a11y}
            ref={field.ref}
            name={field.name}
            className={ui.input}
            type={type}
            value={value}
            placeholder={placeholder}
            readOnly={readOnly}
            autoComplete={autoComplete ?? 'off'}
            onChange={(e) => onChange(e.target.value)}
            onBlur={field.onBlur}
          />
        )
      }
    </FieldShell>
  );
}

export function UrlField(props: BaseFieldProps & { placeholder?: string }) {
  return <TextField {...props} type="url" nullable placeholder={props.placeholder ?? 'https://'} />;
}

/* ------------------------------------------------------------------ */

export function NumberField({
  name,
  label,
  required,
  help,
  min,
  max,
  step,
}: BaseFieldProps & { min?: number; max?: number; step?: number }) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const [text, setText] = useState(field.value == null ? '' : String(field.value));
  const last = useRef(field.value);

  // follow external resets
  useEffect(() => {
    if (field.value !== last.current) {
      last.current = field.value;
      setText(field.value == null ? '' : String(field.value));
    }
  }, [field.value]);

  return (
    <FieldShell label={label} required={required} help={help} error={error}>
      {(a11y) => (
        <input
          {...a11y}
          ref={field.ref}
          name={field.name}
          className={ui.input}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step ?? 'any'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.value === '' ? null : Number(e.target.value);
            const v = n === null || Number.isNaN(n) ? null : n;
            last.current = v;
            field.onChange(v);
          }}
          onBlur={field.onBlur}
        />
      )}
    </FieldShell>
  );
}

export function DateField({ name, label, required, help }: BaseFieldProps) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  return (
    <FieldShell label={label} required={required} help={help} error={error}>
      {(a11y) => (
        <input
          {...a11y}
          ref={field.ref}
          name={field.name}
          className={ui.input}
          type="date"
          value={typeof field.value === 'string' ? field.value : ''}
          onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
          onBlur={field.onBlur}
        />
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */

export interface Option {
  value: string;
  label: string;
}

export function SelectField({
  name,
  label,
  required,
  help,
  options,
  emptyLabel,
}: BaseFieldProps & {
  options: readonly Option[];
  /** Adds an empty choice stored as null */ emptyLabel?: string;
}) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  return (
    <FieldShell label={label} required={required} help={help} error={error}>
      {(a11y) => (
        <select
          {...a11y}
          ref={field.ref}
          name={field.name}
          className={ui.select}
          value={typeof field.value === 'string' ? field.value : ''}
          onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
          onBlur={field.onBlur}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function SwitchField({ name, label, help }: Omit<BaseFieldProps, 'required'>) {
  const { field } = useController({ name });
  return (
    <div className={ui.field}>
      <Switch checked={!!field.value} onChange={(v) => field.onChange(v)} label={label} />
      {help && <p className={ui.help}>{help}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** 1–5 scale shown as stars (rating) or dots (skill level); clearing stores null. */
export function ScaleField({
  name,
  label,
  help,
  variant,
}: Omit<BaseFieldProps, 'required'> & { variant: 'stars' | 'dots' }) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const value = typeof field.value === 'number' ? field.value : 0;
  return (
    <FieldShell label={label} help={help} error={error} group>
      {() => (
        <div className={styles.scale} role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} of 5`}
              className={cx(styles.scaleItem, n <= value && styles.scaleOn, variant === 'dots' && styles.dot)}
              onClick={() => field.onChange(n)}
            >
              {variant === 'stars' ? <Icon name="star" size={20} /> : null}
            </button>
          ))}
          {value > 0 && (
            <Button size="small" variant="ghost" onClick={() => field.onChange(null)}>
              Clear
            </Button>
          )}
        </div>
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/**
 * Web address generated from another field while `auto` is on (new drafts),
 * editable by hand (AD-25). Warns when a published item's address changes.
 */
export function SlugField({
  name,
  label,
  from,
  auto,
  publishedValue,
  prefix,
}: {
  name: string;
  label: string;
  from: string;
  auto: boolean;
  publishedValue?: string | null;
  prefix: string;
}) {
  const { field } = useController({ name });
  const { setValue } = useFormContext();
  const source = useWatch({ name: from }) as unknown;
  const [following, setFollowing] = useState(auto);
  const error = useFieldError(name);

  useEffect(() => {
    if (following && typeof source === 'string') {
      setValue(name, slugify(source), { shouldDirty: true, shouldValidate: false });
    }
  }, [following, source, name, setValue]);

  const value = typeof field.value === 'string' ? field.value : '';
  const changedLive = publishedValue && value !== publishedValue;

  return (
    <FieldShell
      label={label}
      required
      error={error}
      help={
        changedLive
          ? `This is published: links to ${prefix}${publishedValue} will stop working.`
          : `${prefix}${value || '…'}`
      }
      labelAction={
        !following ? (
          <button type="button" className={styles.inlineLink} onClick={() => setFollowing(true)}>
            Generate from title
          </button>
        ) : null
      }
    >
      {(a11y) => (
        <input
          {...a11y}
          ref={field.ref}
          name={field.name}
          className={ui.input}
          value={value}
          spellCheck={false}
          onChange={(e) => {
            setFollowing(false);
            field.onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'));
          }}
          onBlur={field.onBlur}
        />
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */

/** A list of short sentences (e.g. experience highlights). */
export function ListField({
  name,
  label,
  help,
  max,
  maxItems,
}: Omit<BaseFieldProps, 'required'> & { max: number; maxItems: number }) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const items: string[] = Array.isArray(field.value) ? (field.value as string[]) : [];
  const set = (next: string[]) => field.onChange(next);

  return (
    <FieldShell label={label} help={help ?? `Up to ${maxItems}.`} error={error} group>
      {() => (
        <div className={styles.list}>
          {items.map((item, i) => (
            <div key={i} className={styles.listRow}>
              <input
                className={ui.input}
                aria-label={`${label} ${i + 1}`}
                value={item}
                maxLength={max}
                onChange={(e) => set(items.map((x, j) => (j === i ? e.target.value : x)))}
                onBlur={field.onBlur}
              />
              <IconButton
                icon="trash"
                label={`Remove ${label.toLowerCase()} ${i + 1}`}
                onClick={() => set(items.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          {items.length < maxItems && (
            <Button size="small" icon="plus" onClick={() => set([...items, ''])}>
              Add
            </Button>
          )}
        </div>
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */

/** Latitude/longitude for the projects globe, or empty for automatic placement. */
export function GlobeField({ name, label }: { name: string; label: string }) {
  const { field } = useController({ name });
  const e1 = useFieldError(name);
  const e2 = useFieldError(`${name}.lat`);
  const e3 = useFieldError(`${name}.lng`);
  const error = e1 ?? e2 ?? e3;
  const value = field.value as { lat: number; lng: number } | null;
  const auto = value == null;

  const update = (key: 'lat' | 'lng', raw: string) => {
    const n = raw === '' ? NaN : Number(raw);
    const base = value ?? { lat: 0, lng: 0 };
    field.onChange({ ...base, [key]: Number.isNaN(n) ? 0 : n });
  };

  return (
    <FieldShell label={label} error={error} help="Where this project sits on the 3D globe." group>
      {() => (
        <div className={styles.globe}>
          <Switch
            checked={auto}
            onChange={(v) => field.onChange(v ? null : { lat: 20.3, lng: 85.8 })}
            label="Place automatically"
          />
          {!auto && (
            <div className={styles.twoCol}>
              <label className={ui.field}>
                <span className={ui.label}>Latitude (−90 to 90)</span>
                <input
                  className={ui.input}
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={value.lat}
                  onChange={(e) => update('lat', e.target.value)}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Longitude (−180 to 180)</span>
                <input
                  className={ui.input}
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={value.lng}
                  onChange={(e) => update('lng', e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </FieldShell>
  );
}
