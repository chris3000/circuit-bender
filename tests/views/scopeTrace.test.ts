/** What the scope draws of a ring buffer, one column of the screen at a time. */
import { describe, it, expect } from 'vitest';
import { formatSweep, traceColumns, SCOPE_SECONDS } from '@/views/Oscilloscope/trace';

const columnsOf = (buffer: Float32Array, written: number, samples: number, columns: number) => {
  const out = new Float32Array(columns * 2);
  traceColumns(buffer, written, samples, columns, out);
  return Array.from({ length: columns }, (_, c) => [out[2 * c], out[2 * c + 1]]);
};

describe('traceColumns', () => {
  it('shows a sample per column when there are no more samples than columns', () => {
    const buffer = Float32Array.from([1, 2, 3, 4, 0, 0, 0, 0]);
    expect(columnsOf(buffer, 4, 4, 4)).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
  });

  it('shows the lowest and highest of the samples that share a column', () => {
    // A fast square wave on a slow sweep: every column holds both levels
    const buffer = Float32Array.from({ length: 1024 }, (_, i) => (i % 4 < 2 ? 0 : 9));
    for (const [low, high] of columnsOf(buffer, 1024, 1024, 16)) {
      expect(low).toBe(0);
      expect(high).toBe(9);
    }
  });

  it('leaves the columns from before anything was recorded empty', () => {
    const buffer = new Float32Array(1000).fill(5, 0, 100);
    const columns = columnsOf(buffer, 100, 400, 4);
    expect(columns.slice(0, 3).flat().every(Number.isNaN)).toBe(true);
    expect(columns[3]).toEqual([5, 5]);
  });

  it('reads round the end of the ring: the newest samples are on the right', () => {
    const buffer = new Float32Array(8);
    let written = 0;
    for (let v = 1; v <= 11; v++) buffer[written++ % 8] = v;
    expect(columnsOf(buffer, written, 4, 4).map(([low]) => low)).toEqual([8, 9, 10, 11]);
    // Asked for more than it holds: what has been overwritten is empty, not wrong
    const all = columnsOf(buffer, written, 11, 11).map(([low]) => low);
    expect(all.slice(0, 3).every(Number.isNaN)).toBe(true);
    expect(all.slice(3)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('formatSweep', () => {
  it('writes a sweep the way the panel does', () => {
    expect(formatSweep(5)).toBe('5ms');
    expect(formatSweep(500)).toBe('500ms');
    expect(formatSweep(1000)).toBe('1s');
  });

  it('the scope keeps enough signal for its slowest sweep', () => {
    expect(SCOPE_SECONDS).toBeGreaterThanOrEqual(10);
  });
});
