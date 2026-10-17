/** True when decorative motion is welcome: not reduced motion, not Lite mode. */
import { useDeviceTier } from '../../device/DeviceProvider';
import { useReducedMotion } from '../../device/useReducedMotion';

export function useMotionAllowed(): boolean {
  const reduced = useReducedMotion();
  const { lite } = useDeviceTier();
  return !reduced && !lite;
}
