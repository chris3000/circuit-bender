import type { SignalReading } from '@/simulation/measure/signal';

const PREFIXES: Array<[number, string]> = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];

/** A number to three figures with the prefix that suits it: 0.0145 A is "14.5 mA". */
export function formatQuantity(value: number, unit: string, floor = 0): string {
  if (!Number.isFinite(value)) return `? ${unit}`;
  const size = Math.abs(value);
  if (size <= floor || size === 0) return `0 ${unit}`;
  const [scale, prefix] = PREFIXES.find(([s]) => size >= s * 0.9995) ?? PREFIXES[PREFIXES.length - 1];
  return `${Number((value / scale).toPrecision(3)).toPrecision(3)} ${prefix}${unit}`;
}

/** Less than this is nothing, as far as a reading goes: the leak through an open switch, rounding. */
const NO_VOLTS = 5e-4;
const NO_AMPS = 5e-8;

export const formatVolts = (volts: number) => formatQuantity(volts, 'V', NO_VOLTS);
export const formatAmps = (amps: number) => formatQuantity(amps, 'A', NO_AMPS);
export const formatHertz = (hertz: number) => formatQuantity(hertz, 'Hz');

/**
 * A reading as a meter shows it: one number while it holds still, the two it
 * moves between when it does not.
 */
export function formatRange(reading: { mean: number; min: number; max: number }, format: (value: number) => string): string {
  const steady = reading.max - reading.min <= Math.max(0.01 * Math.abs(reading.mean), 1e-9);
  if (steady || format(reading.min) === format(reading.max)) return format(reading.mean);
  return `${format(reading.min)} to ${format(reading.max)}`;
}

/** A probe's reading on one line: "0 V to 9.00 V · 441 Hz". */
export function formatSignal(reading: SignalReading): string {
  const level = formatRange(reading, formatVolts);
  return reading.hertz === null ? level : `${level} · ${formatHertz(reading.hertz)}`;
}
