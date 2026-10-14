/**
 * The opening sequence's state (spec 04 OS-1 – OS-5): plays once per session, ends at
 * once on any scroll, click or key, and is a short fade with reduced motion.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { INTRO_KEY, introMode, type IntroMode } from './heroMedia';

/** Total length of the full sequence (§3.2). */
export const INTRO_MS = 2400;
const REDUCED_MS = 200;

/**
 * Development only: `?intro=hold` keeps the intro running until it's skipped, so the
 * automated tests can check skipping without racing the clock. Never in a production build.
 */
const holdForTests =
  import.meta.env.DEV &&
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('intro') === 'hold';

/** Survives client-side navigation even when sessionStorage is blocked. */
let playedThisLoad = false;

function readPlayed(): boolean {
  if (playedThisLoad) return true;
  try {
    return sessionStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

function markPlayed() {
  playedThisLoad = true;
  try {
    sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* this visit only */
  }
}

export type IntroState = 'full' | 'reduced' | 'done';

export function useIntro({ lite, reducedMotion }: { lite: boolean; reducedMotion: boolean }) {
  // decided once per mount: later changes (e.g. turning on Lite) just end it
  const [mode] = useState<IntroMode>(() =>
    introMode({ playedThisSession: readPlayed(), lite, reducedMotion }),
  );
  const [state, setState] = useState<IntroState>(mode === 'none' ? 'done' : mode);
  const endedAt = useRef(0);
  const skip = useCallback(() => {
    endedAt.current = performance.now();
    // commit right away, even on a busy page: "ends at once" (OS-3)
    try {
      flushSync(() => setState('done'));
    } catch {
      setState('done'); // called during a render: let React schedule it
    }
  }, []);
  /** True just after the intro ended, so the click that skipped it doesn't also act (e.g. pause). */
  const justEnded = useCallback(() => performance.now() - endedAt.current < 500, []);

  useEffect(() => {
    if (mode === 'none') return;
    markPlayed();
  }, [mode]);

  useEffect(() => {
    if (state === 'done') return;
    const timer = holdForTests ? undefined : setTimeout(skip, state === 'full' ? INTRO_MS : REDUCED_MS);
    // OS-3: any scroll, click or key ends it
    const opts = { passive: true, capture: true } as const;
    const events = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, skip, opts));
    const onScroll = () => {
      if (window.scrollY > 4) skip();
    };
    window.addEventListener('scroll', onScroll, opts);
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, skip, opts));
      window.removeEventListener('scroll', onScroll, opts);
    };
  }, [state, skip]);

  // Lite switched on mid-intro: final frame at once (OS-5)
  const active = state !== 'done' && !lite;
  return { state: active ? state : ('done' as const), skip, justEnded };
}

/** For tests: forget that the intro played during this page load. */
export function resetIntroForTests() {
  playedThisLoad = false;
}
