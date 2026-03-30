import { describe, it, expect } from 'vitest';
import { JunctionModel } from '@/simulation/models/JunctionModel';

describe('JunctionModel', () => {
  it('has 0 internal nodes and 0 branches', () => {
    const m = new JunctionModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps nothing', () => {
    const m = new JunctionModel();
    m.init([0], 0, 0, {});
    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    m.stamp(G, b, new Float64Array(1), 1 / 48000);
    expect(G[0][0]).toBe(0);
    expect(b[0]).toBe(0);
  });
});
