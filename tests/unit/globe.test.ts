/** Spec 05 task 5.13: globe maths, auto-placement, arcs, rig, tour stops, city search, data file. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findCity, mapToLatLng } from '../../src/admin/fields/GlobeField';
import {
  alongArc,
  angleBetween,
  arcPoints,
  facingRotation,
  formationProgress,
  hashString,
  HOME,
  latLngToVec3,
  MAX_STOPS,
  MIN_SEPARATION,
  parseLandDots,
  placeProjects,
  shortestAngle,
  stopAt,
  vec3ToLatLng,
  type LatLng,
} from '../../src/scene/globe/geo';
import { DRAG_HOLD, GlobeRig, IDLE_SPIN } from '../../src/scene/globe/rig';

const root = path.resolve(__dirname, '../..');
const dotsBuf = readFileSync(path.join(root, 'src/scene/globe/data/land-dots.bin'));
const dots = parseLandDots(dotsBuf.buffer.slice(dotsBuf.byteOffset, dotsBuf.byteOffset + dotsBuf.byteLength));
const candidates: LatLng[] = [];
for (let i = 0; i < dots.mid.length; i += 2) candidates.push({ lat: dots.mid[i]!, lng: dots.mid[i + 1]! });

/** Rotate a point by Euler XYZ (x then… as Three.js applies it: Rx · Ry · v). */
function rotate([x, y, z]: [number, number, number], rx: number, ry: number): [number, number, number] {
  const x1 = x * Math.cos(ry) + z * Math.sin(ry);
  const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
  return [x1, y * Math.cos(rx) - z1 * Math.sin(rx), y * Math.sin(rx) + z1 * Math.cos(rx)];
}

describe('GL-1 land dot data', () => {
  it('has two densities of land dots in a small file', () => {
    expect(dots.high.length / 2).toBeGreaterThan(9000);
    expect(dots.mid.length / 2).toBeGreaterThan(3500);
    expect(dots.mid.length).toBeLessThan(dots.high.length);
    expect(dotsBuf.byteLength).toBeLessThan(64 * 1024);
  });

  it('has land where land is (Bhubaneswar, Paris) and none mid-ocean', () => {
    const near = (p: LatLng, deg: number) => candidates.some((c) => angleBetween(c, p) < deg);
    expect(near(HOME, 3)).toBe(true);
    expect(near({ lat: 48.86, lng: 2.35 }, 3)).toBe(true);
    expect(near({ lat: -30, lng: -140 }, 4)).toBe(false); // South Pacific
  });
});

describe('geo maths', () => {
  it('lat/lng ↔ 3D round-trips', () => {
    for (const p of [HOME, { lat: -33.9, lng: 151.2 }, { lat: 0, lng: -179 }]) {
      const back = vec3ToLatLng(latLngToVec3(p.lat, p.lng));
      expect(back.lat).toBeCloseTo(p.lat, 6);
      expect(back.lng).toBeCloseTo(p.lng, 6);
    }
  });

  it('facingRotation turns a point to face the camera (+z)', () => {
    for (const p of [HOME, { lat: 51.5, lng: -0.12 }, { lat: -22.9, lng: -43.2 }]) {
      const r = facingRotation(p);
      const v = rotate(latLngToVec3(p.lat, p.lng), r.x, r.y);
      expect(v[2]).toBeCloseTo(1, 6);
    }
  });

  it('turns the short way round', () => {
    expect(shortestAngle(0, (350 * Math.PI) / 180)).toBeCloseTo((-10 * Math.PI) / 180);
    expect(shortestAngle(10, 10 + 0.5)).toBeCloseTo(10.5);
  });

  it('routes follow the great circle, lifted in the middle, ending on the nodes', () => {
    const a = HOME;
    const b = { lat: 40.7, lng: -74 };
    const pts = arcPoints(a, b, 32);
    expect(pts).toHaveLength(33);
    const h = (v: number[]) => Math.hypot(...v);
    expect(h(pts[0]!)).toBeCloseTo(1.004, 3);
    expect(h(pts[16]!)).toBeGreaterThan(1.1);
    expect(vec3ToLatLng(pts[32]!).lat).toBeCloseTo(b.lat, 3);
    expect(alongArc(pts, 0)).toEqual(pts[0]);
    expect(alongArc(pts, 1)).toEqual(pts[32]);
  });
});

