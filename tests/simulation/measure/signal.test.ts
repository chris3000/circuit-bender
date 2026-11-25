/**
 * Reading a signal as a meter does: its level, its swing and how often it
 * repeats, from a whole trace (measureSignal) or as it arrives (SignalMeter).
 */
import { describe, it, expect } from 'vitest';
import { dutyCycle, harmonics, measureBursts, measureSignal, SignalMeter } from '@/simulation/measure/signal';

const RATE = 48000;
const square = (hertz: number, seconds: number, low = 0, high = 9) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => (((i * hertz) / RATE) % 1 < 0.5 ? high : low));
const sine = (hertz: number, seconds: number, size = 1, level = 0) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => level + size * Math.sin((2 * Math.PI * hertz * i) / RATE));

describe('measureSignal', () => {
  it('reads a steady level as a level, with no frequency', () => {
    const reading = measureSignal(new Float32Array(1000).fill(4.5), RATE);
    expect(reading).toEqual({ mean: 4.5, min: 4.5, max: 4.5, hertz: null });
  });

  it('reads nothing from nothing', () => {
    expect(measureSignal([], RATE)).toEqual({ mean: 0, min: 0, max: 0, hertz: null });
  });

  it('reads the level, swing and frequency of a square wave', () => {
    const reading = measureSignal(square(440, 0.1), RATE);
    expect(reading.min).toBe(0);
    expect(reading.max).toBe(9);
    expect(reading.mean).toBeCloseTo(4.5, 1);
    expect(reading.hertz).toBeCloseTo(440, 0);
  });

  it('places a crossing between samples: a sine is read to a fraction of a hertz', () => {
    expect(measureSignal(sine(1234.5, 0.2, 2, 3), RATE).hertz).toBeCloseTo(1234.5, 1);
  });

  it('does not count ripple smaller than a real cycle', () => {
    // A slow wave with a small fast one riding on it
    const slow = sine(100, 0.2, 4), fast = sine(3000, 0.2, 0.3);
    const both = slow.map((v, i) => v + fast[i]);
    expect(measureSignal(both, RATE).hertz).toBeCloseTo(100, 0);
  });

  it('gives no frequency to a swing too small to be a wave, or to a single edge', () => {
    expect(measureSignal(sine(440, 0.1, 0.005), RATE).hertz).toBeNull();
    const step = new Float32Array(1000).fill(0).fill(9, 500);
    expect(measureSignal(step, RATE).hertz).toBeNull();
  });
});

describe('SignalMeter', () => {
  /** Feed a signal in, reading eight times a second as the worklet does; the readings. */
  function meter(samples: ArrayLike<number>) {
    const m = new SignalMeter(RATE);
    const readings = [];
    for (let i = 0; i < samples.length; i++) {
      m.add(samples[i]);
      if ((i + 1) % (RATE / 8) === 0) readings.push(m.read());
    }
    return { m, readings };
  }

  it('reads a steady level', () => {
    const { readings } = meter(new Float32Array(RATE).fill(2.2));
    expect(readings.at(-1)!.mean).toBeCloseTo(2.2, 6);
    expect(readings.at(-1)!.hertz).toBeNull();
  });

  it('reads an audio tone within a quarter of a second', () => {
    const { readings } = meter(square(441, 0.5));
    expect(readings[0].hertz).toBeNull(); // it has not yet seen how far the signal swings
    expect(readings[1].hertz).toBeCloseTo(441, 0);
    expect(readings.at(-1)).toMatchObject({ min: 0, max: 9 });
  });

  it('holds the rate of a blink slower than its own readings', () => {
    const { readings } = meter(square(2, 4));
    for (const reading of readings.slice(-8)) expect(reading.hertz).toBeCloseTo(2, 2);
  });

  it('shows the whole swing of a slow blink, not the half it happens to be in', () => {
    const { readings } = meter(square(2, 4));
    for (const reading of readings.slice(-8)) expect(reading).toMatchObject({ min: 0, max: 9 });
  });

  it('lets go of the frequency when the signal stops', () => {
    const tone = square(200, 1), silence = new Float32Array(RATE * 3).fill(9);
    const all = new Float32Array(tone.length + silence.length);
    all.set(tone);
    all.set(silence, tone.length);
    const { readings } = meter(all);
    expect(readings[6].hertz).toBeCloseTo(200, 0);
    expect(readings.at(-1)!.hertz).toBeNull();
    expect(readings.at(-1)).toMatchObject({ min: 9, max: 9 });
  });

  it('read with nothing new repeats the last level rather than making one up', () => {
    const m = new SignalMeter(RATE);
    m.add(3);
    m.read();
    expect(m.read()).toMatchObject({ mean: 3, min: 3, max: 3 });
  });
});

