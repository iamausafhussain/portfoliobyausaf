/**
 * Footage → particles, the maths (spec 04 §3.3). No WebGL here, so it's unit-tested.
 */

/** Small, fast seeded random numbers (mulberry32), so the scatter looks the same every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Particles per tier (PT-2). */
export const PARTICLES = { high: 60_000, mid: 15_000, low: 0 } as const;

/** Grid of roughly `count` cells with the hero's aspect ratio. */
export function gridFor(count: number, width: number, height: number): { cols: number; rows: number } {
  const aspect = Math.max(0.2, Math.min(5, width / Math.max(1, height)));
  const cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
  const rows = Math.max(1, Math.floor(count / cols));
  return { cols, rows };
}

/** The part of the source that `object-fit: cover` shows in a dstW × dstH box. */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const sw = dstW / scale;
  const sh = dstH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/** Pixels darker than this are skipped, so the cloud keeps the picture's shape (§3.3 step 2). */
export const MIN_LUMA = 0.06;

export interface Particles {
  count: number;
  /** x, y in hero pixels (y down) */
  start: Float32Array;
  /** r, g, b in 0–1 */
  color: Float32Array;
  /** four random numbers per particle */
  rand: Float32Array;
  /** grid spacing in hero pixels */
  spacing: number;
}

/**
 * Turns a cols × rows RGBA frame into particles placed over a heroW × heroH box.
 * Writes into `into` when given (reusing buffers between samples).
 */
export function framePixelsToParticles(
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  heroW: number,
  heroH: number,
  seed = 1,
  into?: Particles,
): Particles {
  const max = cols * rows;
  const out: Particles =
    into && into.start.length >= max * 2
      ? into
      : {
          count: 0,
          start: new Float32Array(max * 2),
          color: new Float32Array(max * 3),
          rand: new Float32Array(max * 4),
          spacing: 0,
        };
  const rnd = seeded(seed);
  const cellW = heroW / cols;
  const cellH = heroH / rows;
  let n = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;
      // the random numbers are drawn for every cell, so a particle's motion doesn't depend
      // on which other pixels were skipped
      const r0 = rnd();
      const r1 = rnd();
      const r2 = rnd();
      const r3 = rnd();
      if (0.2126 * r + 0.7152 * g + 0.0722 * b < MIN_LUMA) continue;
      out.start[n * 2] = (x + 0.5) * cellW;
      out.start[n * 2 + 1] = (y + 0.5) * cellH;
      out.color[n * 3] = r;
      out.color[n * 3 + 1] = g;
      out.color[n * 3 + 2] = b;
      out.rand[n * 4] = r0;
      out.rand[n * 4 + 1] = r1;
      out.rand[n * 4 + 2] = r2;
      out.rand[n * 4 + 3] = r3;
      n++;
    }
  }
  out.count = n;
  out.spacing = Math.max(cellW, cellH);
  return out;
}

/**
 * Where a particle rests at the end (progress 1), in viewport pixels: a loose cloud below
 * the middle of the screen, "drifting down" into the next chapter (decision Q2).
 * Must match `cloud` in particles.vert.
 */
export function cloudPoint(r1: number, r2: number, vw: number, vh: number): [number, number] {
  // a soft ellipse rather than a box
  const a = r1 * Math.PI * 2;
  const rad = Math.sqrt(r2); // even spread across the ellipse
  return [vw * (0.5 + Math.cos(a) * rad * 0.46), vh * (0.66 + Math.sin(a) * rad * 0.24)];
}

/** How bright the cloud stays while it drifts behind About (spec 05 §3.3). */
export const CLOUD_FLOOR = 0.3;

/**
 * Overall opacity of the particle layer: fades in as soon as you scroll, settles to a
 * quiet cloud behind About, then hands over to the globe as it forms (`formation` 0–1,
 * spec 05 GL-6). Without a globe (`formation` stays 0) the cloud simply stays quiet.
 */
export function layerAlpha(p: number, formation = 0): number {
  if (p <= 0) return 0;
  const fadeIn = Math.min(1, p / 0.03);
  const settle = 1 - (1 - CLOUD_FLOOR) * Math.min(1, Math.max(0, (p - 0.6) / 0.32));
  return fadeIn * settle * (1 - Math.min(1, Math.max(0, formation)));
}

/**
 * A token colour as 0–1 sRGB numbers, as-is (no linear conversion: the shader mixes it
 * with raw video pixels, which are sRGB too).
 */
export function toRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
