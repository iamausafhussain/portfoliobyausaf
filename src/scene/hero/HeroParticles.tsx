/**
 * React side of the hero particles (spec 04 PT-1 – PT-6), loaded lazily with Three.js.
 *  - samples the footage when the visitor starts scrolling (and again after returning to the top)
 *  - scrubs the scatter with scroll; scrolling back re-forms the picture
 *  - only draws while something is changing
 *  - stops for good (falls back to the plain fade) if WebGL fails or frames stay slow
 */
import { useEffect, useRef, type RefObject } from 'react';
import type { StageMedia } from '../../chapters/hero/HeroVideo';
import { heroProgress } from '../../chapters/hero/heroMedia';
import type { Tier } from '../../device/tier';
import { duration, type ThemeName } from '../../theme/tokens';
import { publishHeroCloud } from './handoff';
import { createFrameGuard } from './frameGuard';
import { frameReady, ParticleField, type FrameSource } from './ParticleField';
import { layerAlpha, PARTICLES } from './sampling';
import styles from './particles.module.css';

/**
 * Development only: `?noguard` keeps the scene running on slow software renderers, so the
 * automated browser tests can check it. Never part of a production build.
 */
const guardOff = import.meta.env.DEV && new URLSearchParams(location.search).has('noguard');

export default function HeroParticles({
  heroRef,
  media,
  tier,
  theme,
  onFail,
}: {
  heroRef: RefObject<HTMLElement | null>;
  media: StageMedia;
  tier: Tier;
  theme: ThemeName;
  onFail: () => void;
}) {
  const glowTarget = useRef(theme === 'dark' ? 1 : 0);
  const wake = useRef<() => void>(() => undefined);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });

  // theme switch: tween the look over 600 ms (PT-3, master spec TH-4)
  useEffect(() => {
    glowTarget.current = theme === 'dark' ? 1 : 0;
    wake.current();
  }, [theme]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || tier === 'low') return;
    // a fresh canvas per mount: a canvas whose WebGL context was released can't be reused
    const canvas = document.createElement('canvas');
    canvas.className = styles.canvas!;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.heroParticles = '';
    document.body.appendChild(canvas);

    let field: ParticleField;
    const maxCount = PARTICLES[tier];
    try {
      field = new ParticleField(canvas, maxCount, Math.min(devicePixelRatio || 1, tier === 'high' ? 2 : 1.5));
    } catch {
      canvas.remove();
      failRef.current();
      return;
    }
    canvas.dataset.max = String(maxCount);

    let failed = false;
    const fail = (reason: string) => {
      if (failed) return;
      failed = true;
      canvas.dataset.stopped = reason;
      if (import.meta.env.DEV) console.warn(`[hero particles] stopped: ${reason}`);
      stop();
      publishHeroCloud(null);
      failRef.current();
    };

    let raf = 0;
    let sampled = false;
    let glow = glowTarget.current;
    let lastFrame = 0;
    const guard = createFrameGuard();
    const t0 = performance.now();

    const size = () => field.setSize(innerWidth, innerHeight);
    size();

    const trySample = (): boolean => {
      const m = media;
      const readable = m.clip?.readable ?? false;
      const candidates: (FrameSource | null)[] = readable ? [m.video, m.poster] : [m.poster];
      const rect = hero.getBoundingClientRect();
      for (const src of candidates) {
        if (!frameReady(src)) continue;
        try {
          field.sample(src, rect.width, rect.height);
          canvas.dataset.count = String(field.count);
          publishHeroCloud(field.data);
          return true;
        } catch {
          /* cross-origin frame: try the next source (§3.3 step 5) */
        }
      }
      return false;
    };

    const frame = (now: number) => {
      raf = 0;
      if (failed) return;
      const dt = lastFrame ? now - lastFrame : 16;
      // PT-6 frame-time guard (only while the tab is visible and we're animating)
      if (lastFrame && !document.hidden && guard.frame(dt) && !guardOff) {
        return fail('frames stayed over 50 ms');
      }
      lastFrame = now;

      const rect = hero.getBoundingClientRect();
      const top = rect.top + scrollY;
      const p = heroProgress(scrollY, top, rect.height);

      if (p <= 0)
        sampled = false; // a fresh frame next time the visitor scrolls
      else if (!sampled) {
        sampled = trySample();
        guard.reset();
        // a frame was there but couldn't be read from any source: give up on particles
        if (!sampled && (frameReady(media.poster) || frameReady(media.video)))
          return fail('the footage frame could not be read');
      }

      // ease the theme look towards its target over duration.slow
      const target = glowTarget.current;
      const step = Math.min(1, dt / duration.slow);
      glow = target > glow ? Math.min(target, glow + step) : Math.max(target, glow - step);

      const alpha = sampled ? layerAlpha(p) : 0;
      field.set({ progress: p, scroll: scrollY - top, time: (now - t0) / 1000, glow, alpha });
      field.render();
      canvas.dataset.progress = p.toFixed(3);
      canvas.dataset.glow = glow.toFixed(2);

      if (alpha > 0 || glow !== target) raf = requestAnimationFrame(frame);
      else {
        lastFrame = 0; // asleep until the next scroll
        guard.reset();
      }
    };

    const start = () => {
      if (!raf && !failed) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      lastFrame = 0;
    };
    wake.current = start;

    const onScroll = () => start();
    const onResize = () => {
      size();
      sampled = false;
      start();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      fail('WebGL context lost');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    canvas.addEventListener('webglcontextlost', onLost);
    start();

    return () => {
      stop();
      wake.current = () => undefined;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onLost);
      field.dispose();
      canvas.remove();
      publishHeroCloud(null);
    };
  }, [heroRef, media, tier]);

  return null;
}
