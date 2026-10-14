/**
 * Theme state for the whole app (spec 03 TS-2 – TS-7). The pre-paint script has already
 * set <html data-theme>; this provider only reads it, never re-decides on load.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { duration, easing, type ThemeName } from './tokens';
import { THEME_STORAGE_KEY, themeColor } from './themeScript';

export interface ThemeTransition {
  /** performance.now() when the switch started */
  startedAt: number;
  /** ms; 0 when the switch is instant (reduced motion) */
  duration: number;
  from: ThemeName;
  to: ThemeName;
}

interface ThemeApi {
  theme: ThemeName;
  /** 'user' once a choice is saved; 'os' while following the system */
  source: 'user' | 'os';
  setTheme(theme: ThemeName, origin?: { x: number; y: number }): void;
  /** Switch theme; pass the toggle element so the iris opens from it. */
  toggle(originEl?: Element | null): void;
  /** Last switch, for the 3D scene to tween alongside (Part 5). */
  transition: ThemeTransition | null;
}

const ThemeContext = createContext<ThemeApi | null>(null);

const root = () => document.documentElement;
const readTheme = (): ThemeName => (root().getAttribute('data-theme') === 'light' ? 'light' : 'dark');
const readSource = (): 'user' | 'os' => (root().getAttribute('data-theme-source') === 'user' ? 'user' : 'os');
const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function apply(theme: ThemeName) {
  root().setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor(theme));
}

function save(theme: ThemeName) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage blocked: the choice lasts for this visit only (TS-2) */
  }
  root().setAttribute('data-theme-source', 'user');
}

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/** Iris wipe (TS-4): the new theme opens as a circle from the toggle. */
function switchWithTransition(next: ThemeName, origin: { x: number; y: number } | undefined): number {
  const doc = document as ViewTransitionDoc;
  if (prefersReducedMotion()) {
    apply(next);
    return 0;
  }
  if (typeof doc.startViewTransition === 'function') {
    const x = origin?.x ?? innerWidth - 40;
    const y = origin?.y ?? 32;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root().classList.add('theme-iris');
    const t = doc.startViewTransition(() => apply(next));
    t.ready
      .then(() => {
        root().animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: duration.slow,
            easing: `cubic-bezier(${easing.cinema.join(',')})`,
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => undefined);
    t.finished.finally(() => root().classList.remove('theme-iris')).catch(() => undefined);
    return duration.slow;
  }
  // Fallback: cross-fade colours (styles/global.css .theme-fading)
  root().classList.add('theme-fading');
  apply(next);
  setTimeout(() => root().classList.remove('theme-fading'), duration.slow + 50);
  return duration.slow;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readTheme);
  const [source, setSource] = useState<'user' | 'os'>(readSource);
  const [transition, setTransition] = useState<ThemeTransition | null>(null);

  // While no choice is saved, follow live OS changes (TS-3)
  useEffect(() => {
    if (source !== 'os' || typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const next: ThemeName = mq.matches ? 'light' : 'dark';
      apply(next);
      setThemeState(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [source]);

  const setTheme = useCallback((next: ThemeName, origin?: { x: number; y: number }) => {
    const from = readTheme();
    save(next);
    setSource('user');
    if (from === next) return;
    const ms = switchWithTransition(next, origin);
    setThemeState(next);
    setTransition({ startedAt: performance.now(), duration: ms, from, to: next });
  }, []);

  const toggle = useCallback(
    (originEl?: Element | null) => {
      const rect = originEl?.getBoundingClientRect();
      const origin = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
      setTheme(readTheme() === 'dark' ? 'light' : 'dark', origin);
    },
    [setTheme],
  );

  const value = useMemo(
    () => ({ theme, source, setTheme, toggle, transition }),
    [theme, source, setTheme, toggle, transition],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
