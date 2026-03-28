import { describe, it, expect } from 'vitest';
import { parseValue, formatValue } from '@/utils/parameterParser';

describe('parseValue', () => {
  it('should parse plain numbers', () => {
    expect(parseValue('1000')).toBe(1000);
    expect(parseValue('47')).toBe(47);
    expect(parseValue('0')).toBe(0);
    expect(parseValue('3.3')).toBe(3.3);
  });

  it('should parse k/K suffix (kilo)', () => {
    expect(parseValue('10k')).toBe(10000);
    expect(parseValue('4.7k')).toBe(4700);
    expect(parseValue('1K')).toBe(1000);
    expect(parseValue('2.2K')).toBe(2200);
  });

  it('should parse M suffix (mega)', () => {
    expect(parseValue('1M')).toBe(1000000);
    expect(parseValue('4.7M')).toBe(4700000);
    expect(parseValue('2.2M')).toBe(2200000);
  });

  it('should parse n suffix (nano)', () => {
    expect(parseValue('100n')).toBeCloseTo(0.0000001, 12);
    expect(parseValue('47n')).toBeCloseTo(0.000000047, 15);
    expect(parseValue('1n')).toBeCloseTo(0.000000001, 15);
  });

  it('should parse u suffix (micro)', () => {
    expect(parseValue('1u')).toBeCloseTo(0.000001, 12);
    expect(parseValue('10u')).toBeCloseTo(0.00001, 12);
    expect(parseValue('4.7u')).toBeCloseTo(0.0000047, 12);
  });

  it('should parse p suffix (pico)', () => {
    expect(parseValue('100p')).toBe(0.0000000001);
    expect(parseValue('47p')).toBeCloseTo(0.000000000047, 18);
    expect(parseValue('1p')).toBe(0.000000000001);
  });

  it('should parse m suffix (milli)', () => {
    expect(parseValue('100m')).toBe(0.1);
    expect(parseValue('1m')).toBe(0.001);
    expect(parseValue('4.7m')).toBeCloseTo(0.0047, 10);
  });

  it('should return NaN for invalid input', () => {
    expect(parseValue('')).toBeNaN();
    expect(parseValue('abc')).toBeNaN();
    expect(parseValue('k')).toBeNaN();
    expect(parseValue('10x')).toBeNaN();
  });
});

describe('formatValue', () => {
  describe('resistance formatting', () => {
    it('should format values in ohms', () => {
      expect(formatValue(47, 'resistance')).toBe('47');
      expect(formatValue(100, 'resistance')).toBe('100');
    });

    it('should format kilo-ohm values', () => {
      expect(formatValue(1000, 'resistance')).toBe('1k');
      expect(formatValue(4700, 'resistance')).toBe('4.7k');
      expect(formatValue(10000, 'resistance')).toBe('10k');
    });

    it('should format mega-ohm values', () => {
      expect(formatValue(1000000, 'resistance')).toBe('1M');
      expect(formatValue(4700000, 'resistance')).toBe('4.7M');
    });
  });

  describe('capacitance formatting', () => {
    it('should format nano-farad values', () => {
      expect(formatValue(0.0000001, 'capacitance')).toBe('100n');
      expect(formatValue(0.000000047, 'capacitance')).toBe('47n');
    });

    it('should format micro-farad values', () => {
      expect(formatValue(0.000001, 'capacitance')).toBe('1u');
      expect(formatValue(0.00001, 'capacitance')).toBe('10u');
    });

    it('should format pico-farad values', () => {
      expect(formatValue(0.0000000001, 'capacitance')).toBe('100p');
      expect(formatValue(0.000000000047, 'capacitance')).toBe('47p');
    });
  });
});
