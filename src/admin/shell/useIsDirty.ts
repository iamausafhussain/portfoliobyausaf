/**
 * Whether the form differs from what was last loaded/saved.
 *
 * React Hook Form's own `isDirty` treats an optional field that registers as `undefined`
 * (e.g. links.live when `links` is {}) as a change, so a freshly opened form looks edited.
 * This compares canonical JSON instead: key order and undefined values don't count.
 */
import { useMemo } from 'react';
import { useWatch, type Control, type FieldValues } from 'react-hook-form';

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return v;
  });
}

export function useIsDirty<T extends FieldValues>(control: Control<T>, baseline: unknown): boolean {
  const values = useWatch({ control });
  const base = useMemo(() => canonical(baseline), [baseline]);
  return useMemo(() => canonical(values) !== base, [values, base]);
}
