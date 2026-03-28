const SUFFIX_MULTIPLIERS: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
};

const VALID_SUFFIXES = /^[pnumkKM]$/;

/**
 * Parse a value string with engineering notation suffixes into a number.
 * Examples: "10k" → 10000, "100n" → 1e-7, "4.7M" → 4700000
 * Returns NaN for invalid input.
 */
export function parseValue(input: string): number {
  if (!input || input.trim().length === 0) return NaN;

  const trimmed = input.trim();
  const lastChar = trimmed[trimmed.length - 1];

  if (VALID_SUFFIXES.test(lastChar)) {
    const numPart = trimmed.slice(0, -1);
    const num = Number(numPart);
    if (numPart.length === 0 || isNaN(num)) return NaN;
    return num * SUFFIX_MULTIPLIERS[lastChar];
  }

  const num = Number(trimmed);
  return isNaN(num) ? NaN : num;
}

interface ScaleEntry {
  threshold: number;
  divisor: number;
  suffix: string;
}

const RESISTANCE_SCALES: ScaleEntry[] = [
  { threshold: 1e6, divisor: 1e6, suffix: 'M' },
  { threshold: 1e3, divisor: 1e3, suffix: 'k' },
];

const CAPACITANCE_SCALES: ScaleEntry[] = [
  { threshold: 1e-6, divisor: 1e-6, suffix: 'u' },
  { threshold: 1e-9, divisor: 1e-9, suffix: 'n' },
  { threshold: 1e-12, divisor: 1e-12, suffix: 'p' },
];

function formatWithScales(value: number, scales: ScaleEntry[]): string {
  for (const { threshold, divisor, suffix } of scales) {
    if (value >= threshold) {
      const scaled = value / divisor;
      // Remove trailing zeros after decimal point
      const formatted = Number.isInteger(scaled) ? String(scaled) : String(parseFloat(scaled.toPrecision(12)));
      return formatted + suffix;
    }
  }
  const formatted = Number.isInteger(value) ? String(value) : String(parseFloat(value.toPrecision(12)));
  return formatted;
}

/**
 * Format a numeric value for display with appropriate engineering suffix.
 * Resistance: 1000 → "1k", 4700 → "4.7k", 1000000 → "1M"
 * Capacitance: 0.0000001 → "100n", 0.000001 → "1u"
 */
export function formatValue(value: number, type: 'resistance' | 'capacitance'): string {
  if (type === 'resistance') {
    return formatWithScales(value, RESISTANCE_SCALES);
  }
  return formatWithScales(value, CAPACITANCE_SCALES);
}
