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
    m.stampMatrix(G, 1 / 48000, false);
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

  it('stamps the transconductance: collector current responds to the base voltage', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    // vbe = 0.65V (forward biased), vbc = -4.35V (reverse biased)
    const x = Float64Array.from([0.65, 5.0, 0.0, 0.65, 5.0, 0.0]);
    m.stampNonlinear(G, b, x, 1 / 48000);
    const op = m.evaluate(0.65, -4.35);
    // gm ≈ Ic / Vt in the active region
    expect(op.dIc_dVbe).toBeGreaterThan(0.9 * op.Ic / 0.02585);
    expect(op.dIc_dVbe).toBeLessThan(1.1 * op.Ic / 0.02585);
    // Collector row (4): +gm on the base column (3), −gm on the emitter column (5)
    expect(G[4][3]).toBeCloseTo(op.dIc_dVbe + op.dIc_dVbc, 9);
    expect(G[4][5]).toBeCloseTo(-op.dIc_dVbe, 9);
    // Base row sees only the (β times smaller) base conductance
    expect(G[3][3]).toBeCloseTo(op.dIb_dVbe + op.dIb_dVbc, 12);
    // Every column sums to zero: the device neither creates nor absorbs current
    for (const col of [3, 4, 5]) expect(G[3][col] + G[4][col] + G[5][col]).toBeCloseTo(0, 12);
    expect(b[3] + b[4] + b[5]).toBeCloseTo(0, 12);
  });

  it('confines its nonlinear stamps to the intrinsic nodes it declares', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});
    expect(m.getNonlinearNodes()).toEqual([3, 4, 5]);
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    m.stampNonlinear(G, b, Float64Array.from([0.65, 5.0, 0.0, 0.65, 5.0, 0.0]), 1 / 48000);
    for (let i = 0; i < 3; i++) {
      expect(b[i]).toBe(0);
      for (let j = 0; j < N; j++) {
        expect(G[i][j]).toBe(0);
        expect(G[j][i]).toBe(0);
      }
    }
  });

  it('reports convergence error as the distance from its linearization point', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = Float64Array.from([0, 0, 0, 0.60, 5.0, 0.0]);
    m.stampNonlinear(G, b, x, 1 / 48000);            // linearized at vbe = 0.60
    const xNew = Float64Array.from([0, 0, 0, 0.65, 5.0, 0.0]);
    expect(m.convergenceError(x, xNew)).toBeCloseTo(0.05, 6);
    expect(m.convergenceError(x, x)).toBeCloseTo(0, 9);
  });

  it('limits a large forward jump, and reports that it has not converged', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    // Newton asks for vbe = 3 V from rest: must be pulled back to a sane value
    const x = Float64Array.from([0, 0, 0, 3.0, 5.0, 0.0]);
    m.stampNonlinear(G, b, x, 1 / 48000);
    expect(Number.isFinite(G[4][3])).toBe(true);
    expect(G[4][3]).toBeLessThan(1e3);
    expect(m.convergenceError(x, x)).toBeGreaterThan(1);
  });
});
