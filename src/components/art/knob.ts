/**
 * The dial of a potentiometer, wherever one is drawn or turned: the pointer's
 * angle in degrees (0 = pointing right, clockwise positive) at its minimum,
 * and how far it turns to its maximum — from 7:30 round over the top to 4:30,
 * like the knob on any synth.
 */
export const KNOB_MIN_ANGLE = -225;
export const KNOB_SWEEP = 270;

/**
 * The position (0 to 1) a pointer at (dx, dy) from the centre of a dial is
 * pointing at, for a dial drawn turned by `turned` degrees. In the gap at the
 * bottom of the dial it is whichever end is nearer.
 */
export function knobPositionAt(dx: number, dy: number, turned = 0): number {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI) - turned;
  const swept = (((angle - KNOB_MIN_ANGLE) % 360) + 360) % 360;
  if (swept > KNOB_SWEEP) return swept > (KNOB_SWEEP + 360) / 2 ? 0 : 1;
  return swept / KNOB_SWEEP;
}
