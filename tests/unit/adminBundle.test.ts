/**
 * AC-2.8 / master spec P-2 — production build:
 *  - the public site's first download contains no admin code,
 *  - no demo-mode code exists anywhere,
 *  - the initial JS stays within the 200 KB (gzipped) budget.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';

const root = path.resolve(__dirname, '../..');
let outDir = '';
let html = '';
let entryFiles: string[] = [];
let allJs: { file: string; code: string }[] = [];

beforeAll(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'portfolio-build-'));
  // Vitest sets NODE_ENV=test, which would make Vite build in development mode.
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await build({ root, logLevel: 'silent', mode: 'production', build: { outDir, emptyOutDir: true } });
  } finally {
    process.env.NODE_ENV = previous;
  }
  html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
  entryFiles = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
  allJs = readdirSync(path.join(outDir, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ file: `assets/${f}`, code: readFileSync(path.join(outDir, 'assets', f), 'utf8') }));
}, 120_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe('production bundle', () => {
  it('the entry chunk(s) contain no admin code', () => {
    expect(entryFiles.length).toBeGreaterThan(0);
    for (const f of entryFiles) {
      const code = readFileSync(path.join(outDir, f), 'utf8');
      for (const marker of [
        'Set up two-factor login',
        'Media library',
        'Save & publish',
        'react-hook-form',
      ]) {
        expect(code.includes(marker), `${marker} in ${f}`).toBe(false);
      }
    }
  });

  it('admin code exists in a separate lazy chunk', () => {
    expect(
      allJs.some((f) => f.code.includes('Set up two-factor login') && !entryFiles.includes(f.file)),
    ).toBe(true);
  });

  it('demo mode is not in the build at all', () => {
    for (const { file, code } of allJs) {
      for (const marker of [
        'demo@example.com',
        'Demo drone reel',
        '__demoRepo',
        'createDemoRepository',
        'publicSource',
        '__queryClient',
      ]) {
        expect(code.includes(marker), `${marker} in ${file}`).toBe(false);
      }
    }
  });

  it('GSAP and Lenis load later, not in the first download (spec 03 SC-5, AC-3.16)', () => {
    for (const f of entryFiles) {
      const code = readFileSync(path.join(outDir, f), 'utf8');
      expect(code.includes('GreenSock'), `GSAP in ${f}`).toBe(false);
      expect(code.includes('lenis-smooth'), `Lenis in ${f}`).toBe(false);
      // the public site reads through the REST client; sign-in code stays in the admin
      expect(code.includes('GoTrueClient'), `Supabase Auth in ${f}`).toBe(false);
    }
    expect(allJs.some((f) => f.code.includes('GreenSock'))).toBe(true);
  });

  it('Three.js and the particle scene are a lazy chunk (spec 04 PT-5, AC-4.12)', () => {
    for (const f of entryFiles) {
      const code = readFileSync(path.join(outDir, f), 'utf8');
      expect(code.includes('WebGLRenderer'), `three.js in ${f}`).toBe(false);
      expect(code.includes('uTintGlow'), `particle shader in ${f}`).toBe(false);
    }
    expect(allJs.some((f) => f.code.includes('uTintGlow') && !entryFiles.includes(f.file))).toBe(true);
  });

  it('dev-only switches are not in the build (?noguard, ?intro=hold, demo clips)', () => {
    for (const { file, code } of allJs) {
      expect(code.includes('noguard'), `noguard in ${file}`).toBe(false);
      expect(/["']hold["']/.test(code), `?intro=hold in ${file}`).toBe(false);
      expect(code.includes('Demo daylight reel'), `demo clip in ${file}`).toBe(false);
    }
  });

  it('initial JS is within the 200 KB gzip budget (P-2)', () => {
    const total = entryFiles.reduce((sum, f) => sum + gzipSync(readFileSync(path.join(outDir, f))).length, 0);
    expect(total).toBeLessThan(200 * 1024);
  });
});
