import { describe, it, expect } from 'vitest';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';

describe('OpAmpModel', () => {
  it('has 0 internal nodes and 0 branches', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps VCCS from input to output', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    m.init([0, 1, 2, 3, 4], 0, 0, {});
    const N = 5;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = Float64Array.from([0, 0, 0, 0, 9]);
    m.stamp(G, b, x, 1 / 48000);

    const Gm = 1000 / 75; // Av / Rout
    // OUT(3) should have VCCS from IN+(1) and IN-(0)
    expect(G[3][1]).toBeCloseTo(Gm, 2);  // G[OUT][IN+] = +Gm
    expect(G[3][0]).toBeCloseTo(-Gm, 2); // G[OUT][IN-] = -Gm
    // Self-conductance
    expect(G[3][3]).toBeGreaterThanOrEqual(1 / 75 * 0.99);
  });
});
