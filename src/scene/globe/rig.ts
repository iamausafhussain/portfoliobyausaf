/**
 * How the globe turns (spec 05 GL-7, SY-1, SY-4): towards a focused node, with the
 * visitor's drag (with inertia), or in a slow idle spin. Pure maths, unit-tested.
 * Angles in radians: x = tilt, y = spin (Euler XYZ on the globe).
 */
import { facingRotation, shortestAngle, type LatLng } from './geo';

/** One turn a minute. */
export const IDLE_SPIN = (Math.PI * 2) / 60;
/** After a drag, wait this long (s) before easing back to the focused node. */
export const DRAG_HOLD = 3;
const DRAG_PER_PX = 0.0055;
const MAX_TILT = 1.05;
const SMOOTH = 0.55; // s, time to (mostly) arrive at a new focus

/** Critically damped spring step (same as the cursor's); returns [value, velocity]. */
function damp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
): [number, number] {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  return [target + (change + temp) * exp, (velocity - omega * temp) * exp];
}

export class GlobeRig {
  x = 0.25;
  y = 0;
  private vx = 0;
  private vy = 0;
  private target: { x: number; y: number } | null = null;
  private dragging = false;
  private sinceDrag = Infinity;
  /** Spin speed (rad/s) while coasting after a drag. */
  private coastX = 0;
  private coastY = 0;

  constructor(start?: LatLng) {
    if (start) {
      const r = facingRotation(start);
      this.x = r.x;
      this.y = r.y;
    }
  }

  focus(p: LatLng | null) {
    this.target = p ? facingRotation(p) : null;
  }

  /** Pointer moved by (dx, dy) px while dragging; dt in s since the last move. */
  drag(dx: number, dy: number, dt = 1 / 60) {
    this.dragging = true;
    this.sinceDrag = 0;
    const ry = dx * DRAG_PER_PX;
    const rx = dy * DRAG_PER_PX;
    this.y += ry;
    this.x = Math.max(-MAX_TILT, Math.min(MAX_TILT, this.x + rx));
    // remember the speed for coasting, smoothed so one jittery move doesn't fling it
    const k = Math.min(1, dt * 20);
    this.coastY += (ry / Math.max(dt, 1 / 120) - this.coastY) * k;
    this.coastX += (rx / Math.max(dt, 1 / 120) - this.coastX) * k;
    this.vx = this.vy = 0;
  }

  release() {
    this.dragging = false;
    this.sinceDrag = 0;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** Advance by dt seconds; returns true while the globe is still turning. */
  update(dt: number, { spin = true } = {}): boolean {
    if (this.dragging) return true;
    this.sinceDrag += dt;

    // coasting after a drag: inertia that dies away
    if (Math.abs(this.coastX) > 1e-4 || Math.abs(this.coastY) > 1e-4) {
      this.y += this.coastY * dt;
      this.x = Math.max(-MAX_TILT, Math.min(MAX_TILT, this.x + this.coastX * dt));
      const decay = Math.exp(-dt * 3.2);
      this.coastX *= decay;
      this.coastY *= decay;
      if (Math.abs(this.coastY) < 0.002 && Math.abs(this.coastX) < 0.002) this.coastX = this.coastY = 0;
      return true;
    }
    if (this.sinceDrag < DRAG_HOLD) return true; // hold where the visitor left it, then ease back

    if (this.target) {
      const ty = shortestAngle(this.y, this.target.y);
      [this.x, this.vx] = damp(this.x, this.target.x, this.vx, SMOOTH, dt);
      [this.y, this.vy] = damp(this.y, ty, this.vy, SMOOTH, dt);
      const moving =
        Math.abs(this.x - this.target.x) > 1e-4 ||
        Math.abs(this.y - ty) > 1e-4 ||
        Math.abs(this.vx) > 1e-4 ||
        Math.abs(this.vy) > 1e-4;
      return moving;
    }
    if (!spin) return false;
    // idle: a slow spin, and the tilt eases back to a pleasant default
    this.y += IDLE_SPIN * dt;
    [this.x, this.vx] = damp(this.x, 0.3, this.vx, 1.2, dt);
    return true;
  }
}
