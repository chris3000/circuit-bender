import { describe, it, expect } from 'vitest';
import { parseTypedValue, standardValues, valueParameters, sameValue } from '@/utils/partValue';

describe('parseTypedValue', () => {
  it.each([
    ['47k', 47e3], ['47K', 47e3], ['4.7k', 4700], ['4k7', 4700], ['1M', 1e6], ['2M2', 2.2e6],
    ['330', 330], ['100R', 100], ['4R7', 4.7], ['10kΩ', 10e3], ['10 kΩ', 10e3], ['220ohm', 220], ['1.5 ohms', 1.5],
  ])('reads %s as a resistance', (text, ohms) => {
    expect(parseTypedValue(text, 'resistance')).toBeCloseTo(ohms, 9);
  });

  it.each([
    ['100n', 100e-9], ['100nF', 100e-9], ['2n2', 2.2e-9], ['47p', 47e-12], ['10u', 10e-6], ['10µF', 10e-6],
    ['4u7', 4.7e-6], ['0.1u', 100e-9], ['100N', 100e-9],
  ])('reads %s as a capacitance', (text, farads) => {
    const value = parseTypedValue(text, 'capacitance')!;
    expect(sameValue(value, farads)).toBe(true);
  });

  it('does not take one kind of value for the other', () => {
    expect(parseTypedValue('100n', 'resistance')).toBeNull();
    expect(parseTypedValue('47k', 'capacitance')).toBeNull();
    expect(parseTypedValue('33', 'capacitance')).toBeNull(); // a bare number is ohms, never farads
  });

  it.each(['', 'k', 'abc', '4.7k7', '1m', '-5k', '1e3', 'cd40106', '2n3904', '1n914'])('does not read "%s" as a resistance', (text) => {
    expect(parseTypedValue(text, 'resistance')).toBeNull();
  });

  it('does not take part numbers for capacitances', () => {
    // "2n3904" has the shape of a value written the 2n2 way; "1n914" likewise
    expect(parseTypedValue('2n3904', 'capacitance')).toBeNull();
    expect(parseTypedValue('1n914', 'capacitance')).toBeNull();
    expect(parseTypedValue('cd40106', 'capacitance')).toBeNull();
    expect(parseTypedValue('lm741', 'capacitance')).toBeNull();
  });

  it('refuses values no part comes in', () => {
    expect(parseTypedValue('0', 'resistance')).toBeNull();
    expect(parseTypedValue('500M', 'resistance')).toBeNull();
    expect(parseTypedValue('0.1p', 'capacitance')).toBeNull();
  });
});

describe('standardValues', () => {
  it('lists the E12 series across decades, without floating-point dust', () => {
    const values = standardValues(10, 8.2e6);
    expect(values).toHaveLength(72);
    expect(values.slice(0, 13)).toEqual([10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82, 100]);
    expect(values).toContain(4700);
    expect(values[values.length - 1]).toBe(8.2e6);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('lists the E6 series for small values too', () => {
    const values = standardValues(10e-12, 680e-6, 'E6');
    expect(values).toHaveLength(48);
    expect(values.some((v) => sameValue(v, 100e-9))).toBe(true);
    expect(values.some((v) => sameValue(v, 4.7e-6))).toBe(true);
  });
});

describe('valueParameters', () => {
  it('gives the number and how it is written on the canvas', () => {
    expect(valueParameters({ parameter: 'resistance', kind: 'resistance', label: '', example: '' }, 4700))
      .toEqual({ resistance: 4700, value: '4.7kΩ' });
    expect(valueParameters({ parameter: 'capacitance', kind: 'capacitance', label: '', example: '' }, 100e-9))
      .toEqual({ capacitance: 100e-9, value: '100nF' });
  });
});
