import { describe, it, expect } from 'vitest';
import { BJTModel, BJT_2N3904_PARAMS } from '@/simulation/models/BJTModel';

describe('BJTModel', () => {
  it('has 3 internal nodes and 0 branches', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    expect(m.getInternalNodeCount()).toBe(3);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps parasitic resistances', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = Float64Array.from([0.65, 5.0, 0.0, 0.65, 5.0, 0.0]);
    m.stamp(G, b, x, 1 / 48000);
    // RB = 10 ohm between nodes 0 (B) and 3 (Bp)
    expect(G[0][0]).toBeCloseTo(1 / 10, 4);
    expect(G[0][3]).toBeCloseTo(-1 / 10, 4);
    // RC = 1 ohm between nodes 1 (C) and 4 (Cp)
    expect(G[1][1]).toBeCloseTo(1, 4);
    expect(G[1][4]).toBeCloseTo(-1, 4);
    // RE = 0.1 ohm between nodes 2 (E) and 5 (Ep)
    expect(G[2][2]).toBeCloseTo(10, 4);
    expect(G[2][5]).toBeCloseTo(-10, 4);
  });

  it('stamps BE junction conductance in active region', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    // vbe = 0.65V (forward biased), vbc = -4.35V (reverse biased)
    const x = Float64Array.from([0.65, 5.0, 0.0, 0.65, 5.0, 0.0]);
    m.stamp(G, b, x, 1 / 48000);
    // The BE junction should add conductance between Bp(3) and Ep(5)
    // G[3][3] should have RB parasitic + BE junction Gd (significant for vbe=0.65)
    const gBpDiag = G[3][3] - (1 / 10); // subtract RB parasitic
    expect(gBpDiag).toBeGreaterThan(0.001); // junction Gd should be substantial
    // Companion current should produce non-zero b entries
    const bNonZero = Array.from(b).some(v => Math.abs(v) > 1e-12);
    expect(bNonZero).toBe(true);
  });

  it('reports convergence error', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});
    const xOld = Float64Array.from([0, 0, 0, 0.60, 5.0, 0.0]);
    const xNew = Float64Array.from([0, 0, 0, 0.65, 5.0, 0.0]);
    const err = m.convergenceError(xOld, xNew);
    expect(err).toBeCloseTo(0.05, 4);
  });
});
