/** Frame for every public page (spec 03 §3.1). */
import { Outlet, ScrollRestoration } from 'react-router';
import { CursorProvider } from '../cursor/CursorProvider';
import { readSupabaseEnv } from '../lib/env';
import { MotionProvider } from '../motion/MotionProvider';
import { ChapterRegistryProvider } from '../shell/ChapterRegistry';
import { FastLane } from '../shell/FastLane';
import { FilmGrain } from '../shell/FilmGrain';
import { Footer } from '../shell/Footer';
import { TopBar } from '../shell/TopBar';
import styles from '../shell/shell.module.css';
import { RouteEffects } from './RouteEffects';

/** Development only: say why the page shows placeholders (RT-5). */
function DevNotice() {
  if (!import.meta.env.DEV || import.meta.env.VITE_DEMO === '1') return null;
  try {
    readSupabaseEnv(import.meta.env);
    return null;
  } catch {
    return (
      <p className={styles.devNotice} role="note">
        Supabase isn&rsquo;t configured, so content shows as placeholders. Add <code>.env</code>, or run{' '}
        <code>npm run dev:demo</code> for sample content.
      </p>
    );
  }
}

export function PublicLayout() {
  return (
    <MotionProvider>
      <CursorProvider>
        <ChapterRegistryProvider>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <TopBar />
          <main id="main" className={styles.main} tabIndex={-1}>
            <Outlet />
          </main>
          <Footer />
          <FastLane variant="floating" />
          <FilmGrain />
          <DevNotice />
          <RouteEffects />
          <ScrollRestoration />
        </ChapterRegistryProvider>
      </CursorProvider>
    </MotionProvider>
  );
}
