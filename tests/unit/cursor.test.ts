/** Spec 04 task 4.10: cursor enable rules, states, spring maths, magnetic pull. */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cursorEnabled, resolveTarget, ringTarget, RING, smoothDamp } from '../../src/cursor/cursorEngine';
import { MAGNET_MAX, magnetOffset } from '../../src/cursor/magnetic';

describe('CU-1 enable rules', () => {
  const ok = { finePointer: true, reducedMotion: false, lite: false, tier: 'high' } as const;
  it('on with a precise hovering pointer on mid/high tiers', () => {
    expect(cursorEnabled(ok)).toBe(true);
    expect(cursorEnabled({ ...ok, tier: 'mid' })).toBe(true);
  });
  it('off on touch, with reduced motion, in Lite mode and on the low tier', () => {
    expect(cursorEnabled({ ...ok, finePointer: false })).toBe(false);
    expect(cursorEnabled({ ...ok, reducedMotion: true })).toBe(false);
    expect(cursorEnabled({ ...ok, lite: true })).toBe(false);
    expect(cursorEnabled({ ...ok, tier: 'low' })).toBe(false);
  });
});

describe('CU-3 / CU-5 states', () => {
  document.body.innerHTML = `
    <a id="link" href="/x"><span id="inLink">Go</span></a>
    <button id="btn">Press</button>
    <input id="field" /><textarea id="area"></textarea>
    <input id="check" type="checkbox" />
    <div data-cursor="view" id="card"><a href="/p" id="cardLink">Project</a></div>
    <div data-cursor="play" data-cursor-label="Pause" id="video"></div>
    <div data-cursor="nonsense" id="bad"><button id="badBtn">b</button></div>
    <p id="text">Just text</p>`;
  const $ = (id: string) => document.getElementById(id);

  it('links and buttons lock on', () => {
    expect(resolveTarget($('inLink'))).toMatchObject({ kind: 'link', el: $('link') });
    expect(resolveTarget($('btn')).kind).toBe('link');
    expect(resolveTarget($('check')).kind).toBe('default'); // not a text field: the ring stays
  });
  it('text fields hide the custom cursor', () => {
    expect(resolveTarget($('field')).kind).toBe('hide');
    expect(resolveTarget($('area')).kind).toBe('hide');
  });
  it('data-cursor wins over the link inside it, with default or custom labels', () => {
    expect(resolveTarget($('cardLink'))).toMatchObject({ kind: 'view', label: 'View' });
    expect(resolveTarget($('video'))).toMatchObject({ kind: 'play', label: 'Pause' });
  });
  it('unknown data-cursor values are ignored', () => {
    expect(resolveTarget($('badBtn')).kind).toBe('link');
  });
  it('plain text and nothing at all give the default ring', () => {
    expect(resolveTarget($('text')).kind).toBe('default');
    expect(resolveTarget(null).kind).toBe('default');
  });
});

describe('ring geometry', () => {
  const pointer = { x: 100, y: 100 };
  it('default is the small viewfinder at the pointer', () => {
    expect(ringTarget('default', pointer, null, false)).toEqual({
      cx: 100,
      cy: 100,
      w: RING.size,
      h: RING.size,
    });
  });
  it('locks around a link with padding', () => {
    const r = ringTarget('link', pointer, { left: 80, top: 90, width: 40, height: 20 }, false);
    expect(r.w).toBe(40 + RING.pad * 2);
    expect(r.h).toBe(20 + RING.pad * 2);
    expect(r.cx).toBeCloseTo(100);
  });
  it("doesn't wrap huge targets (a whole card link)", () => {
    const r = ringTarget('link', pointer, { left: 0, top: 0, width: 800, height: 500 }, false);
    expect(r.w).toBeLessThan(100);
  });
  it('grows for labelled states and shrinks when pressed (shutter)', () => {
    expect(ringTarget('view', pointer, null, false).w).toBe(RING.labelled);
    expect(ringTarget('default', pointer, null, true).w).toBeCloseTo(RING.size * RING.press);
  });
});

describe('spring', () => {
  const run = (fps: number, seconds: number) => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < fps * seconds; i++) [x, v] = smoothDamp(x, 100, v, 0.085, 1 / fps);
    return x;
  };
  it('arrives, never overshoots, and is frame-rate independent', () => {
    let x = 0;
    let v = 0;
    let max = 0;
    for (let i = 0; i < 120; i++) {
      [x, v] = smoothDamp(x, 100, v, 0.085, 1 / 60);
      max = Math.max(max, x);
    }
    expect(x).toBeCloseTo(100, 3);
    expect(max).toBeLessThanOrEqual(100);
    expect(Math.abs(run(30, 0.15) - run(144, 0.15))).toBeLessThan(3);
  });
});

describe('CU-4 magnetic pull', () => {
  it('leans towards the pointer, at most 6 px', () => {
    expect(magnetOffset(8, 0)).toEqual([2, 0]);
    const [x, y] = magnetOffset(300, 400);
    expect(Math.hypot(x, y)).toBeCloseTo(MAGNET_MAX);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
  });
});
