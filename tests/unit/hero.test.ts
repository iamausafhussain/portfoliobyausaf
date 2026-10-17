/** Spec 04 task 4.10: clip selection, intro-once logic, particles maths, frame guard. */
import { describe, expect, it } from 'vitest';
import {
  chooseClips,
  forTheme,
  heroProgress,
  introMode,
  nextIndex,
  sampleClips,
  timecode,
  toClips,
  videoAllowed,
  videoSources,
  type Clip,
} from '../../src/chapters/hero/heroMedia';
import type { HeroMedia } from '../../src/data/schemas';
import { createFrameGuard } from '../../src/scene/stage/frameGuard';
import {
  CLOUD_FLOOR,
  cloudPoint,
  coverCrop,
  framePixelsToParticles,
  gridFor,
  layerAlpha,
  MIN_LUMA,
  PARTICLES,
  seeded,
  toRgb,
} from '../../src/scene/hero/sampling';

const row = (n: number, over: Partial<HeroMedia> = {}): HeroMedia => ({
  id: `id-${n}`,
  sort_order: n,
  is_published: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  title: `Clip ${n}`,
  source_type: 'upload',
  video_mp4: `videos/hero/${n}.mp4`,
  video_webm: null,
  video_mobile: null,
  poster: { path: `images/hero/${n}.webp`, alt: `Poster ${n}`, width: 1920, height: 1080 },
  theme: 'both',
  ...over,
});
const url = (p: string) => `https://cdn.test/${p}`;

describe('FG-1 clips from published rows', () => {
  it('resolves storage paths and marks uploads readable, external links not', () => {
    const [a, b] = toClips(
      [
        row(1, { video_webm: 'videos/hero/1.webm', video_mobile: 'videos/hero/1-m.mp4' }),
        row(2, { source_type: 'url', video_mp4: 'https://vimeo.test/x.mp4' }),
      ],
      (p) => (p.startsWith('https://') ? p : url(p)),
    );
    expect(a).toMatchObject({
      mp4: 'https://cdn.test/videos/hero/1.mp4',
      webm: 'https://cdn.test/videos/hero/1.webm',
      phone: 'https://cdn.test/videos/hero/1-m.mp4',
      readable: true,
    });
    expect(a!.poster).toEqual({
      src: 'https://cdn.test/images/hero/1.webp',
      alt: 'Poster 1',
      width: 1920,
      height: 1080,
    });
    expect(b).toMatchObject({ mp4: 'https://vimeo.test/x.mp4', readable: false });
  });

  it('skips rows whose files cannot be resolved', () => {
    expect(toClips([row(1)], () => '')).toEqual([]);
  });

  it('bundled samples: a dusk clip for dark, a day clip for light (decision Q7)', () => {
    const s = sampleClips();
    expect(s.map((c) => [c.theme, c.mp4])).toEqual([
      ['dark', '/hero-sample/dusk.mp4'],
      ['light', '/hero-sample/day.mp4'],
    ]);
    expect(forTheme(s, 'light').map((c) => c.id)).toEqual(['sample-day']);
  });
});

