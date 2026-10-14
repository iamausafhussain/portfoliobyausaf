/**
 * For Parts 4–7: attach GSAP scroll animations safely (spec 03 SC-2).
 * The setup runs once GSAP has loaded, inside a gsap.context() so everything it creates
 * is reverted on unmount. With reduced motion or Lite mode it doesn't run at all, unless
 * `alwaysRun` is set (for animations that already respect reduced motion themselves).
 */
import { useEffect, type DependencyList, type RefObject } from 'react';
import { useMotion } from './MotionProvider';

type Libs = typeof import('./libs');

export function useScrollTrigger(
  scope: RefObject<Element | null>,
  setup: (libs: Libs, scope: Element) => void | (() => void),
  deps: DependencyList = [],
  options: { alwaysRun?: boolean } = {},
) {
  const { libs, motionOn } = useMotion();
  const enabled = !!libs && (motionOn || !!options.alwaysRun);

  useEffect(() => {
    const el = scope.current;
    if (!enabled || !libs || !el) return;
    let cleanup: void | (() => void);
    const ctx = libs.gsap.context(() => {
      cleanup = setup(libs, el);
    }, el);
    return () => {
      if (typeof cleanup === 'function') cleanup();
      ctx.revert();
    };
    // the caller controls re-runs through `deps`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, libs, ...deps]);
}
