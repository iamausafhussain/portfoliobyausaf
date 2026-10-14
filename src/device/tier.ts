/**
 * Device tiers (master spec §9; spec 03 DT-1 – DT-4).
 *   high: full effects · mid: lighter 3D, no bloom · low: no WebGL, 2D only
 * detectTier() is pure so every rule is unit-tested.
 */
export type Tier = 'low' | 'mid' | 'high';
export const tiers: readonly Tier[] = ['low', 'mid', 'high'];

export interface DeviceEnv {
  webgl: boolean;
  saveData: boolean;
  memoryGB?: number;
  cores?: number;
  touch: boolean;
  mobileUA: boolean;
  gpu?: string;
}

export interface TierResult {
  tier: Tier;
  reason: string;
}

/** Known low-end or software GPUs (spec 03 §3.4). */
/** No real GPU: WebGL runs on the CPU, far too slow for the 3D scene. */
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|microsoft basic render/i;

const LOW_END_GPU = [
  /mali-4\d\d|mali-t6\d\d/i,
  /adreno[^0-9]*[345]\d\d\b/i,
  /powervr sgx/i,
  /intel(\(r\))? hd graphics (2000|2500|3000|4000)\b/i,
];

export function detectTier(env: DeviceEnv): TierResult {
  if (!env.webgl) return { tier: 'low', reason: 'no WebGL' };
  if (env.saveData) return { tier: 'low', reason: 'Data Saver is on' };
  if (env.memoryGB !== undefined && env.memoryGB <= 2)
    return { tier: 'low', reason: `${env.memoryGB} GB memory` };
  if (env.cores !== undefined && env.cores <= 2) return { tier: 'low', reason: `${env.cores} CPU cores` };
  if (env.gpu && SOFTWARE_GPU.test(env.gpu)) return { tier: 'low', reason: 'software rendering (no GPU)' };
  if (env.gpu && LOW_END_GPU.some((re) => re.test(env.gpu!)))
    return { tier: 'mid', reason: `low-end GPU (${env.gpu})` };
  if (env.mobileUA || env.touch) return { tier: 'mid', reason: 'phone or tablet' };
  if (env.memoryGB !== undefined && env.memoryGB <= 4)
    return { tier: 'mid', reason: `${env.memoryGB} GB memory` };
  return { tier: 'high', reason: 'capable device' };
}

/** One step down, never below low (DT-2: the probe only ever lowers the tier). */
export const lowerTier = (t: Tier): Tier => (t === 'high' ? 'mid' : 'low');

/** Median frame time above this (ms, ≈45 fps) lowers the tier one step. */
export const SLOW_FRAME_MS = 22;

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** `?tier=low|mid|high` (DT-4). */
export function tierOverride(search: string): Tier | null {
  const v = new URLSearchParams(search).get('tier');
  return v === 'low' || v === 'mid' || v === 'high' ? v : null;
}

/* ------------------------------------------------------------------ */
/* Browser probes                                                      */
/* ------------------------------------------------------------------ */

export function readDeviceEnv(): DeviceEnv {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
    userAgentData?: { mobile?: boolean };
  };
  let webgl = false;
  let gpu: string | undefined;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      webgl = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : undefined;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl = false;
  }
  return {
    webgl,
    gpu,
    saveData: !!nav.connection?.saveData,
    memoryGB: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
    touch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    mobileUA: nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent),
  };
}

/** Measures frame times for ~1 s (DT-2). Resolves with the median in ms. */
export function probeFrameTime(durationMs = 1000): Promise<number> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function' || document.hidden) return resolve(0);
    const times: number[] = [];
    let last = performance.now();
    const start = last;
    const step = (now: number) => {
      times.push(now - last);
      last = now;
      if (now - start < durationMs) requestAnimationFrame(step);
      else resolve(median(times.slice(5))); // skip warm-up frames
    };
    requestAnimationFrame(step);
  });
}
