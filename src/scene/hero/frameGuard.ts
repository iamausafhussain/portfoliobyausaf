/**
 * PT-6: stop the particle scene when frames are slow "repeatedly": at least `limit` of the
 * last `window` animated frames over `slowMs`. The frames right after a (re)start or a new
 * sample are a one-off upload, so the first `warmUp` don't count.
 */
export interface FrameGuard {
  /** Record one frame's duration; true means "too slow, stop". */
  frame(dtMs: number): boolean;
  /** After sampling or waking up: ignore the next warm-up frames. */
  reset(): void;
}

export function createFrameGuard({ slowMs = 50, window = 30, limit = 20, warmUp = 10 } = {}): FrameGuard {
  const recent: boolean[] = [];
  let warm = warmUp;
  return {
    frame(dt) {
      if (warm > 0) {
        warm--;
        return false;
      }
      recent.push(dt > slowMs);
      if (recent.length > window) recent.shift();
      return recent.filter(Boolean).length >= limit;
    },
    reset() {
      warm = warmUp;
    },
  };
}
