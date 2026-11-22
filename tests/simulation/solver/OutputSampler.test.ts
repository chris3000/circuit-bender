import { describe, it, expect } from 'vitest';
import { OutputSampler } from '@/simulation/solver/OutputSampler';

const noTaps = new Float64Array(0);

/** Feed segments until `count` audio samples have been produced. */
function collect(s: OutputSampler, count: number, next: () => { du: number; a0: number; a1: number }): number[] {
  const out: number[] = [];
  while (out.length < count) {
    const seg = next();
    s.addSegment(seg.du, seg.a0, seg.a1, noTaps, noTaps);
    if (s.pending() > 0) out.push(s.take());
  }
  return out;
}

/** A rectangular pulse of height 1 from `start` to `start + width` (oversampled periods), fed in uneven pieces. */
function renderPulse(os: number, start: number, width: number, samples: number): number[] {
  const s = new OutputSampler(os);
  let t = 0;
  const edges = [start, start + width];
  return collect(s, samples, () => {
    // Step sizes that never line up with the sample grid
    let du = 0.61;
    const level = t >= edges[0] && t < edges[1] ? 1 : 0;
    for (const e of edges) if (t < e && t + du > e) du = e - t;
    t += du;
    return { du, a0: level, a1: level };
  });
}

describe('OutputSampler', () => {
  it('passes DC at unity gain for every oversampling factor', () => {
    for (const os of [1, 2, 4, 8]) {
      const s = new OutputSampler(os);
      const out = collect(s, 200, () => ({ du: 1, a0: 2.5, a1: 2.5 }));
      expect(out[out.length - 1]).toBeCloseTo(2.5, 6);
    }
  });

  it('gives the same result however the signal is cut into segments', () => {
    const whole = new OutputSampler(4);
    const pieces = new OutputSampler(4);
    const a = collect(whole, 100, () => ({ du: 1, a0: 1, a1: 1 }));
    const b = collect(pieces, 100, () => ({ du: 0.37, a0: 1, a1: 1 }));
    // Same signal, so the same samples (the piecewise run finishes each sample slightly late)
    for (let i = 0; i < 100; i++) expect(b[i]).toBeCloseTo(a[i], 9);
  });

  it('preserves the area of a pulse that starts and ends between samples', () => {
    const os = 4;
    const out = renderPulse(os, 40.37, 2.3, 80);
    const area = out.reduce((p, q) => p + q, 0) * os;
    expect(area).toBeCloseTo(2.3, 2);
  });

  it('places an edge with sub-sample resolution instead of snapping it to the grid', () => {
    const os = 4;
    const centroid = (out: number[]) =>
      out.reduce((p, q, i) => p + q * i, 0) / out.reduce((p, q) => p + q, 0);
    const a = centroid(renderPulse(os, 40.0, 6, 80));
    const b = centroid(renderPulse(os, 40.25, 6, 80));
    // A quarter of an oversampled period = 1/16 of an audio sample
    expect(b - a).toBeCloseTo(0.25 / os, 3);
  });

  it('delays tap signals to line up with the filtered audio', () => {
    const s = new OutputSampler(4);
    s.setTapCount(1);
    const tap0 = new Float64Array(1), tap1 = new Float64Array(1);
    const seen: number[] = [];
    let n = 0;
    while (seen.length < 40) {
      // Tap jumps from 0 to 1 at audio sample 8
      const v = n >= 8 * 4 ? 1 : 0;
      tap0[0] = v; tap1[0] = v;
      s.addSegment(1, 0, 0, tap0, tap1);
      n++;
      if (s.pending() > 0) { s.take(); seen.push(s.tapValue(0)); }
    }
    // The step shows up one FIR group delay (16 audio samples) after it happened
    const firstHigh = seen.findIndex(v => v > 0.5);
    expect(firstHigh).toBe(8 + 16);
  });
});
