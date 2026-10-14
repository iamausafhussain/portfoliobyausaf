/**
 * The hero's final particle cloud, for Part 5's globe to form out of (spec 04 PT-4).
 * Positions are where each particle rests at progress 1, in viewport coordinates
 * (-1…1, y up, the same space as WebGL clip space); colours are 0–1 RGB.
 */
import { cloudPoint, type Particles } from './sampling';

export interface HeroCloud {
  count: number;
  positions: Float32Array;
  colors: Float32Array;
}

let current: HeroCloud | null = null;
const listeners = new Set<(cloud: HeroCloud | null) => void>();

export function getHeroCloud(): HeroCloud | null {
  return current;
}

export function onHeroCloud(fn: (cloud: HeroCloud | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function publishHeroCloud(p: Particles | null) {
  if (!p) {
    current = null;
  } else {
    const positions = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      // normalised viewport: the cloud's shape doesn't depend on the screen size
      const [x, y] = cloudPoint(p.rand[i * 4 + 1]!, p.rand[i * 4 + 2]!, 1, 1);
      positions[i * 2] = x * 2 - 1;
      positions[i * 2 + 1] = 1 - y * 2;
    }
    current = { count: p.count, positions, colors: p.color.slice(0, p.count * 3) };
  }
  listeners.forEach((fn) => fn(current));
}
