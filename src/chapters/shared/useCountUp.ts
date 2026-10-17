/**
 * Counts a number up from 0 the first time it scrolls into view (spec 06 AB-3). Writes
 * straight to the element; with reduced motion, in Lite mode or without
 * IntersectionObserver the final number simply shows.
 */
import { useEffect, type RefObject } from 'react';

export function useCountUp(ref: RefObject<HTMLElement | null>, target: number, animate: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = String(target);
    if (!animate || typeof IntersectionObserver !== 'function' || target <= 0) return;
    el.textContent = '0';
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const duration = 1200;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = String(Math.round(target * eased));
          if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = String(target);
    };
  }, [ref, target, animate]);
}
