/**
 * The custom cursor's engine (spec 04 CU-2 – CU-7, §3.4).
 *  - the dot follows the pointer exactly; the viewfinder ring (four corner brackets)
 *    follows a critically damped spring, so it can also wrap a link's box ("focus lock")
 *  - one requestAnimationFrame loop that sleeps whenever nothing is moving
 *  - writes transforms only; never re-renders React
 */
import type { Tier } from '../device/tier';

/* ------------------------------------------------------------------ */
/* Pure rules (unit-tested)                                            */
/* ------------------------------------------------------------------ */

/** CU-1: precise hovering pointer, no reduced motion, not Lite, not the low tier. */
export function cursorEnabled(o: {
  finePointer: boolean;
  reducedMotion: boolean;
  lite: boolean;
  tier: Tier;
}): boolean {
  return o.finePointer && !o.reducedMotion && !o.lite && o.tier !== 'low';
}

/**
 * Critically damped spring (as in Unity's SmoothDamp): frame-rate independent, never
 * overshoots. Returns [value, velocity]. `smoothTime` ≈ seconds to (mostly) arrive.
 */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
): [number, number] {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  const v = (velocity - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  // never pass the target
  if (target - current > 0 === out > target) {
    out = target;
    return [out, 0];
  }
  return [out, v];
}

export type CursorKind = 'default' | 'link' | 'view' | 'play' | 'drag' | 'hide';

const EXPLICIT = new Set(['default', 'view', 'play', 'drag', 'hide']);
const DEFAULT_LABEL: Partial<Record<CursorKind, string>> = { view: 'View', play: 'Play', drag: 'Drag' };
const TEXT_FIELD =
  'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable=""], [contenteditable="true"]';
const INTERACTIVE = 'a[href], button, [role="button"], [role="link"], label[for], summary';

export interface CursorTarget {
  kind: CursorKind;
  /** the element to lock onto (link state) */
  el: Element | null;
  label: string;
}

/**
 * What the cursor should do over `el` (CU-3, CU-5):
 *  text field → hide · nearest [data-cursor] → that state · link/button → lock · else default.
 */
export function resolveTarget(el: Element | null): CursorTarget {
  if (!el) return { kind: 'default', el: null, label: '' };
  if (el.closest(TEXT_FIELD)) return { kind: 'hide', el: null, label: '' };
  const explicit = el.closest('[data-cursor]');
  const value = explicit?.getAttribute('data-cursor') ?? '';
  if (explicit && EXPLICIT.has(value)) {
    const kind = value as CursorKind;
    return {
      kind,
      el: explicit,
      label: explicit.getAttribute('data-cursor-label') ?? DEFAULT_LABEL[kind] ?? '',
    };
  }
  const link = el.closest(INTERACTIVE);
  if (link) return { kind: 'link', el: link, label: '' };
  return { kind: 'default', el: null, label: '' };
}

/** Ring sizes in px (CU-2, CU-3). */
export const RING = { size: 36, labelled: 84, pad: 6, press: 0.82, maxLock: { w: 360, h: 160 } } as const;

export interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Where the ring wants to be for the current state. */
export function ringTarget(
  kind: CursorKind,
  pointer: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number } | null,
  pressed: boolean,
): Rect {
  let r: Rect;
  if (kind === 'link' && box && box.width <= RING.maxLock.w && box.height <= RING.maxLock.h) {
    // focus lock: wrap the target, leaning slightly towards the pointer
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    r = {
      cx: cx + (pointer.x - cx) * 0.12,
      cy: cy + (pointer.y - cy) * 0.12,
      w: box.width + RING.pad * 2,
      h: box.height + RING.pad * 2,
    };
  } else if (kind === 'link') {
    r = { cx: pointer.x, cy: pointer.y, w: RING.size * 1.4, h: RING.size * 1.4 };
  } else if (kind === 'view' || kind === 'play' || kind === 'drag') {
    r = { cx: pointer.x, cy: pointer.y, w: RING.labelled, h: RING.labelled };
  } else {
    r = { cx: pointer.x, cy: pointer.y, w: RING.size, h: RING.size };
  }
  if (pressed) r = { ...r, w: r.w * RING.press, h: r.h * RING.press };
  return r;
}

/* ------------------------------------------------------------------ */
/* DOM engine                                                          */
/* ------------------------------------------------------------------ */

