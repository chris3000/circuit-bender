import { describe, it, expect } from 'vitest';
import { LoadWatch, HIGH_LOAD, OVER_LOAD, type LoadReport } from '@/audio/loadStatus';
import { RenderLoad } from '@/simulation/worklet/RenderLoad';

const fine: LoadReport = { load: 0.2, dropout: 0 };
const feed = (watch: LoadWatch, ...reports: LoadReport[]) => reports.map((r) => watch.add(r)).at(-1)!;

describe('how hard the simulation is working', () => {
  it('is fine with time to spare', () => {
    expect(new LoadWatch().add(fine)).toEqual({ load: 0.2, level: 'ok', cause: null });
  });

  it('is high when there is little to spare', () => {
    expect(new LoadWatch().add({ load: HIGH_LOAD, dropout: 0 }).level).toBe('high');
    expect(new LoadWatch().add({ load: HIGH_LOAD - 0.01, dropout: 0 }).level).toBe('ok');
  });

  it('is over at once when the simulation takes all the time there is', () => {
    expect(new LoadWatch().add({ load: OVER_LOAD, dropout: 0 })).toEqual({ load: OVER_LOAD, level: 'over', cause: 'circuit' });
    expect(new LoadWatch().add({ load: 1.6, dropout: 0.2 }).level).toBe('over');
  });

  it('does not call one dropout the sound breaking up', () => {
    const status = new LoadWatch().add({ load: 0.2, dropout: 0.01 });
    expect(status.level).toBe('high');
    expect(status.cause).toBeNull();
  });

  it('does call it that when dropouts keep coming, and blames the computer if the circuit is light', () => {
    const watch = new LoadWatch();
    expect(feed(watch, { load: 0.2, dropout: 0.01 }, fine, { load: 0.2, dropout: 0.02 })).toEqual({ load: 0.2, level: 'over', cause: 'computer' });
  });

  it('blames the circuit when it was heavy while the sound broke up', () => {
    const watch = new LoadWatch();
    expect(feed(watch, { load: 0.8, dropout: 0.01 }, { load: 0.6, dropout: 0.01 }).cause).toBe('circuit');
  });

  it('stays over until the trouble is three seconds gone, so it does not flicker', () => {
    const watch = new LoadWatch();
    feed(watch, { load: 1.2, dropout: 0.1 }, { load: 1.2, dropout: 0.1 });
    // Reports come twice a second: four clean ones still have both bad ones in view
    for (let i = 0; i < 4; i++) expect(watch.add(fine).level).toBe('over');
    expect(watch.add(fine).level).toBe('high'); // one left in view
    expect(watch.add(fine).level).toBe('ok');
  });

  it('forgets everything when playing starts again', () => {
    const watch = new LoadWatch();
    feed(watch, { load: 1.2, dropout: 0.1 }, { load: 1.2, dropout: 0.1 });
    watch.reset();
    expect(watch.add(fine).level).toBe('ok');
  });
});

describe('measuring the load in the worklet', () => {
  const BLOCK = (128 / 48000) * 1000; // how long a block of sound lasts, in ms

  /**
   * Runs blocks of 128 samples that each take `blockMs` to compute, on a clock
   * that only reads whole milliseconds. `jitter` is how far (ms) a block may
   * start late, as blocks on a real machine do.
   */
  function measure(blockMs: number, seconds: number, { period = 0.5, jitter = 0.3 } = {}): number[] {
    let seed = 12345;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let time = 0;
    const load = new RenderLoad(48000, period, () => Math.floor(time));
    const readings: number[] = [];
    let due = 0.37; // not on a millisecond boundary
    while (due < seconds * 1000) {
      time = Math.max(time, due + random() * jitter);
      load.begin();
      time += blockMs;
      const reading = load.end(128);
      if (reading !== null) readings.push(reading);
      due += BLOCK;
    }
    return readings;
  }

  it('reports once per period of sound', () => {
    expect(measure(0.5, 2.9)).toHaveLength(5); // 188 blocks to each half second
    expect(measure(0.5, 3.5, { period: 1 })).toHaveLength(3);
  });

  it.each([0.08, 0.45, 1.2, 2.4])('reads a block that takes %d ms to within a few points, though the clock only counts milliseconds', (blockMs) => {
    for (const reading of measure(blockMs, 4)) expect(Math.abs(reading - blockMs / BLOCK)).toBeLessThan(0.04);
  });

  it.each([0.08, 0.45, 1.2, 2.4])('is never more than an eighth out for %d ms blocks, even when they keep perfect step with the clock', (blockMs) => {
    for (const reading of measure(blockMs, 4, { jitter: 0 })) expect(Math.abs(reading - blockMs / BLOCK)).toBeLessThanOrEqual(0.13);
  });

  it('reads over 1 when the sound takes longer to compute than to play', () => {
    for (const reading of measure(4, 4)) expect(reading).toBeCloseTo(1.5, 1);
  });

  it('starts afresh after a reset', () => {
    let time = 0;
    const load = new RenderLoad(1000, 0.5, () => time);
    load.begin(); time += 400; expect(load.end(400)).toBeNull();
    load.reset();
    load.begin(); time += 50; expect(load.end(400)).toBeNull();
    load.begin(); time += 50; expect(load.end(100)).toBeCloseTo(0.2, 6);
  });
});
