/**
 * Reading a signal as a meter does: its level, its swing and how often it
 * repeats, from a whole trace (measureSignal) or as it arrives (SignalMeter).
 */
import { describe, it, expect } from 'vitest';
import { measureSignal, SignalMeter } from '@/simulation/measure/signal';

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
