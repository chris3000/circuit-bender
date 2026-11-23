import { describe, it, expect } from 'vitest';
import { resistorBands, DIGIT_COLORS, GOLD, SILVER } from '@/components/art/resistorBands';
import { capacitorCode } from '@/components/art/partArt';

const [black, brown, red, orange, yellow, green, blue, violet, grey, white] = DIGIT_COLORS;

describe('resistorBands', () => {
  it.each([
    [10, [brown, black, black]],
    [100, [brown, black, brown]],
    [220, [red, red, brown]],
    [1000, [brown, black, red]],
    [4700, [yellow, violet, red]],
    [10e3, [brown, black, orange]],
    [47e3, [yellow, violet, orange]],
    [560e3, [green, blue, yellow]],
    [1e6, [brown, black, green]],
    [6.8e6, [blue, grey, green]],
    [10e6, [brown, black, blue]],
    [91e6, [white, brown, blue]],
  ])('%d Ω', (ohms, bands) => {
    expect(resistorBands(ohms)).toEqual([...bands, GOLD]);
  });

  it('uses gold and silver multipliers below 10 Ω', () => {
    expect(resistorBands(4.7).slice(0, 3)).toEqual([yellow, violet, GOLD]);
    expect(resistorBands(1).slice(0, 3)).toEqual([brown, black, GOLD]);
    expect(resistorBands(0.47).slice(0, 3)).toEqual([yellow, violet, SILVER]);
  });

  it('rounds to the two digits the code can say', () => {
    expect(resistorBands(4740).slice(0, 3)).toEqual([yellow, violet, red]);
    expect(resistorBands(996).slice(0, 3)).toEqual([brown, black, red]); // rounds up to 1 kΩ
    expect(resistorBands(12345).slice(0, 3)).toEqual([brown, red, orange]);
  });

  it('has an answer for values that are not resistances', () => {
    for (const bad of [0, -5, NaN, Infinity]) expect(resistorBands(bad)).toEqual([black, black, black, GOLD]);
  });
});

describe('capacitorCode', () => {
  it.each([
    [100e-9, '104'], [10e-9, '103'], [4.7e-9, '472'], [1e-9, '102'], [470e-12, '471'],
    [100e-12, '101'], [47e-12, '47'], [10e-12, '10'], [2.2e-12, '2.2'], [220e-9, '224'], [1e-6, '105'],
  ])('%f F is marked %s', (farads, code) => {
    expect(capacitorCode(farads)).toBe(code);
  });
});
