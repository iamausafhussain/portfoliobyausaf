/**
 * Film timecode in the hero's corner (spec 04 OS-1). Shows the clip's own time while the
 * footage plays, and counts from the intro's start before that. Written straight to the
 * DOM, so it never re-renders React; it stops while nothing is changing.
 */
import { useEffect, useRef } from 'react';
import { timecode } from './heroMedia';
import type { StageMedia } from './HeroVideo';
import styles from './hero.module.css';

export function Timecode({
  media,
  running,
  introRunning,
}: {
  media: StageMedia;
  /** The hero is on screen and the video may be playing */
  running: boolean;
  /** The intro is playing (count from its start) */
  introRunning: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!running && !introRunning) return;
    const start = performance.now();
    let raf = 0;
    let last = '';
    const tick = (now: number) => {
      const v = media.video;
      const seconds = v && v.readyState >= 2 ? v.currentTime : introRunning ? (now - start) / 1000 : 0;
      const text = timecode(seconds);
      if (text !== last && ref.current) ref.current.textContent = last = text;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, introRunning, media]);

  return (
    <p className={`label ${styles.timecode}`} aria-hidden>
      <span className={styles.rec} />
      <span ref={ref}>{timecode(0)}</span>
    </p>
  );
}
