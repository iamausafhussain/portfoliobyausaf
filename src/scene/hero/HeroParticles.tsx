/**
 * Puts the hero particles on the shared stage (spec 04 PT-1 – PT-6, spec 05 ST-3).
 * Loaded lazily with Three.js; renders nothing itself.
 */
import { useEffect, useRef, type RefObject } from 'react';
import type { StageMedia } from '../../chapters/hero/HeroVideo';
import type { Tier } from '../../device/tier';
import type { Stage } from '../stage/Stage';
import { HeroLayer } from './HeroLayer';
import { PARTICLES } from './sampling';

export default function HeroParticles({
  stage,
  heroRef,
  media,
  tier,
  onFail,
}: {
  stage: Stage;
  heroRef: RefObject<HTMLElement | null>;
  media: StageMedia;
  tier: Tier;
  onFail: () => void;
}) {
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || tier === 'low') return;
    let remove = () => {};
    try {
      const layer = new HeroLayer(stage.renderer, {
        canvas: stage.canvas,
        hero,
        media,
        maxCount: PARTICLES[tier],
        pixelRatio: stage.pixelRatio,
        onFail: (reason) => {
          if (import.meta.env.DEV) console.warn(`[hero particles] stopped: ${reason}`);
          stage.canvas.dataset.heroStopped = reason;
          failRef.current();
        },
        onSampled: () => stage.resetGuard(),
      });
      remove = stage.add(layer);
    } catch {
      failRef.current();
    }
    return () => remove();
  }, [stage, heroRef, media, tier]);

  return null;
}
