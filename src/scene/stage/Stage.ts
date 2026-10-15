/**
 * The shared 3D stage (spec 05 ST-1 – ST-5): one WebGL canvas fixed behind the home page,
 * one renderer and one frame loop. Chapters add layers (the hero particles, the globe…);
 * each frame the visible layers draw in order. The loop sleeps when nothing is moving and
 * wakes on scroll, resize, theme changes or when a layer asks.
 */
import { WebGLRenderer } from 'three';
import type { ThemeName } from '../../theme/tokens';
import { duration } from '../../theme/tokens';
import { createFrameGuard } from './frameGuard';
import styles from './stage.module.css';

export interface FrameInfo {
  /** performance.now() of this frame */
  now: number;
  /** ms since the previous drawn frame (16 after waking) */
  dt: number;
  /** seconds since the stage started */
  time: number;
  /** theme look, tweened: 1 = dark (glow), 0 = light (ink) */
  glow: number;
  /** css px */
  width: number;
  height: number;
  pixelRatio: number;
  scrollY: number;
}

export interface StageLayer {
  /**
   * Update and draw into the shared renderer (which doesn't auto-clear). Return true
   * while the layer is animating and needs another frame.
   */
  frame(renderer: WebGLRenderer, info: FrameInfo): boolean;
  resize?(width: number, height: number): void;
  dispose(): void;
}

/**
 * Development only: `?noguard` keeps the stage running on slow software renderers, so the
 * automated browser tests can check it. Never part of a production build.
 */
const guardOff = import.meta.env.DEV && new URLSearchParams(location.search).has('noguard');

export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly pixelRatio: number;
  private layers: StageLayer[] = [];
  private raf = 0;
  private last = 0;
  private readonly t0 = performance.now();
  private glow: number;
  private glowTarget: number;
  private guard = createFrameGuard();
  private failed = false;
  private failListeners = new Set<(reason: string) => void>();
  private cleanup: (() => void)[] = [];
  private frames = 0;

  constructor({ pixelRatio, theme }: { pixelRatio: number; theme: ThemeName }) {
    this.pixelRatio = pixelRatio;
    this.glow = this.glowTarget = theme === 'dark' ? 1 : 0;
    // a fresh canvas each time: a canvas whose WebGL context was released can't be reused
    const canvas = document.createElement('canvas');
    canvas.className = styles.canvas!;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.stage = '';
    document.body.appendChild(canvas);
    this.canvas = canvas;
    try {
      this.renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      canvas.remove();
      throw e;
    }
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.resize();

    const on = <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, fn, { passive: true });
      this.cleanup.push(() => window.removeEventListener(t, fn));
    };
    on('scroll', () => this.wake());
    on('resize', () => {
      this.resize();
      this.wake();
    });
    const onVisibility = () => {
      if (document.hidden) this.sleep();
      else this.wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));
    const onLost = (e: Event) => {
      e.preventDefault();
      this.fail('WebGL context lost');
    };
    canvas.addEventListener('webglcontextlost', onLost);
    this.cleanup.push(() => canvas.removeEventListener('webglcontextlost', onLost));
  }

  /** Adds a layer; returns a function that removes (and disposes) it. */
  add(layer: StageLayer): () => void {
    this.layers.push(layer);
    layer.resize?.(innerWidth, innerHeight);
    this.wake();
    return () => {
      this.layers = this.layers.filter((l) => l !== layer);
      layer.dispose();
      this.wake();
    };
  }

  /** Ask for a frame (layers call this when something they show has changed). */
  wake = () => {
    if (this.raf || this.failed || document.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
  };

  setTheme(theme: ThemeName) {
    this.glowTarget = theme === 'dark' ? 1 : 0;
    this.wake();
  }

  /** After a one-off heavy step (e.g. uploading a new picture), don't count the next frames as slow. */
  resetGuard() {
    this.guard.reset();
  }

  onFail(fn: (reason: string) => void): () => void {
    this.failListeners.add(fn);
    return () => this.failListeners.delete(fn);
  }

  /** Stops the stage for good (ST-4): the page falls back to its non-3D version. */
  fail(reason: string) {
    if (this.failed) return;
    this.failed = true;
    this.canvas.dataset.stopped = reason;
    if (import.meta.env.DEV) console.warn(`[3D stage] stopped: ${reason}`);
    this.sleep();
    this.failListeners.forEach((fn) => fn(reason));
  }

  dispose() {
    this.sleep();
    this.cleanup.forEach((fn) => fn());
    for (const l of this.layers) l.dispose();
    this.layers = [];
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    for (const l of this.layers) l.resize?.(innerWidth, innerHeight);
  }

  private sleep() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.failed) return;
    const dt = this.last ? now - this.last : 16;
    if (this.last && this.guard.frame(dt) && !guardOff) return this.fail('frames stayed over 50 ms');

    // theme look: tween towards the target over duration.slow (TH-4)
    const step = Math.min(1, dt / duration.slow);
    const g = this.glowTarget;
    this.glow = g > this.glow ? Math.min(g, this.glow + step) : Math.max(g, this.glow - step);

    const info: FrameInfo = {
      now,
      dt,
      time: (now - this.t0) / 1000,
      glow: this.glow,
      width: innerWidth,
      height: innerHeight,
      pixelRatio: this.pixelRatio,
      scrollY,
    };
    this.renderer.clear();
    let animating = this.glow !== g;
    for (const l of this.layers) animating = l.frame(this.renderer, info) || animating;
    this.canvas.dataset.glow = this.glow.toFixed(2);
    this.canvas.dataset.frames = String(++this.frames); // lets tests see when it sleeps (AC-5.2)

    if (animating) {
      this.last = now;
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.last = 0; // asleep until something wakes it
      this.guard.reset();
    }
  };
}
