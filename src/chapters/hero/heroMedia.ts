/**
 * Which hero clip(s) to play, and whether to play video at all (spec 04 FG-1 – FG-4).
 * Pure functions, so every rule is unit-tested.
 */
import type { Tier } from '../../device/tier';
import type { HeroMedia } from '../../data/schemas';
import type { ThemeName } from '../../theme/tokens';

export type Playback = 'single' | 'sequence' | 'random';

/** A clip ready to play: resolved URLs, nothing left to look up. */
export interface Clip {
  id: string;
  title: string;
  mp4: string;
  webm: string | null;
  phone: string | null;
  poster: { src: string; alt: string; width: number | null; height: number | null };
  /** Same-origin or CORS-enabled, so its frames can be read for the particles (§3.3 step 5). */
  readable: boolean;
  theme: 'both' | ThemeName;
}

export interface VideoSource {
  src: string;
  type: 'video/mp4' | 'video/webm';
}

const base = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

/**
 * Generated stand-in footage bundled with the site (decision Q7), used until a clip is
 * published from the admin: a dusk flyover for the dark theme, a daytime one for light.
 */
export function sampleClips(): Clip[] {
  const at = (f: string) => `${base()}hero-sample/${f}`;
  const make = (kind: 'dusk' | 'day', theme: ThemeName, alt: string): Clip => ({
    id: `sample-${kind}`,
    title: `Sample ${kind} flyover`,
    mp4: at(`${kind}.mp4`),
    webm: at(`${kind}.webm`),
    phone: at(`${kind}-phone.mp4`),
    poster: { src: at(`${kind}.webp`), alt, width: 1280, height: 720 },
    readable: true,
    theme,
  });
  return [
    make('dusk', 'dark', 'Aerial view of a coastline at dusk'),
    make('day', 'light', 'Aerial view of green hills and lakes by day'),
  ];
}

/** Turns published rows into clips, resolving storage paths to URLs. */
export function toClips(rows: HeroMedia[], url: (path: string) => string): Clip[] {
  const out: Clip[] = [];
  for (const r of rows) {
    const mp4 = url(r.video_mp4);
    const poster = url(r.poster.path);
    if (!mp4 || !poster) continue;
    out.push({
      id: r.id,
      title: r.title,
      mp4,
      webm: r.video_webm ? url(r.video_webm) || null : null,
      phone: r.video_mobile ? url(r.video_mobile) || null : null,
      poster: {
        src: poster,
        alt: r.poster.alt,
        width: r.poster.width ?? null,
        height: r.poster.height ?? null,
      },
      // uploads live in our own storage (CORS enabled); external hosts may block reading
      readable: r.source_type === 'upload',
      theme: r.theme,
    });
  }
  return out;
}

/** Clips for the current theme (FG-2); if none match, all of them rather than nothing. */
export function forTheme(clips: Clip[], theme: ThemeName): Clip[] {
  const matching = clips.filter((c) => c.theme === 'both' || c.theme === theme);
  return matching.length ? matching : clips;
}

/**
 * The clips to play, in order (FG-2):
 *  single → the first; sequence → all, each once; random → one, picked by `pick` (0–1).
 */
export function chooseClips(clips: Clip[], mode: Playback, pick: number): Clip[] {
  if (clips.length === 0) return [];
  if (mode === 'sequence') return clips;
  if (mode === 'random') return [clips[Math.min(clips.length - 1, Math.floor(pick * clips.length))]!];
  return [clips[0]!];
}

/** FG-4: video only on high/mid, never with Data Saver, reduced motion or Lite mode. */
export function videoAllowed(o: {
  tier: Tier;
  saveData: boolean;
  reducedMotion: boolean;
  lite: boolean;
}): boolean {
  return (o.tier === 'high' || o.tier === 'mid') && !o.saveData && !o.reducedMotion && !o.lite;
}

/**
 * FG-3: the phone version first on narrow screens or the mid tier; otherwise WebM first
 * (where the browser plays it). The other files follow as fallbacks: the browser skips
 * any type it can't play.
 */
export function videoSources(clip: Clip, o: { narrow: boolean; tier: Tier }): VideoSource[] {
  const list: VideoSource[] = [];
  if ((o.narrow || o.tier === 'mid') && clip.phone) list.push({ src: clip.phone, type: 'video/mp4' });
  if (clip.webm) list.push({ src: clip.webm, type: 'video/webm' });
  list.push({ src: clip.mp4, type: 'video/mp4' });
  return list;
}

/** Index of the clip after `i` in a sequence (wraps round). */
export const nextIndex = (i: number, count: number) => (count ? (i + 1) % count : 0);

/* ------------------------------------------------------------------ */
/* Intro: once per session (OS-4)                                      */
/* ------------------------------------------------------------------ */

export const INTRO_KEY = 'intro-played';

export type IntroMode = 'full' | 'reduced' | 'none';

/**
 * What the intro does on this load:
 *  - none: already played this session, or Lite mode (final frame at once)
 *  - reduced: reduced motion (a 200 ms fade, OS-5)
 *  - full: the 2.4 s sequence
 */
export function introMode(o: {
  playedThisSession: boolean;
  lite: boolean;
  reducedMotion: boolean;
}): IntroMode {
  if (o.lite || o.playedThisSession) return 'none';
  return o.reducedMotion ? 'reduced' : 'full';
}

/* ------------------------------------------------------------------ */
/* Timecode                                                            */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds → HH:MM:SS:FF at the given frame rate (film timecode). */
export function timecode(seconds: number, fps = 24): string {
  const s = Math.max(0, seconds);
  const whole = Math.floor(s);
  const frames = Math.min(fps - 1, Math.floor((s - whole) * fps));
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}:${pad(frames)}`;
}

/** Scroll progress through the hero's effect range (HL-3: the first ~120 % of its height). */
export function heroProgress(scrollY: number, heroTop: number, heroHeight: number): number {
  const range = Math.max(1, heroHeight * 1.2);
  return Math.min(1, Math.max(0, (scrollY - heroTop) / range));
}
