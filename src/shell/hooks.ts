import { useEffect, useState } from 'react';

const SITE = 'Ausaf Hussain';

/** "Page · Ausaf Hussain", or the site name alone on the home page (NV-7). */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title === undefined) return;
    document.title = title ? `${title} · ${SITE}` : `${SITE} — Portfolio`;
  }, [title]);
}

/** The page's description for search results while it's shown (spec 09 SEO-1). */
export function useMetaDescription(text: string | null | undefined) {
  useEffect(() => {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!clean) return;
    let el = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!el) {
      el = document.createElement('meta');
      el.name = 'description';
      document.head.append(el);
    }
    const before = el.content;
    el.content = clean;
    return () => {
      if (el) el.content = before;
    };
  }, [text]);
}

/** Keeps a page out of search results (404s, thank-you and download pages) (SEO-1). */
export function useNoIndex(on = true) {
  useEffect(() => {
    if (!on) return;
    const el = document.createElement('meta');
    el.name = 'robots';
    el.content = 'noindex';
    document.head.append(el);
    return () => el.remove();
  }, [on]);
}

/** Scroll position helpers for the top bar (NV-1) and progress line (NV-2). */
export function useScrollState(): { scrolled: boolean; hidden: boolean; progress: number } {
  const [state, setState] = useState({ scrolled: false, hidden: false, progress: 0 });

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - innerHeight;
      const goingDown = y > last + 2;
      const goingUp = y < last - 2;
      last = y;
      setState((s) => {
        const hidden = y < 160 ? false : goingDown ? true : goingUp ? false : s.hidden;
        const next = { scrolled: y > 24, hidden, progress: max > 0 ? Math.min(1, y / max) : 0 };
        return next.scrolled === s.scrolled &&
          next.hidden === s.hidden &&
          Math.abs(next.progress - s.progress) < 0.002
          ? s
          : next;
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return state;
}
