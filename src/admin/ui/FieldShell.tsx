/**
 * Label, help text, character counter and error for one input (spec 02 AD-20, AD-28, §3.9).
 * The render prop receives the ids/aria attributes to spread onto the input.
 */
import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cx, ui } from './primitives';

export interface InputA11y {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

export interface FieldShellProps {
  label: string;
  required?: boolean;
  help?: ReactNode;
  error?: string;
  /** Current length and limit, for a character counter. */
  count?: { length: number; max: number };
  /** Rendered after the label, e.g. a "Generate" button. */
  labelAction?: ReactNode;
  /** Use <fieldset>/<legend> for groups of inputs. */
  group?: boolean;
  children: (a11y: InputA11y) => ReactNode;
}

export function FieldShell({
  label,
  required,
  help,
  error,
  count,
  labelAction,
  group,
  children,
}: FieldShellProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;
  const a11y: InputA11y = {
    id,
    'aria-invalid': !!error,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
  };

  const labelContent = (
    <>
      {label}
      {required ? <span className={ui.required}> (required)</span> : null}
    </>
  );

  const header = (
    <div className={ui.labelRow}>
      {group ? (
        <legend className={ui.label}>{labelContent}</legend>
      ) : (
        <label className={ui.label} htmlFor={id}>
          {labelContent}
        </label>
      )}
      <span style={{ display: 'inline-flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        {labelAction}
        {count && (
          <span className={cx(ui.counter, count.length > count.max && ui.counterOver)} aria-live="off">
            {count.length}/{count.max}
          </span>
        )}
      </span>
    </div>
  );

  const body = (
    <>
      {header}
      {children(a11y)}
      {error && (
        <p id={errorId} className={ui.error}>
          <Icon name="alert" size={14} />
          <span>{error}</span>
        </p>
      )}
      {help && (
        <p id={helpId} className={ui.help}>
          {help}
        </p>
      )}
    </>
  );

  return group ? (
    <fieldset
      className={ui.field}
      style={{ border: 0, padding: 0, margin: 0 }}
      aria-describedby={describedBy}
    >
      {body}
    </fieldset>
  ) : (
    <div className={ui.field}>{body}</div>
  );
}
