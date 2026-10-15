/**
 * What happens on every route change (spec 03 NV-7, SC-4): land on the #hash once it has
 * rendered, otherwise start at the top and move focus to the new page's <h1>.
 * Back/forward keeps the restored scroll position.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { scrollToChapter, scrollToTop } from '../motion/scrollTo';

/** Calls `find` every frame until it returns an element, or gives up after `timeout` ms. */
function waitFor<T>(find: () => T | null, timeout = 10_000): Promise<T | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const found = find();
      if (found) return resolve(found);
      if (performance.now() - start > timeout) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Scrolls to a chapter and keeps it in place while content above it is still loading
 * (images, data) — until the layout settles or the visitor scrolls themselves.
 */
function landOn(id: string): () => void {
  let stopped = false;
  const stop = () => {
    stopped = true;
    ro.disconnect();
    clearTimeout(timer);
    for (const e of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) removeEventListener(e, stop);
  };
  const ro = new ResizeObserver(() => {
    if (!stopped) scrollToChapter(id, { immediate: true, focus: false });
  });
  ro.observe(document.body);
  for (const e of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const)
    addEventListener(e, stop, { passive: true });
  const timer = setTimeout(stop, 2500);
  scrollToChapter(id, { immediate: true });
  return stop;
}

export function RouteEffects() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const isFirst = first.current;
    first.current = false;
    const id = decodeURIComponent(hash.replace(/^#/, ''));

    if (id) {
      let stop: (() => void) | undefined;
      void waitFor(() => document.getElementById(id)).then((el) => {
        if (el && !cancelled) stop = landOn(id);
      });
      return () => {
        cancelled = true;
        stop?.();
      };
    }
    if (isFirst || navType === 'POP') return;

    scrollToTop();
    void waitFor(() => document.querySelector<HTMLElement>('main h1')).then((h1) => {
      if (!h1 || cancelled) return;
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, hash, key, navType]);

  return null;
}