describe('harmonics', () => {
  it('finds only the odd ones in a square wave, at 0.64, 0.21 and 0.13 of a swing of 1', () => {
    const sizes = harmonics(square(440, 0.5, -0.5, 0.5), RATE, 440, 5);
    expect(sizes[0]).toBeCloseTo(0.637, 2);
    expect(sizes[2]).toBeCloseTo(0.212, 2);
    expect(sizes[4]).toBeCloseTo(0.127, 2);
    expect(sizes[1]).toBeLessThan(0.01);
    expect(sizes[3]).toBeLessThan(0.01);
  });

  it('finds one in a pure tone, whatever level it stands on', () => {
    const sizes = harmonics(sine(330, 0.5, 2, 4.5), RATE, 330, 4);
    expect(sizes[0]).toBeCloseTo(2, 2);
    for (const size of sizes.slice(1)) expect(size).toBeLessThan(0.01);
  });

  it('reads nothing from a trace shorter than one cycle', () => {
    expect(harmonics(sine(10, 0.05), RATE, 10, 3)).toEqual([0, 0, 0]);
    expect(harmonics(sine(440, 0.5), RATE, 0, 2)).toEqual([0, 0]);
  });
});

describe('dutyCycle', () => {
  it('is a half for a square wave and the part of the time a pulse is up', () => {
    expect(dutyCycle(square(100, 0.5))).toBeCloseTo(0.5, 2);
    const pulse = Float32Array.from({ length: RATE / 2 }, (_, i) => (((i * 100) / RATE) % 1 < 0.1 ? 9 : 0));
    expect(dutyCycle(pulse)).toBeCloseTo(0.1, 2);
  });

  it('has nothing to say about a steady level', () => {
    expect(dutyCycle(new Float32Array(100).fill(4.5))).toBeNull();
  });
});

describe('measureBursts', () => {
  /** A square tone switched on for `on` of each cycle of `rate` a second. */
  const beeps = (tone: number, rate: number, on: number, seconds: number) =>
    Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) =>
      (((i * rate) / RATE) % 1 < on && ((i * tone) / RATE) % 1 < 0.5 ? 9 : 0));

  it('reads how often a tone comes, its pitch, and how much of the time it sounds', () => {
    const reading = measureBursts(beeps(1000, 2, 0.5, 3), RATE)!;
    expect(reading.perSecond).toBeCloseTo(2, 1);
    expect(reading.hertz).toBeCloseTo(1000, -1);
    expect(reading.on).toBeCloseTo(0.5, 1);
  });

  it('reads short beeps as short', () => {
    const reading = measureBursts(beeps(800, 4, 0.25, 2), RATE)!;
    expect(reading.perSecond).toBeCloseTo(4, 1);
    expect(reading.on).toBeCloseTo(0.25, 1);
  });

  it('is null for a steady tone, for silence, and for less than two whole bursts', () => {
    expect(measureBursts(square(440, 1), RATE)).toBeNull();
    expect(measureBursts(new Float32Array(RATE), RATE)).toBeNull();
    expect(measureBursts(beeps(1000, 2, 0.5, 0.6), RATE)).toBeNull();
  });
});