describe('FG-2 playback modes and theme', () => {
  const clips = toClips([row(1), row(2, { theme: 'dark' }), row(3, { theme: 'light' })], url);

  it('single plays the first, sequence plays all in order, random picks one', () => {
    expect(chooseClips(clips, 'single', 0.9).map((c) => c.id)).toEqual(['id-1']);
    expect(chooseClips(clips, 'sequence', 0.9).map((c) => c.id)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(chooseClips(clips, 'random', 0).map((c) => c.id)).toEqual(['id-1']);
    expect(chooseClips(clips, 'random', 0.5).map((c) => c.id)).toEqual(['id-2']);
    expect(chooseClips(clips, 'random', 0.999).map((c) => c.id)).toEqual(['id-3']);
    expect(chooseClips([], 'single', 0)).toEqual([]);
  });

  it('dark-only / light-only clips follow the theme; "both" plays in either', () => {
    expect(forTheme(clips, 'dark').map((c) => c.id)).toEqual(['id-1', 'id-2']);
    expect(forTheme(clips, 'light').map((c) => c.id)).toEqual(['id-1', 'id-3']);
  });

  it('with no clip for the theme, plays the others rather than nothing', () => {
    const darkOnly = toClips([row(1, { theme: 'dark' })], url);
    expect(forTheme(darkOnly, 'light')).toHaveLength(1);
  });

  it('sequence wraps round', () => {
    expect([nextIndex(0, 3), nextIndex(2, 3), nextIndex(0, 0)]).toEqual([1, 0, 0]);
  });
});

describe('FG-3 / FG-4 video rules', () => {
  const clip: Clip = toClips([row(1, { video_webm: 'v.webm', video_mobile: 'm.mp4' })], (p) => p)[0]!;

  it('video only on high/mid, never with Data Saver, reduced motion or Lite', () => {
    const ok = { tier: 'high', saveData: false, reducedMotion: false, lite: false } as const;
    expect(videoAllowed(ok)).toBe(true);
    expect(videoAllowed({ ...ok, tier: 'mid' })).toBe(true);
    expect(videoAllowed({ ...ok, tier: 'low' })).toBe(false);
    expect(videoAllowed({ ...ok, saveData: true })).toBe(false);
    expect(videoAllowed({ ...ok, reducedMotion: true })).toBe(false);
    expect(videoAllowed({ ...ok, lite: true })).toBe(false);
  });

  it('phone version first on narrow screens and the mid tier, WebM first otherwise', () => {
    expect(videoSources(clip, { narrow: false, tier: 'high' }).map((s) => s.src)).toEqual([
      'v.webm',
      'videos/hero/1.mp4',
    ]);
    expect(videoSources(clip, { narrow: true, tier: 'high' })[0]!.src).toBe('m.mp4');
    expect(videoSources(clip, { narrow: false, tier: 'mid' })[0]!.src).toBe('m.mp4');
    const plain = { ...clip, webm: null, phone: null };
    expect(videoSources(plain, { narrow: true, tier: 'mid' })).toEqual([
      { src: 'videos/hero/1.mp4', type: 'video/mp4' },
    ]);
  });
});

describe('OS-4 / OS-5 intro', () => {
  it('plays in full once per session; reduced motion gets the short fade; Lite gets the final frame', () => {
    expect(introMode({ playedThisSession: false, lite: false, reducedMotion: false })).toBe('full');
    expect(introMode({ playedThisSession: true, lite: false, reducedMotion: false })).toBe('none');
    expect(introMode({ playedThisSession: false, lite: false, reducedMotion: true })).toBe('reduced');
    expect(introMode({ playedThisSession: false, lite: true, reducedMotion: false })).toBe('none');
  });

  it('timecode is HH:MM:SS:FF at 24 fps', () => {
    expect(timecode(0)).toBe('00:00:00:00');
    expect(timecode(1.5)).toBe('00:00:01:12');
    expect(timecode(3725.99)).toBe('01:02:05:23');
    expect(timecode(-3)).toBe('00:00:00:00');
  });
});

describe('PT-1 – PT-4 particles', () => {
  it('tier counts', () => {
    expect(PARTICLES).toEqual({ high: 60_000, mid: 15_000, low: 0 });
  });

  it('the grid follows the hero shape and stays within the count', () => {
    for (const [w, h] of [
      [1440, 900],
      [375, 812],
      [2560, 1080],
    ] as const) {
      const { cols, rows } = gridFor(60_000, w, h);
      expect(cols * rows).toBeLessThanOrEqual(60_000);
      expect(cols * rows).toBeGreaterThan(58_000);
      expect(cols / rows).toBeCloseTo(w / h, 0);
    }
  });

  it('cover crop matches object-fit: cover', () => {
    expect(coverCrop(1920, 1080, 1440, 900)).toEqual({ sx: 96, sy: 0, sw: 1728, sh: 1080 });
    const tall = coverCrop(1920, 1080, 375, 812);
    expect(tall.sh).toBe(1080);
    expect(tall.sw).toBeCloseTo(1080 * (375 / 812), 5);
    expect(tall.sx).toBeCloseTo((1920 - tall.sw) / 2, 5);
  });

  it('turns pixels into particles, skipping dark ones, with colours from the frame', () => {
    // 2 × 2 frame: black, white, mid grey, nearly black
    const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 128, 64, 32, 255, 10, 10, 10, 255]);
    const p = framePixelsToParticles(px, 2, 2, 200, 100);
    expect(p.count).toBe(2);
    expect([...p.start.subarray(0, 4)]).toEqual([150, 25, 50, 75]);
    expect([...p.color.subarray(0, 3)]).toEqual([1, 1, 1]);
    expect(p.color[3]).toBeCloseTo(128 / 255);
    expect(p.spacing).toBe(100);
    expect(10 / 255).toBeLessThan(MIN_LUMA);
  });

  it('the scatter is seeded: the same frame always gives the same motion', () => {
    const px = new Uint8ClampedArray(16 * 4).fill(200);
    const a = framePixelsToParticles(px, 4, 4, 100, 100, 3);
    const b = framePixelsToParticles(px, 4, 4, 100, 100, 3);
    expect([...a.rand]).toEqual([...b.rand]);
    const r = seeded(1);
    const v = Array.from({ length: 1000 }, r);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...v)).toBeLessThan(1);
  });

  it('the cloud rests in a soft ellipse below the middle of the screen (drifting down, decision Q2)', () => {
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const [x, y] = cloudPoint(i / 20, j / 20, 1000, 1000);
        // inside the ellipse centred at (500, 660) with radii 460 × 240
        expect(((x - 500) / 460) ** 2 + ((y - 660) / 240) ** 2).toBeLessThanOrEqual(1.0001);
        expect(y).toBeGreaterThan(400);
      }
    }
  });

  it('layer fades in as you scroll and is gone once the hero has left (no lingering cloud behind About)', () => {
    expect(CLOUD_FLOOR).toBe(0);
    expect(layerAlpha(0)).toBe(0);
    expect(layerAlpha(0.03)).toBe(1);
    expect(layerAlpha(0.3)).toBe(1);
    expect(layerAlpha(0.5)).toBeCloseTo(0.5);
    expect(layerAlpha(0.65)).toBe(0);
    expect(layerAlpha(1)).toBe(0);
    expect(layerAlpha(0.5, 1)).toBe(0);
  });

  it('scroll progress covers the first 120 % of the hero (HL-3)', () => {
    expect(heroProgress(0, 0, 900)).toBe(0);
    expect(heroProgress(540, 0, 900)).toBe(0.5);
    expect(heroProgress(2000, 0, 900)).toBe(1);
  });

  it('token colours go to the shader as raw sRGB', () => {
    expect(toRgb('#FF8000')).toEqual([1, 128 / 255, 0]);
    expect(toRgb('#fff')).toEqual([1, 1, 1]);
  });
});

describe('PT-6 frame guard', () => {
  it('ignores warm-up frames and stops only on sustained slowness', () => {
    const g = createFrameGuard();
    for (let i = 0; i < 10; i++) expect(g.frame(500)).toBe(false); // warm-up
    let stopped = false;
    for (let i = 0; i < 40 && !stopped; i++) stopped = g.frame(i % 3 === 0 ? 16 : 80); // 2 in 3 slow
    expect(stopped).toBe(true);
  });

  it('occasional slow frames are fine', () => {
    const g = createFrameGuard();
    for (let i = 0; i < 300; i++) expect(g.frame(i % 4 === 0 ? 120 : 16)).toBe(false);
  });

  it('a new sample restarts the warm-up', () => {
    const g = createFrameGuard({ warmUp: 2, limit: 2, window: 3 });
    g.frame(16);
    g.frame(16);
    g.frame(99);
    g.reset();
    expect(g.frame(99)).toBe(false);
    expect(g.frame(99)).toBe(false);
    expect(g.frame(99)).toBe(true);
  });
});
