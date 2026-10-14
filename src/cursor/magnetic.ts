/**
 * Magnetic buttons (spec 04 CU-4): while the custom cursor hovers a primary control, the
 * control leans towards it (at most 6 px) and springs back when it leaves. Uses the CSS
 * `translate` property, so the element's own transforms are left alone.
 */
import { useEffect, type RefObject } from 'react';
import { useCustomCursor } from './CursorProvider';
import { smoothDamp } from './cursorEngine';

export const MAGNET_MAX = 6;
const PULL = 0.25;

/** Offset for a pointer at (dx, dy) from the element's centre, clamped to `max` px. */
export function magnetOffset(dx: number, dy: number, max = MAGNET_MAX): [number, number] {
  const x = dx * PULL;
  const y = dy * PULL;
  const len = Math.hypot(x, y);
  if (len <= max) return [x, y];
  return [(x / len) * max, (y / len) * max];
}

export function useMagnetic(ref: RefObject<HTMLElement | null>) {
  const enabled = useCustomCursor();

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let goal: [number, number] = [0, 0];
    const pos: [number, number] = [0, 0];
    const vel: [number, number] = [0, 0];
    let raf = 0;
    let last = 0;

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.25, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      let moving = false;
      for (const i of [0, 1] as const) {
        const [v, s] = smoothDamp(pos[i], goal[i], vel[i], 0.12, dt);
        pos[i] = v;
        vel[i] = s;
        if (Math.abs(goal[i] - v) > 0.02 || Math.abs(s) > 0.02) moving = true;
      }
      if (!moving) {
        // settled: snap exactly, and leave no inline style behind at rest
        pos[0] = goal[0];
        pos[1] = goal[1];
        vel[0] = vel[1] = 0;
        last = 0;
      }
      el.style.translate = pos[0] || pos[1] ? `${pos[0].toFixed(2)}px ${pos[1].toFixed(2)}px` : '';
      if (moving) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      // measured without our own offset, so the pull doesn't feed back on itself
      goal = magnetOffset(
        e.clientX - (r.left - pos[0] + r.width / 2),
        e.clientY - (r.top - pos[1] + r.height / 2),
      );
      wake();
    };
    const onLeave = () => {
      goal = [0, 0];
      wake();
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.style.translate = '';
    };
  }, [enabled, ref]);
}
