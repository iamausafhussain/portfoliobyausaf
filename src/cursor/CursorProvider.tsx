/**
 * Turns the custom cursor on where it belongs (spec 04 CU-1): a precise pointer that can
 * hover, no reduced motion, not Lite mode, not the low tier. Public pages only (CU-6, Q5):
 * the admin never mounts this provider.
 */
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDeviceTier } from '../device/DeviceProvider';
import { useReducedMotion } from '../device/useReducedMotion';
import { Cursor } from './Cursor';
import { cursorEnabled } from './cursorEngine';

const FINE = '(hover: hover) and (pointer: fine)';
const subscribe = (cb: () => void) => {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(FINE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const getFine = () => typeof matchMedia === 'function' && matchMedia(FINE).matches;

const CursorContext = createContext(false);

/** True while the custom cursor is showing (magnetic buttons use it). */
export function useCustomCursor(): boolean {
  return useContext(CursorContext);
}

const CURSOR_CLASS = 'custom-cursor';

export function CursorProvider({ children }: { children: ReactNode }) {
  const finePointer = useSyncExternalStore(subscribe, getFine, () => false);
  const reducedMotion = useReducedMotion();
  const { tier, lite } = useDeviceTier();
  const enabled = cursorEnabled({ finePointer, reducedMotion, lite, tier });

  // hide the system cursor only while ours is on; it comes back automatically otherwise
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add(CURSOR_CLASS);
    return () => document.documentElement.classList.remove(CURSOR_CLASS);
  }, [enabled]);

  return (
    <CursorContext.Provider value={enabled}>
      {children}
      {enabled && createPortal(<Cursor />, document.body)}
    </CursorContext.Provider>
  );
}
