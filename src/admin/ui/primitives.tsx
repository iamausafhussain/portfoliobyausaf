/** Small admin building blocks. */
import { type ButtonHTMLAttributes, type ReactNode, forwardRef, useId } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from './Icon';
import ui from './ui.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'normal' | 'small';
  icon?: IconName;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'normal',
    icon,
    busy,
    children,
    className,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(ui.button, ui[variant], size === 'small' && ui.small, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className={ui.spinner} aria-hidden /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = 'secondary',
  icon,
  children,
  className,
  ...rest
}: LinkProps & { variant?: Variant; icon?: IconName }) {
  return (
    <Link className={cx(ui.button, ui[variant], className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }
>(function IconButton({ icon, label, className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(ui.iconButton, className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
});

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" style={{ display: 'inline-flex' }}>
      <span className={ui.spinner} aria-hidden />
      <span className={ui.visuallyHidden}>{label}</span>
    </span>
  );
}

export function Skeleton({ height = '1rem', width = '100%' }: { height?: string; width?: string }) {
  return <span className={ui.skeleton} style={{ display: 'block', height, width }} aria-hidden />;
}

export function StatusBadge({ published }: { published: boolean }) {
  return (
    <span className={cx(ui.badge, published && ui.badgeLive)}>
      <span className={ui.badgeDot} aria-hidden />
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

export function Notice({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'error';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cx(ui.notice, tone === 'warn' && ui.noticeWarn, tone === 'error' && ui.noticeError)}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <Icon name={tone === 'info' ? 'sparkle' : 'alert'} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {action}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hideLabel,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const autoId = useId();
  return (
    <label className={ui.switch} htmlFor={id ?? autoId}>
      <input
        id={id ?? autoId}
        type="checkbox"
        role="switch"
        className={ui.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={ui.switchTrack} aria-hidden />
      <span className={hideLabel ? ui.visuallyHidden : undefined}>{label}</span>
    </label>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={ui.progress}
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={ui.progressBar} style={{ width: `${pct}%` }} />
    </div>
  );
}

export { cx, ui };
