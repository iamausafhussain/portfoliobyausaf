/** Scroll to a chapter, update the hash, focus its heading (spec 03 SC-3, NV-3). */
import { getLenis } from './MotionProvider';

import { layout } from '../theme/tokens';

/** Space kept above a chapter for the top bar. */
export const TOP_OFFSET = layout.topbarHeight + 8;

function focusHeading(el: HTMLElement) {
  const heading = el.querySelector<HTMLElement>('h1, h2') ?? el;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

export function scrollToChapter(id: string, opts: { focus?: boolean; immediate?: boolean } = {}): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const { focus = true, immediate = false } = opts;
  if (`#${id}` !== location.hash) history.replaceState(history.state, '', `#${id}`);

  const lenis = getLenis();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const done = () => focus && focusHeading(el);

  if (lenis && !immediate) {
    lenis.scrollTo(el, { offset: -TOP_OFFSET, duration: 1.2, onComplete: done });
  } else {
    const top = el.getBoundingClientRect().top + window.scrollY - TOP_OFFSET;
    window.scrollTo({ top, behavior: immediate || reduced ? 'auto' : 'smooth' });
    if (lenis) lenis.scrollTo(top, { immediate: true });
    done();
  }
  return true;
}

export function scrollToTop() {
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(0, { immediate: true });
  window.scrollTo(0, 0);
}
