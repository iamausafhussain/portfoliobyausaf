/**
 * Device tier + Lite mode (spec 03 DT-1 – DT-5).
 * Sets <html data-tier> so CSS can adapt, and exposes useDeviceTier() for the 3D scene.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LITE_STORAGE_KEY } from '../theme/themeScript';
import {
  detectTier,
  lowerTier,
  probeFrameTime,
  readDeviceEnv,
  SLOW_FRAME_MS,
  tierOverride,
  type Tier,
} from './tier';

interface DeviceApi {
  /** Effective tier: 'low' whenever Lite mode is on. */
  tier: Tier;
  /** What the device itself supports, before Lite mode. */
  detected: Tier;
  reason: string;
  lite: boolean;
  setLite(on: boolean): void;
}

const DeviceContext = createContext<DeviceApi | null>(null);

function readLite(): boolean {
  try {
    return localStorage.getItem(LITE_STORAGE_KEY) === '1';
  } catch {
    return document.documentElement.getAttribute('data-tier') === 'low';
  }
}

function initial(): { tier: Tier; reason: string; forced: boolean } {
  const forced = tierOverride(location.search);
  if (forced) return { tier: forced, reason: `?tier=${forced}`, forced: true };
  const { tier, reason } = detectTier(readDeviceEnv());
  return { tier, reason, forced: false };
}

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial);
  const [lite, setLiteState] = useState(readLite);

  // Frame-time probe: only ever lowers the tier (DT-2)
  useEffect(() => {
    if (state.forced || state.tier === 'low') return;
    let cancelled = false;
    const run = () =>
      probeFrameTime().then((ms) => {
        if (!cancelled && ms > SLOW_FRAME_MS) {
          setState((s) => ({
            ...s,
            tier: lowerTier(s.tier),
            reason: `${s.reason}; slow frames (${ms.toFixed(0)} ms)`,
          }));
        }
      });
    const id = setTimeout(run, 1500); // after the first paint settles
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // probe once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tier: Tier = lite ? 'low' : state.tier;

  useEffect(() => {
    document.documentElement.setAttribute('data-tier', tier);
  }, [tier]);

  const setLite = useCallback((on: boolean) => {
    try {
      if (on) localStorage.setItem(LITE_STORAGE_KEY, '1');
      else localStorage.removeItem(LITE_STORAGE_KEY);
    } catch {
      /* remembered for this visit only */
    }
    setLiteState(on);
  }, []);

  const value = useMemo(
    () => ({ tier, detected: state.tier, reason: lite ? 'Lite mode' : state.reason, lite, setLite }),
    [tier, state, lite, setLite],
  );
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDeviceTier(): DeviceApi {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDeviceTier must be used inside DeviceProvider');
  return ctx;
}
