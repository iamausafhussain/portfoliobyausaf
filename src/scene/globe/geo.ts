/**
 * Globe maths (spec 05 GL-1 – GL-5). No Three.js here, so it's unit-tested and usable
 * from the main bundle.
 *
 * Coordinates: unit sphere, y up; lat/lng 0/0 faces +z (towards the camera when the
 * globe isn't rotated).
 */

export type Vec3 = [number, number, number];
export interface LatLng {
  lat: number;
  lng: number;
}

const RAD = Math.PI / 180;

export function latLngToVec3(lat: number, lng: number, r = 1): Vec3 {
  const la = lat * RAD;
  const lo = lng * RAD;
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
}

export function vec3ToLatLng([x, y, z]: Vec3): LatLng {
  const r = Math.hypot(x, y, z) || 1;
  return { lat: Math.asin(y / r) / RAD, lng: Math.atan2(x, z) / RAD };
}

/** Angle between two points on the globe, in degrees. */
export function angleBetween(a: LatLng, b: LatLng): number {
  const [ax, ay, az] = latLngToVec3(a.lat, a.lng);
  const [bx, by, bz] = latLngToVec3(b.lat, b.lng);
  return Math.acos(Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz))) / RAD;
}

/**
 * The globe rotation (Euler XYZ: x = tilt, y = spin, radians) that turns `p` to face the
 * camera: spin by −lng, then tilt by +lat.
 */
export function facingRotation(p: LatLng): { x: number; y: number } {
  return { x: p.lat * RAD, y: -p.lng * RAD };
}

/** The nearest equivalent of angle `to` from `from` (so the globe turns the short way). */
export function shortestAngle(from: number, to: number): number {
  const full = Math.PI * 2;
  let d = (to - from) % full;
  if (d > Math.PI) d -= full;
  if (d < -Math.PI) d += full;
  return from + d;
}

/**
 * Points along the great-circle arc from `a` to `b`, lifted off the surface in the middle
 * (longer routes fly higher), for routes and packets (GL-5).
 */
export function arcPoints(a: LatLng, b: LatLng, segments = 64): Vec3[] {
  const va = latLngToVec3(a.lat, a.lng);
  const vb = latLngToVec3(b.lat, b.lng);
  const omega = angleBetween(a, b) * RAD;
  const lift = 0.06 + 0.22 * (omega / Math.PI);
  const out: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let v: Vec3;
    if (omega < 1e-6) v = va;
    else {
      const s = Math.sin(omega);
      const wa = Math.sin((1 - t) * omega) / s;
      const wb = Math.sin(t * omega) / s;
      v = [va[0] * wa + vb[0] * wb, va[1] * wa + vb[1] * wb, va[2] * wa + vb[2] * wb];
    }
    const h = 1.004 + lift * Math.sin(Math.PI * t);
    const len = Math.hypot(...v) || 1;
    out.push([(v[0] / len) * h, (v[1] / len) * h, (v[2] / len) * h]);
  }
  return out;
}

/** A point along a polyline at 0–1 of its length (by segment count, which is even here). */
export function alongArc(points: Vec3[], t: number): Vec3 {
  const f = Math.min(1, Math.max(0, t)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  const k = f - i;
  const p = points[i]!;
  const q = points[i + 1]!;
  return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
}

/** Small stable hash of a string (FNV-1a), for placements that never change between visits. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Home: Bhubaneswar (GL-2). */
export const HOME: LatLng & { id: string; label: string } = {
  id: 'home',
  label: 'Home · Bhubaneswar',
  lat: 20.3,
  lng: 85.82,
};

/** Nodes closer than this (degrees) count as overlapping (GL-4). */
export const MIN_SEPARATION = 9;

export interface PlaceInput {
  id: string;
  globe: LatLng | null;
}

/**
 * Positions for every project (GL-3, GL-4). Projects with a position keep it; the others
 * get a spot from `candidates` (land points work well), chosen by a hash of their id so it
 * doesn't move between visits, and never within MIN_SEPARATION of another node.
 */
export function placeProjects(
  projects: PlaceInput[],
  candidates: LatLng[],
  home: LatLng = HOME,
): Map<string, LatLng> {
  const placed = new Map<string, LatLng>();
  const taken: LatLng[] = [home];
  for (const p of projects) {
    if (p.globe) {
      placed.set(p.id, p.globe);
      taken.push(p.globe);
    }
  }
  const pool = candidates.filter((c) => c.lat > -40 && c.lat < 62);
  for (const p of projects) {
    if (p.globe) continue;
    let spot: LatLng | null = null;
    if (pool.length) {
      const start = hashString(p.id) % pool.length;
      const stride = 7919 % pool.length || 1;
      for (let k = 0; k < pool.length; k++) {
        const c = pool[(start + k * stride) % pool.length]!;
        if (taken.every((t) => angleBetween(t, c) >= MIN_SEPARATION)) {
          spot = c;
          break;
        }
      }
    }
    // nothing free (or no candidates): a ring around home, still stable
    spot ??= {
      lat: home.lat + 25 * Math.sin(hashString(p.id)),
      lng: home.lng + 40 * Math.cos(hashString(p.id)),
    };
    placed.set(p.id, spot);
    taken.push(spot);
  }
  return placed;
}

/* ------------------------------------------------------------------ */
/* Land dots file (scripts/build-globe-data.mjs)                       */
/* ------------------------------------------------------------------ */

export interface LandDots {
  high: Float32Array; // lat, lng pairs
  mid: Float32Array;
}

export function parseLandDots(buf: ArrayBuffer): LandDots {
  const head = new DataView(buf);
  const high = head.getUint32(0, true);
  const mid = head.getUint32(4, true);
  const raw = new Int16Array(buf, 8, (high + mid) * 2);
  const all = Float32Array.from(raw, (v) => v / 100);
  return { high: all.subarray(0, high * 2), mid: all.subarray(high * 2) };
}

/* ------------------------------------------------------------------ */
/* Tour (SY-1)                                                         */
/* ------------------------------------------------------------------ */

export const MAX_STOPS = 6;

/**
 * Which tour stop is showing, from how far the tour section has scrolled: `scrolled` px
 * past its top, `span` px of scroll per stop.
 */
export function stopAt(scrolled: number, span: number, stops: number): number {
  if (stops <= 0) return -1;
  return Math.min(stops - 1, Math.max(0, Math.floor(scrolled / Math.max(1, span))));
}

/** How far the globe has formed as its chapter scrolls in: 0 when the chapter's top is at the bottom of the screen, 1 once it's 90 % of the way up. */
export function formationProgress(chapterTop: number, viewportHeight: number): number {
  // complete once the chapter's top has travelled 70 % of the window (heading near the top)
  return Math.min(1, Math.max(0, (viewportHeight - chapterTop) / (viewportHeight * 0.7)));
}
