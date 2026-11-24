import { describe, it, expect } from 'vitest';
import { formatAmps, formatHertz, formatQuantity, formatRange, formatSignal, formatVolts } from '@/utils/readings';
import { ledBrightness, LED_FULL_AMPS } from '@/utils/ledLight';

describe('readings', () => {
  it('writes a number to three figures with the prefix that suits it', () => {
    expect(formatAmps(0.0145433)).toBe('14.5 mA');
    expect(formatAmps(1.33)).toBe('1.33 A');
    expect(formatAmps(0.000152)).toBe('152 µA');
    expect(formatVolts(9)).toBe('9.00 V');
    expect(formatVolts(2.165)).toBe('2.17 V');
    expect(formatHertz(441.2)).toBe('441 Hz');
    expect(formatHertz(12345)).toBe('12.3 kHz');
    expect(formatQuantity(4.7e6, 'Ω')).toBe('4.70 MΩ');
  });

  it('does not round up into four figures', () => {
    expect(formatAmps(0.9996)).toBe('1.00 A');
    expect(formatAmps(0.00099999)).toBe('1.00 mA');
  });

  it('keeps the sign', () => {
    expect(formatVolts(-4.5)).toBe('-4.50 V');
  });

  it('calls the leak through an open switch, and rounding, nothing', () => {
    expect(formatAmps(9e-9)).toBe('0 A');
    expect(formatVolts(1.4e-4)).toBe('0 V');
    expect(formatVolts(0)).toBe('0 V');
    expect(formatQuantity(NaN, 'V')).toBe('? V');
  });

  it('shows one number while a reading holds still, and two when it moves', () => {
    expect(formatRange({ mean: 2.165, min: 2.164, max: 2.166 }, formatVolts)).toBe('2.17 V');
    expect(formatRange({ mean: 4.5, min: 0, max: 9 }, formatVolts)).toBe('0 V to 9.00 V');
  });

  it('puts a probe on one line', () => {
    expect(formatSignal({ mean: 4.5, min: 0, max: 9, hertz: 441 })).toBe('0 V to 9.00 V · 441 Hz');
    expect(formatSignal({ mean: 9, min: 9, max: 9, hertz: null })).toBe('9.00 V');
  });
});

describe('ledBrightness', () => {
  it('is dark with no current, or with current the wrong way', () => {
    expect(ledBrightness(0)).toBe(0);
    expect(ledBrightness(-0.01)).toBe(0);
    expect(ledBrightness(NaN)).toBe(0);
  });

  it('is full at the current an LED is built for, and no brighter beyond it', () => {
    expect(ledBrightness(LED_FULL_AMPS)).toBe(1);
    expect(ledBrightness(1.33)).toBe(1);
  });

  it('can be seen at a fraction of a milliamp, and each of class 1\'s resistors looks different', () => {
    const at = [0.000152, 0.001493, 0.00212, 0.006912, 0.014544].map(ledBrightness);
    expect(at[0]).toBeGreaterThan(0.1);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
    expect(at.at(-1)).toBeGreaterThanOrEqual(0.85);
  });

  it('comes in steps, so a steady current is a steady light', () => {
    expect(ledBrightness(0.0145)).toBe(ledBrightness(0.01455));
    expect((ledBrightness(0.005) * 20) % 1).toBeCloseTo(0, 9);
  });
});
