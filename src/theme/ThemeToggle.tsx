/**
 * Projector-switch theme toggle (spec 03 TS-8): a lamp whose beams fold into a crescent.
 * Used in the public top bar and in the admin.
 */
import { useId, useRef } from 'react';
import { useTheme } from './ThemeProvider';
import styles from './ThemeToggle.module.css';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const ref = useRef<HTMLButtonElement>(null);
  const next = theme === 'dark' ? 'light' : 'dark';
  const maskId = `theme-mask-${useId().replace(/:/g, '')}`;
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.toggle} ${className ?? ''}`}
      data-state={theme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => toggle(ref.current)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <mask id={maskId}>
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle className={styles.cutout} cx="24" cy="10" r="6" fill="black" />
        </mask>
        <circle className={styles.lens} cx="12" cy="12" r="5" mask={`url(#${maskId})`} />
        <g className={styles.beams}>
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1="12" y1="1.5" x2="12" y2="3.5" transform={`rotate(${i * 45} 12 12)`} />
          ))}
        </g>
      </svg>
    </button>
  );
}
