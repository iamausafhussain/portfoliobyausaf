/**
 * Smooth scroll + scroll-driven animation (spec 03 SC-1 – SC-5).
 *
 * - GSAP/ScrollTrigger/Lenis load after the first paint.
 * - Lenis runs on mouse/trackpad and touch (SC-1, Q4), off with reduced motion and in
 *   Lite mode; GSAP's ticker drives Lenis so both share one frame loop (SC-2).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type Lenis from 'lenis';
import { useDeviceTier } from '../device/DeviceProvider';
import { useReducedMotion } from '../device/useReducedMotion';

type Libs = typeof import('./libs');

export interface MotionApi {
  /** GSAP + ScrollTrigger once loaded; null before that. */
  libs: Libs | null;
  lenis: Lenis | null;
  /** False with reduced motion or in Lite mode: animate nothing that moves for long. */
  motionOn: boolean;
}

const MotionContext = createContext<MotionApi>({ libs: null, lenis: null, motionOn: false });

let libsPromise: Promise<Libs> | null = null;
export const loadMotionLibs = () => (libsPromise ??= import('./libs'));

/** The live Lenis instance (a tiny external store), for scrollTo() outside React. */
let currentLenis: Lenis | null = null;
const lenisListeners = new Set<() => void>();
function setCurrentLenis(l: Lenis | null) {
  currentLenis = l;
  lenisListeners.forEach((fn) => fn());
}
const subscribeLenis = (fn: () => void) => {
  lenisListeners.add(fn);
  return () => lenisListeners.delete(fn);
};
export const getLenis = () => currentLenis;

const whenIdle = (cb: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 1500 });
  else setTimeout(cb, 200);
};

export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const { lite } = useDeviceTier();
  const [libs, setLibs] = useState<Libs | null>(null);
  const lenis = useSyncExternalStore(subscribeLenis, getLenis, () => null);
  const motionOn = !reduced && !lite;

  useEffect(() => {
    let active = true;
    whenIdle(() => {
      void loadMotionLibs().then((l) => active && setLibs(l));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!libs || !motionOn) return;
    const { gsap, ScrollTrigger, Lenis: LenisClass } = libs;
    const instance = new LenisClass({
      autoRaf: false,
      lerp: 0.1,
      smoothWheel: true,
      // smooth on touch too (decision Q4), with gentle inertia so it doesn't feel laggy
      syncTouch: true,
      syncTouchLerp: 0.085,
      touchInertiaExponent: 1.6,
      // let scrollable widgets (menus, code blocks) scroll themselves
      prevent: (node) => node.closest('[data-lenis-prevent]') !== null,
    });
    const onScroll = () => ScrollTrigger.update();
    instance.on('scroll', onScroll);
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add('lenis-on');
    setCurrentLenis(instance);
    return () => {
      gsap.ticker.remove(tick);
      instance.off('scroll', onScroll);
      instance.destroy();
      document.documentElement.classList.remove('lenis-on');
      if (currentLenis === instance) setCurrentLenis(null);
    };
  }, [libs, motionOn]);

  const value = useMemo(() => ({ libs, lenis, motionOn }), [libs, lenis, motionOn]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export const useMotion = () => useContext(MotionContext);
