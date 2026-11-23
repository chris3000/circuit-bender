import type { ComponentParameters, ComponentValue } from '@/types/circuit';
import { formatValue } from './parameterParser';

/** The parameters that give a part the value `value`: the number, and how it is written on the canvas. */
export function valueParameters(spec: ComponentValue, value: number): ComponentParameters {
  return { [spec.parameter]: value, value: formatValue(value, spec.kind) };
}

/** Rounds away the noise of working a value out in floating point (4.7 × 1e-9). */
export function tidy(value: number): number {
  return Number(value.toPrecision(6));
}

export function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b));
}

const MULTIPLIER: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, r: 1, k: 1e3, M: 1e6 };
const LIMITS: Record<ComponentValue['kind'], [number, number]> = {
  resistance: [0.1, 100e6],
  capacitance: [1e-12, 0.1],
};

/**
 * A value as people write them, read as a value of the given kind: "47k",
 * "4k7", "100R", "330" for a resistance; "100n", "2n2", "10uF", "10µ" for a
 * capacitance. Null when the text is not such a value. Stricter than
 * `parseValue`: a bare "33" is ohms but never farads, and the digits after
 * the letter are one or two, so the part numbers 2N3904 and 1N914 are not
 * capacitances.
 */
export function parseTypedValue(text: string, kind: ComponentValue['kind']): number | null {
  const t = text.trim().replace(/[µμ]/g, 'u').replace(/\s+/g, '');
  const pattern = kind === 'resistance'
    ? /^(\d*\.?\d+)(?:([kKRrM])(\d{1,2})?)?(?:Ω|ohms?)?$/i
    : /^(\d*\.?\d+)([pnuPNU])(\d{1,2})?[fF]?$/;
  const match = pattern.exec(t);
  if (!match) return null;
  const [, whole, letter, fraction] = match;
  // In "1m" the m is milli, which is no resistor anyone stocks; only "M" is mega
  if (kind === 'resistance' && letter === 'm') return null;
  if (fraction !== undefined && whole.includes('.')) return null; // "4.7k7"
  const number = Number(fraction !== undefined ? `${whole}.${fraction}` : whole);
  const scale = letter === undefined ? 1 : MULTIPLIER[letter === 'M' ? 'M' : letter.toLowerCase()];
  const value = tidy(number * scale);
  const [min, max] = LIMITS[kind];
  return value >= min && value <= max ? value : null;
}

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];

/** The standard values (the E12 series, or the coarser E6) from `min` to `max` inclusive. */
export function standardValues(min: number, max: number, series: 'E12' | 'E6' = 'E12'): number[] {
  const steps = series === 'E12' ? E12 : E6;
  const values: number[] = [];
  for (let decade = Math.floor(Math.log10(min)) - 1; ; decade++) {
    for (const step of steps) {
      const value = tidy(step * 10 ** decade);
      if (value > max * (1 + 1e-9)) return values;
      if (value >= min * (1 - 1e-9)) values.push(value);
    }
  }
}
