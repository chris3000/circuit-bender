// tests/simulation/models/ResistorModel.test.ts
import { describe, it, expect } from 'vitest';
import { ResistorModel } from '@/simulation/models/ResistorModel';

describe('ResistorModel', () => {
  it('has no internal nodes or branches', () => {
    const m = new ResistorModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps correct conductance between two nodes', () => {
    const m = new ResistorModel();
    m.init([0, 1], 0, 0, { resistance: 1000 });
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    const x = new Float64Array(2);
    m.stamp(G, b, x, 1 / 48000);
    const g = 1 / 1000;
    expect(G[0][0]).toBeCloseTo(g, 10);
    expect(G[1][1]).toBeCloseTo(g, 10);
    expect(G[0][1]).toBeCloseTo(-g, 10);
    expect(G[1][0]).toBeCloseTo(-g, 10);
  });

  it('stamps correctly when one pin is ground (-1)', () => {
    const m = new ResistorModel();
    m.init([0, -1], 0, 0, { resistance: 500 });
    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    const x = new Float64Array(1);
    m.stamp(G, b, x, 1 / 48000);
    expect(G[0][0]).toBeCloseTo(1 / 500, 10);
  });

  it('convergenceError returns 0 (linear)', () => {
    const m = new ResistorModel();
    m.init([0, 1], 0, 0, { resistance: 1000 });
    expect(m.convergenceError(new Float64Array(2), new Float64Array(2))).toBe(0);
  });
});