export interface CursorParts {
  root: HTMLElement;
  dot: HTMLElement;
  corners: [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
  label: HTMLElement;
}

const CORNER = 10; // px, size of each bracket element
const SMOOTH = { pos: 0.085, size: 0.11 }; // seconds

export function startCursor(parts: CursorParts): () => void {
  const { root, dot, corners, label } = parts;
  const pointer = { x: -100, y: -100 };
  let target: CursorTarget = { kind: 'default', el: null, label: '' };
  let pressed = false;
  let visible = false;
  const ring: Rect = { cx: -100, cy: -100, w: RING.size, h: RING.size };
  const vel = { cx: 0, cy: 0, w: 0, h: 0 };
  let raf = 0;
  let last = 0;
  let frames = 0;

  const setVisible = (v: boolean) => {
    if (visible === v) return;
    visible = v;
    root.dataset.visible = v ? '1' : '0';
  };

  const applyTarget = (t: CursorTarget) => {
    target = t;
    root.dataset.kind = t.kind;
    if (label.textContent !== t.label) label.textContent = t.label;
  };

  const draw = () => {
    const x0 = ring.cx - ring.w / 2;
    const y0 = ring.cy - ring.h / 2;
    const x1 = ring.cx + ring.w / 2 - CORNER;
    const y1 = ring.cy + ring.h / 2 - CORNER;
    corners[0].style.transform = `translate3d(${x0}px, ${y0}px, 0)`;
    corners[1].style.transform = `translate3d(${x1}px, ${y0}px, 0)`;
    corners[2].style.transform = `translate3d(${x1}px, ${y1}px, 0)`;
    corners[3].style.transform = `translate3d(${x0}px, ${y1}px, 0)`;
    label.style.transform = `translate3d(${ring.cx}px, ${ring.cy}px, 0) translate(-50%, -50%)`;
  };

  const frame = (now: number) => {
    raf = 0;
    // the spring is stable at any step, so slow frames simply take bigger steps
    const dt = Math.min(0.25, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    frames++;
    const box = target.kind === 'link' && target.el ? target.el.getBoundingClientRect() : null;
    const goal = ringTarget(target.kind, pointer, box, pressed);
    let moving = false;
    for (const k of ['cx', 'cy', 'w', 'h'] as const) {
      const [v, s] = smoothDamp(
        ring[k],
        goal[k],
        vel[k],
        k === 'w' || k === 'h' ? SMOOTH.size : SMOOTH.pos,
        dt,
      );
      ring[k] = v;
      vel[k] = s;
      if (Math.abs(goal[k] - v) > 0.05 || Math.abs(s) > 0.05) moving = true;
    }
    if (!moving) {
      Object.assign(ring, goal); // settled: snap exactly
      vel.cx = vel.cy = vel.w = vel.h = 0;
    }
    draw();
    root.dataset.frames = String(frames);
    if (moving) raf = requestAnimationFrame(frame);
    else sleep();
  };

  const wake = () => {
    if (raf) return;
    root.dataset.loop = 'running';
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  // AC-4.18: nothing runs per frame while the pointer is still
  const sleep = () => {
    root.dataset.loop = 'idle';
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return setVisible(false); // touch or pen: system behaviour
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
    if (!visible) {
      // first move: start the ring where the pointer is, not flying in from a corner
      if (ring.cx < 0) Object.assign(ring, { cx: pointer.x, cy: pointer.y });
      setVisible(true);
    }
    wake();
  };
  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    applyTarget(resolveTarget(e.target as Element | null));
    wake();
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pressed = true;
    root.dataset.pressed = '1';
    wake();
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pressed = false;
    root.dataset.pressed = '0';
    // a click may change the label (e.g. Play ↔ Pause); read it once React has updated
    setTimeout(() => {
      applyTarget(resolveTarget(document.elementFromPoint(pointer.x, pointer.y)));
      wake();
    }, 0);
    wake();
  };
  const onOut = (e: MouseEvent) => {
    if (!e.relatedTarget) setVisible(false); // left the window
  };
  const onScroll = () => {
    if (target.kind === 'link') wake();
  };
  const onBlur = () => setVisible(false);

  root.dataset.kind = 'default';
  root.dataset.visible = '0';
  root.dataset.loop = 'idle';
  draw();

  const passive = { passive: true } as const;
  window.addEventListener('pointermove', onMove, passive);
  window.addEventListener('pointerover', onOver, passive);
  window.addEventListener('pointerdown', onDown, passive);
  window.addEventListener('pointerup', onUp, passive);
  window.addEventListener('scroll', onScroll, passive);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mouseout', onOut, passive);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerover', onOver);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('mouseout', onOut);
  };
}
