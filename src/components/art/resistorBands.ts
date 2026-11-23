/** The resistor colour code: what is painted on a resistor to say its value. */

/** Band colours for the digits 0 to 9. */
export const DIGIT_COLORS = [
  '#1E1E1E', // 0 black
  '#7B4A1E', // 1 brown
  '#D62828', // 2 red
  '#F28C1B', // 3 orange
  '#F5D21F', // 4 yellow
  '#2E9E48', // 5 green
  '#2563C9', // 6 blue
  '#8E44C9', // 7 violet
  '#8C8C8C', // 8 grey
  '#F7F7F7', // 9 white
] as const;
export const GOLD = '#C9A227';
export const SILVER = '#BDBDBD';

/**
 * The four bands of a resistor of the given value: two digits, a multiplier
 * (gold and silver for tenths and hundredths) and a 5% tolerance band. The
 * value is rounded to the two digits the code can say.
 */
export function resistorBands(ohms: number): [string, string, string, string] {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return [DIGIT_COLORS[0], DIGIT_COLORS[0], DIGIT_COLORS[0], GOLD];
  let exponent = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exponent);
  if (digits >= 100) { digits = 10; exponent += 1; } // 99.6 rounds up to 100
  if (digits < 10) { digits *= 10; exponent -= 1; }
  // Out of the code's range: say the nearest value it has
  if (exponent < -2) { digits = 10; exponent = -2; }
  if (exponent > 9) { digits = 99; exponent = 9; }
  const multiplier = exponent === -1 ? GOLD : exponent === -2 ? SILVER : DIGIT_COLORS[exponent];
  return [DIGIT_COLORS[Math.floor(digits / 10)], DIGIT_COLORS[digits % 10], multiplier, GOLD];
}
