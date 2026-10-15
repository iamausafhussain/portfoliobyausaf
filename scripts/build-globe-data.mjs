#!/usr/bin/env node
/**
 * Builds the globe's data (spec 05 §3.4). Run with `npm run globe:data`; the output is
 * committed, so this only needs re-running to change the dot density or the city list.
 *
 *  - src/scene/globe/data/land-dots.bin — evenly spaced dots on land, two densities
 *    (high, mid). Layout: Uint32 high count, Uint32 mid count, then Int16 pairs
 *    (lat × 100, lng × 100), high dots first.
 *  - src/admin/fields/cities.json — ≈ 500 large world cities for the admin's globe picker.
 *
 * Sources: Natural Earth 1:110m land (public domain) via `world-atlas`; GeoNames cities
 * (CC BY 4.0) via `all-the-cities`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Points spread evenly over a sphere (Fibonacci lattice), as [lat, lng] in degrees. */
export function fibonacciSphere(n) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2; // -1…1
    const theta = golden * i;
    const lat = (Math.asin(y) * 180) / Math.PI;
    let lng = ((theta * 180) / Math.PI) % 360;
    if (lng > 180) lng -= 360;
    out.push([lat, lng]);
  }
  return out;
}

const topo = require('world-atlas/land-110m.json');
const land = feature(topo, topo.objects.land);

/** Land dots; Antarctica is left out (it reads as a white band and adds nothing). */
function landDots(n) {
  return fibonacciSphere(n).filter(([lat, lng]) => lat > -58 && geoContains(land, [lng, lat]));
}

const high = landDots(42_000);
const mid = landDots(17_000);
const buf = Buffer.alloc(8 + (high.length + mid.length) * 4);
buf.writeUInt32LE(high.length, 0);
buf.writeUInt32LE(mid.length, 4);
let o = 8;
for (const [lat, lng] of [...high, ...mid]) {
  buf.writeInt16LE(Math.round(lat * 100), o);
  buf.writeInt16LE(Math.round(lng * 100), o + 2);
  o += 4;
}
const dotsFile = path.join(root, 'src/scene/globe/data/land-dots.bin');
mkdirSync(path.dirname(dotsFile), { recursive: true });
writeFileSync(dotsFile, buf);
console.log(`land dots: ${high.length} high, ${mid.length} mid, ${(buf.length / 1024).toFixed(1)} KB`);

/* ---------------- cities ---------------- */
const all = require('all-the-cities');
const byPop = all
  .filter((c) => c.population > 0 && /^PPL/.test(c.featureCode))
  .sort((a, b) => b.population - a.population);
const picked = [];
const seen = new Set();
const perCountry = new Map();
for (const c of byPop) {
  if (picked.length >= 480) break;
  const key = `${c.name}|${c.country}`;
  // a few per country, so the list covers the world rather than only the biggest countries
  const n = perCountry.get(c.country) ?? 0;
  if (seen.has(key) || n >= 12) continue;
  seen.add(key);
  perCountry.set(c.country, n + 1);
  picked.push(c);
}
// always include home and a few places that matter to the owner
// (GeoNames spellings; renamed below where the usual spelling differs)
for (const name of ['Bhubaneshwar', 'Cuttack', 'Kendujhar', 'Keonjhar', 'Pokhara', 'Kathmandu']) {
  const c = byPop.find((x) => x.name === name);
  if (c && !picked.includes(c)) picked.push(c);
}
const rename = { Bhubaneshwar: 'Bhubaneswar' };
const cities = picked
  .map((c) => ({
    name: rename[c.name] ?? c.name,
    country: c.country,
    lat: Math.round(c.loc.coordinates[1] * 100) / 100,
    lng: Math.round(c.loc.coordinates[0] * 100) / 100,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
const citiesFile = path.join(root, 'src/admin/fields/cities.json');
writeFileSync(citiesFile, JSON.stringify(cities));
console.log(`cities: ${cities.length}`);
