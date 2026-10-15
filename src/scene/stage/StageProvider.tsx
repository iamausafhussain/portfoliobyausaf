/**
 * Provides the shared 3D stage to the home page (spec 05 ST-1). The stage and Three.js are
 * a lazy chunk, loaded after the first paint and only where 3D belongs: not on the low
 * tier, in Lite mode, with Data Saver or with reduced motion (those get still images).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useDeviceTier } from '../../device/DeviceProvider';
import { useReducedMotion } from '../../device/useReducedMotion';
import { useAfterFirstPaint } from '../../motion/useAfterFirstPaint';
import { useTheme } from '../../theme/ThemeProvider';
import type { Stage } from './Stage';

export type StageStatus = 'off' | 'loading' | 'ready' | 'failed';

interface StageApi {
  stage: Stage | null;
  status: StageStatus;
  /**
   * This device will get 3D (it may still be loading). Known from the first render, so
   * chapters can lay out once for the 3D version instead of jumping when it arrives.
   */
  capable: boolean;
}

const StageContext = createContext<StageApi>({ stage: null, status: 'off', capable: false });

export function useStage(): StageApi {
  return useContext(StageContext);
}

const saveData = () =>
  !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

export function StageProvider({ children }: { children: ReactNode }) {
  const { tier, lite } = useDeviceTier();
  const reducedMotion = useReducedMotion();
  const { theme } = useTheme();
  const afterPaint = useAfterFirstPaint();
  const capableDevice = tier !== 'low' && !lite && !reducedMotion && !saveData();
  const wanted = afterPaint && capableDevice;
  const [state, setState] = useState<{ stage: Stage | null; status: StageStatus }>({
    stage: null,
    status: 'off',
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!wanted || failed) return;
    let stage: Stage | null = null;
    let cancelled = false;
    let offFail = () => {};
    import('./Stage')
      .then(({ Stage }) => {
        if (cancelled) return;
        stage = new Stage({
          pixelRatio: Math.min(devicePixelRatio || 1, tier === 'high' ? 2 : 1.5),
          theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
        });
        offFail = stage.onFail(() => setFailed(true));
        setState({ stage, status: 'ready' });
      })
      .catch((e: unknown) => {
        // no WebGL, or the chunk didn't download: the page simply stays without 3D (ST-4)
        if (import.meta.env.DEV) console.warn('[3D stage] not started:', e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      offFail();
      stage?.dispose();
      setState({ stage: null, status: 'off' });
    };
  }, [wanted, failed, tier]);

  useEffect(() => {
    state.stage?.setTheme(theme);
  }, [state.stage, theme]);

  const capable = capableDevice && !failed;
  const value: StageApi = failed
    ? { stage: null, status: 'failed', capable }
    : state.stage && wanted
      ? { stage: state.stage, status: 'ready', capable }
      : { stage: null, status: capable ? 'loading' : 'off', capable };
  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}
