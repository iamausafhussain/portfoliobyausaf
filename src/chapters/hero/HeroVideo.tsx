/**
 * Hero footage (spec 04 FG-1 – FG-5): the poster first, then the video fades in once it
 * can play. Sequences join clips with a short film cut; video pauses when the hero is off
 * screen or the tab is hidden.
 */
import { useEffect, useRef, useState } from 'react';
import type { Tier } from '../../device/tier';
import { nextIndex, videoSources, type Clip } from './heroMedia';
import styles from './hero.module.css';

/** What's on screen right now: the elements the particle scene samples from (spec 04 §3.3). */
export class StageMedia {
  video: HTMLVideoElement | null = null;
  poster: HTMLImageElement | null = null;
  clip: Clip | null = null;
  update(next: Partial<Pick<StageMedia, 'video' | 'poster' | 'clip'>>) {
    Object.assign(this, next);
  }
}

const CUT_MS = 120;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(max-width: 768px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function HeroVideo({
  clips,
  loadVideo,
  tier,
  paused,
  inView,
  media,
}: {
  clips: Clip[];
  /** FG-4 rules passed and the first paint is done */
  loadVideo: boolean;
  tier: Tier;
  /** The visitor pressed pause (FG-6) */
  paused: boolean;
  /** The hero is on screen (FG-5) */
  inView: boolean;
  media: StageMedia;
}) {
  const narrow = useNarrow();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cut, setCut] = useState(false);
  const [posterFailed, setPosterFailed] = useState<string | null>(null);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // the clip list changed (theme switch, new upload): cut to the first clip of the new list
  const ids = clips.map((c) => c.id).join('|');
  const [shownIds, setShownIds] = useState(ids);
  const [shownFirst, setShownFirst] = useState(clips[0]?.id);
  const [swaps, setSwaps] = useState(0);
  if (shownIds !== ids) {
    setShownIds(ids);
    setIndex(0);
    // only a different clip on screen needs a cut (and a fresh fade-in)
    if (clips[0]?.id !== shownFirst) {
      setShownFirst(clips[0]?.id);
      setPlaying(false);
      setSwaps((n) => n + 1);
    }
  }

  const clip = clips[Math.min(index, clips.length - 1)] ?? null;
  const loop = clips.length <= 1;

  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // keep the particle scene pointed at what's on screen
  useEffect(() => {
    media.update({ clip, video: loadVideo ? videoRef.current : null });
  });

  // play only when wanted and visible (FG-5, FG-6)
  const shouldPlay = loadVideo && !paused && inView && !hidden;
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (shouldPlay) v.play().catch(() => undefined);
    else v.pause();
  }, [shouldPlay, clip?.id]);

  useEffect(() => () => clearTimeout(cutTimer.current), []);

  const filmCut = (then: () => void) => {
    setCut(true);
    clearTimeout(cutTimer.current);
    cutTimer.current = setTimeout(() => {
      then();
      setCut(false);
    }, CUT_MS);
  };

  if (!clip) return null;

  const sources = videoSources(clip, { narrow, tier });
  const posterOk = posterFailed !== clip.poster.src;

  return (
    <>
      {posterOk && (
        <img
          className={styles.poster}
          src={clip.poster.src}
          alt=""
          width={clip.poster.width ?? undefined}
          height={clip.poster.height ?? undefined}
          crossOrigin={clip.readable ? 'anonymous' : undefined}
          fetchPriority="high"
          decoding="async"
          ref={(el) => media.update({ poster: el })}
          onError={() => setPosterFailed(clip.poster.src)}
          data-hero-poster
        />
      )}
      {loadVideo && (
        <video
          key={`${clip.id}:${sources[0]?.src}`}
          ref={videoRef}
          className={styles.video}
          data-ready={playing || undefined}
          data-hero-video
          muted
          playsInline
          loop={loop}
          preload="auto"
          autoPlay={shouldPlay}
          crossOrigin={clip.readable ? 'anonymous' : undefined}
          poster={posterOk ? clip.poster.src : undefined}
          aria-hidden
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onError={() => setPlaying(false)}
          onEnded={() => {
            if (loop) return;
            filmCut(() => {
              setPlaying(false);
              setIndex((i) => nextIndex(i, clips.length));
            });
          }}
        >
          {sources.map((s) => (
            <source key={s.src} src={s.src} type={s.type} />
          ))}
        </video>
      )}
      <span className={styles.cut} data-on={cut || undefined} aria-hidden />
      {/* a swap (e.g. the theme picked another clip) also gets a film cut */}
      {swaps > 0 && <span key={swaps} className={styles.flash} aria-hidden />}
    </>
  );
}