describe('GL-4 auto-placement', () => {
  const projects = Array.from({ length: 12 }, (_, i) => ({ id: `p-${i}`, globe: null }));

  it('places every project, none within MIN_SEPARATION of another node or home', () => {
    const spots = placeProjects(projects, candidates);
    const all = [HOME, ...spots.values()];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(angleBetween(all[i]!, all[j]!)).toBeGreaterThanOrEqual(MIN_SEPARATION - 1e-9);
  });

  it('is stable: the same project gets the same spot every visit', () => {
    const a = placeProjects(projects, candidates);
    const b = placeProjects([...projects], candidates);
    for (const p of projects) expect(b.get(p.id)).toEqual(a.get(p.id));
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('keeps positions set in the admin', () => {
    const set = { lat: 28.21, lng: 83.99 };
    const spots = placeProjects([{ id: 'x', globe: set }, ...projects.slice(0, 3)], candidates);
    expect(spots.get('x')).toEqual(set);
    for (const p of projects.slice(0, 3))
      expect(angleBetween(spots.get(p.id)!, set)).toBeGreaterThanOrEqual(MIN_SEPARATION);
  });

  it('still places projects when there are no candidates', () => {
    expect(placeProjects([{ id: 'a', globe: null }], []).get('a')).toBeDefined();
  });
});

describe('rig: focus, drag, idle spin', () => {
  it('turns to a focused node and settles there', () => {
    const rig = new GlobeRig();
    const target = { lat: 40.7, lng: -74 };
    rig.focus(target);
    let moving = true;
    for (let i = 0; i < 600 && moving; i++) moving = rig.update(1 / 60);
    expect(moving).toBe(false);
    const v = rotate(latLngToVec3(target.lat, target.lng), rig.x, rig.y);
    expect(v[2]).toBeCloseTo(1, 3);
  });

  it('idles with a slow spin (about one turn a minute)', () => {
    const rig = new GlobeRig();
    const y0 = rig.y;
    for (let i = 0; i < 60; i++) rig.update(1 / 60);
    expect(rig.y - y0).toBeCloseTo(IDLE_SPIN, 3);
  });

  it('drag turns it, coasts, holds, then eases back to the focus', () => {
    const rig = new GlobeRig();
    rig.focus(HOME);
    for (let i = 0; i < 300; i++) rig.update(1 / 60);
    const settled = rig.y;
    for (let i = 0; i < 10; i++) rig.drag(20, 0, 1 / 60);
    expect(rig.y).toBeGreaterThan(settled + 0.5);
    rig.release();
    const afterRelease = rig.y;
    rig.update(1 / 60);
    expect(rig.y).toBeGreaterThan(afterRelease); // coasting
    for (let i = 0; i < 60 * (DRAG_HOLD + 4); i++) rig.update(1 / 60);
    const v = rotate(latLngToVec3(HOME.lat, HOME.lng), rig.x, rig.y);
    expect(v[2]).toBeCloseTo(1, 3); // back facing home
  });

  it('never tilts past the limit', () => {
    const rig = new GlobeRig();
    for (let i = 0; i < 100; i++) rig.drag(0, 50);
    expect(Math.abs(rig.x)).toBeLessThanOrEqual(1.05);
  });
});

describe('SY-1 tour stops and GL-6 formation', () => {
  it('one stop per screen of scroll, clamped to the featured projects', () => {
    expect(MAX_STOPS).toBe(6);
    expect(stopAt(-100, 900, 3)).toBe(0);
    expect(stopAt(0, 900, 3)).toBe(0);
    expect(stopAt(950, 900, 3)).toBe(1);
    expect(stopAt(5000, 900, 3)).toBe(2);
    expect(stopAt(10, 900, 0)).toBe(-1);
  });

  it('formation runs as the chapter scrolls in', () => {
    expect(formationProgress(1000, 900)).toBe(0);
    expect(formationProgress(900, 900)).toBe(0);
    expect(formationProgress(585, 900)).toBeCloseTo(0.5);
    expect(formationProgress(270, 900)).toBe(1); // done with the heading near the top
    expect(formationProgress(0, 900)).toBe(1);
    expect(formationProgress(-3000, 900)).toBe(1);
  });
});

describe('AD-1 / AD-2 admin picker helpers', () => {
  it('map clicks become lat/lng', () => {
    expect(mapToLatLng(360, 180, 720, 360)).toEqual({ lat: 0, lng: 0 });
    expect(mapToLatLng(0, 0, 720, 360)).toEqual({ lat: 90, lng: -180 });
    expect(mapToLatLng(720, 360, 720, 360)).toEqual({ lat: -90, lng: 180 });
  });

  it('finds cities by "Name, CC" or by name, including home', () => {
    const b = findCity('Bhubaneswar');
    expect(b?.country).toBe('IN');
    expect(Math.abs(b!.lat - HOME.lat)).toBeLessThan(0.5);
    expect(findCity('london, gb')?.country).toBe('GB');
    expect(findCity('Atlantis')).toBeUndefined();
    expect(findCity('   ')).toBeUndefined();
  });
});
