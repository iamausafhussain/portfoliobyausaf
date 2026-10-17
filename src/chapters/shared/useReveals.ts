/**
 * Scroll reveals for the whole public site (spec 06 CH-1 – CH-4).
 * Any element with `data-reveal` fades and rises the first time it scrolls into view
 * (lists can stagger with a `--i` style). Elements are only hidden once this has started
 * (`html.reveals-on`), so if JavaScript or IntersectionObserver isn't there, everything
 * simply shows. Lite mode turns reveals off; reduced motion makes them a short fade (CSS).
 */
import { useEffect } from 'react';

export const REVEALS_CLASS = 'reveals-on';

export function useReveals(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver !== 'function') return;
    const root = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.revealed = '';
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    const watch = (el: Element) => {
      if (el instanceof HTMLElement && !('revealed' in el.dataset)) io.observe(el);
    };
    const scan = (node: ParentNode) => {
      if (node instanceof Element && node.hasAttribute('data-reveal')) watch(node);
      node.querySelectorAll?.('[data-reveal]').forEach(watch);
    };
    scan(document);
    // new nodes, and existing nodes that gain data-reveal (React reuses a same-tag
    // element, e.g. a loading skeleton <div> that becomes the content <div>)
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') watch(r.target as Element);
        else r.addedNodes.forEach((n) => n instanceof Element && scan(n));
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-reveal'],
    });
    root.classList.add(REVEALS_CLASS);
    return () => {
      io.disconnect();
      mo.disconnect();
      root.classList.remove(REVEALS_CLASS);
    };
  }, [enabled]);
}
