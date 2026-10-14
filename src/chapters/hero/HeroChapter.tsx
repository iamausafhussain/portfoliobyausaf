/**
 * The Opening Scene (spec 04 §2.2): name and tagline as real text from the first paint,
 * a short film intro, the footage behind it and, on capable devices, the footage turning
 * into particles as you scroll (lazy-loaded Three.js scene).
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useDeviceTier } from '../../device/DeviceProvider';
import { useReducedMotion } from '../../device/useReducedMotion';
import { usePublishedHeroMedia, useSiteSettings } from '../../data/queries/public';
import { publicMediaUrl } from '../../data/source';
import { useTheme } from '../../theme/ThemeProvider';
import { chooseClips, forTheme, heroProgress, sampleClips, toClips, videoAllowed } from './heroMedia';
import { HeroVideo, StageMedia } from './HeroVideo';
import { SceneBoundary } from './SceneBoundary';
import { Timecode } from './Timecode';
import { useIntro } from './useIntro';
import styles from './hero.module.css';

const HeroParticles = lazy(() => import('../../scene/hero/HeroParticles'));

const PAUSE_KEY = 'hero-paused';
const readPaused = () => {
  try {
    return sessionStorage.getItem(PAUSE_KEY) === '1';
  } catch {
    return false;
  }
};

/** One random pick per page load (FG-2 "random: one per visit"). */
const visitPick = Math.random();

const saveData = () =>
  !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/** True once the page has loaded and the browser is idle, so video never competes with the first paint (FG-4, PT-5). */
function useAfterFirstPaint(): boolean {
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

function useInView(ref: React.RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

export function HeroChapter({ headingId }: { headingId: string }) {
  const settings = useSiteSettings();
  const heroRows = usePublishedHeroMedia();
  const { theme } = useTheme();
  const { tier, lite } = useDeviceTier();
  const reducedMotion = useReducedMotion();
  const intro = useIntro({ lite, reducedMotion });
  const afterPaint = useAfterFirstPaint();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);
  const [media] = useState(() => new StageMedia());
  const [paused, setPaused] = useState(readPaused);
  const [particlesFailed, setParticlesFailed] = useState(false);

  const s = settings.data;
  const name = s?.display_name || 'Ausaf Hussain';

  // clips: published ones, else the bundled samples (decision Q7)
  const clips = useMemo(() => {
    const published = heroRows.data ? toClips(heroRows.data, publicMediaUrl) : [];
    const pool = published.length ? published : heroRows.isPending ? [] : sampleClips();
    return chooseClips(forTheme(pool, theme), s?.hero_playback ?? 'single', visitPick);
  }, [heroRows.data, heroRows.isPending, theme, s?.hero_playback]);

  const videoOn = afterPaint && videoAllowed({ tier, saveData: saveData(), reducedMotion, lite });
  const hasVideo = videoOn && clips.length > 0;
  // the 3D chunk is a download too: none with Data Saver
  const particlesOn =
    afterPaint &&
    !particlesFailed &&
    clips.length > 0 &&
    tier !== 'low' &&
    !reducedMotion &&
    !lite &&
    !saveData();

  const togglePause = () => {
    setPaused((p) => {
      try {
        if (p) sessionStorage.removeItem(PAUSE_KEY);
        else sessionStorage.setItem(PAUSE_KEY, '1');
      } catch {
        /* this visit only */
      }
      return !p;
    });
  };

  // scroll progress as a CSS variable: the footage fades over the first 30 % (PT-1, PT-5)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const p = heroProgress(window.scrollY, rect.top + window.scrollY, rect.height);
      el.style.setProperty('--hero-p', p.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const letters = useMemo(() => {
    const total = name.replace(/\s/g, '').length;
    const step = Math.min(60, Math.floor(1100 / Math.max(1, total)));
    let i = 0;
    return name.split(/(\s+)/).map((word, w) =>
      /^\s+$/.test(word) ? (
        <span key={`s${w}`}> </span>
      ) : (
        <span key={`w${w}`} className={styles.word}>
          {[...word].map((ch, c) => (
            <span
              key={c}
              className={styles.letter}
              style={{ '--d': `${500 + i++ * step}ms` } as CSSProperties}
            >
              {ch}
            </span>
          ))}
        </span>
      ),
    );
  }, [name]);

  return (
    <div
      ref={rootRef}
      className={styles.hero}
      data-intro={intro.state}
      data-video={hasVideo ? (paused ? 'paused' : 'playing') : 'off'}
      data-has-clip={clips.length > 0 || undefined}
    >
      {/* footage layer */}
      <div
        className={styles.stage}
        data-cursor={hasVideo ? 'play' : undefined}
        data-cursor-label={hasVideo ? (paused ? 'Play' : 'Pause') : undefined}
        onClick={hasVideo ? () => !intro.justEnded() && intro.state === 'done' && togglePause() : undefined}
        aria-hidden
      >
        <HeroVideo
          clips={clips}
          loadVideo={videoOn}
          tier={tier}
          paused={paused}
          inView={inView}
          media={media}
        />
        <span className={styles.scrim} />
      </div>

      {particlesOn && (
        <SceneBoundary onError={() => setParticlesFailed(true)}>
          <Suspense fallback={null}>
            <HeroParticles
              heroRef={rootRef}
              media={media}
              tier={tier}
              theme={theme}
              onFail={() => setParticlesFailed(true)}
            />
          </Suspense>
        </SceneBoundary>
      )}

      {/* letterbox frame */}
      <span className={`${styles.bar} ${styles.barTop}`} aria-hidden />
      <span className={`${styles.bar} ${styles.barBottom}`} aria-hidden />

      <Timecode media={media} running={inView && hasVideo && !paused} introRunning={intro.state === 'full'} />

      <div className={styles.content}>
        <div className={styles.titleCard}>
          <p className={`label ${styles.kicker}`}>
            <span>{s?.location || 'Portfolio'}</span>
            {s?.available_for_work && (
              <span className={styles.available}>
                <span className={styles.availableDot} aria-hidden />
                Available for work
              </span>
            )}
          </p>
          {/* the letters are separate boxes for the animation; the label keeps the name whole for screen readers */}
          <h1 id={headingId} className={styles.name} tabIndex={-1} aria-label={name}>
            {letters}
          </h1>
          {s?.tagline && <p className={styles.tagline}>{s.tagline}</p>}
        </div>
      </div>

      <p className={`label ${styles.scrollCue}`} aria-hidden>
        Scroll
        <span className={styles.scrollLine} />
      </p>

      <div className={styles.controls}>
        {intro.state !== 'done' && (
          <button type="button" className={styles.control} onClick={intro.skip}>
            Skip intro
          </button>
        )}
        {hasVideo && (
          <button
            type="button"
            className={styles.control}
            onClick={togglePause}
            aria-label={paused ? 'Play background video' : 'Pause background video'}
            data-hero-pause
          >
            <span className={styles.pauseIcon} data-paused={paused || undefined} aria-hidden />
            <span className={styles.controlText} aria-hidden>
              {paused ? 'Play' : 'Pause'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
