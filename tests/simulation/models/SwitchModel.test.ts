import { describe, it, expect } from 'vitest';
import { SwitchModel } from '@/simulation/models/SwitchModel';

describe('SwitchModel', () => {
  it('has 0 internal nodes and 0 branches', () => {
    const m = new SwitchModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps high conductance when closed', () => {
    const m = new SwitchModel();
    m.init([0, 1], 0, 0, { closed: 1 });
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    m.stamp(G, b, new Float64Array(2), 1 / 48000);
    expect(G[0][0]).toBeCloseTo(100, 0);
    expect(G[0][1]).toBeCloseTo(-100, 0);
  });

  it('stamps near-zero conductance when open', () => {
    const m = new SwitchModel();
    m.init([0, 1], 0, 0, { closed: 0 });
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    m.stamp(G, b, new Float64Array(2), 1 / 48000);
    expect(G[0][0]).toBeCloseTo(1e-9, 12);
  });

  it('defaults to open', () => {
    const m = new SwitchModel();
    m.init([0, 1], 0, 0, {});
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    m.stamp(G, b, new Float64Array(2), 1 / 48000);
    expect(G[0][0]).toBeCloseTo(1e-9, 12);
  });

  it('convergenceError returns 0', () => {
    const m = new SwitchModel();
    m.init([0, 1], 0, 0, {});
    expect(m.convergenceError(new Float64Array(2), new Float64Array(2))).toBe(0);
  });
});
