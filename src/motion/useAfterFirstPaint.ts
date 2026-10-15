/** True once the page has loaded and the browser is idle, so heavy extras never compete with the first paint. */
import { useEffect, useState } from 'react';

export function useAfterFirstPaint(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const idle = () => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      };
      const go = () => !cancelled && setDone(true);
      if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 1200 });
      else setTimeout(go, 200);
    };
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', idle);
    };
  }, []);
  return done;
}
