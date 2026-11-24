/** The current at which an LED looks fully on. */
export const LED_FULL_AMPS = 0.02;
/** Brightness comes in this many steps, so a steady light is a steady number. */
const STEPS = 20;

/**
 * How bright an LED looks, 0 to 1, for the current through it (in amps).
 * The eye is far more sensitive to a little light than to a lot, so the
 * curve is steep at the bottom: a tenth of a milliamp can already be seen,
 * and from 10 mA to 20 mA is only a small step.
 */
export function ledBrightness(amps: number): number {
  if (!(amps > 0)) return 0;
  const level = Math.min(1, Math.pow(amps / LED_FULL_AMPS, 0.4));
  return Math.round(level * STEPS) / STEPS;
}
