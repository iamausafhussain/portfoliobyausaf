/**
 * Hand-off between the hero particles and the globe (spec 05 GL-6): the globe publishes how
 * far it has formed, and the hero layer fades its cloud out by that much.
 */

/* ------------------------------------------------------------------ */
/* Formation progress (spec 05 GL-6)                                   */
/* ------------------------------------------------------------------ */

let formation = 0;

/** How far the globe has formed out of the cloud, 0–1 (written by the globe, read by the hero layer). */
export const getFormation = () => formation;
export function setFormation(f: number) {
  formation = Math.min(1, Math.max(0, f));
}
