import { describe, it, expect } from 'vitest';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';

describe('OpAmpModel', () => {
  it('has 1 internal node and 0 branches', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    expect(m.getInternalNodeCount()).toBe(1);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps input resistance', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    m.init([0, 1, 2, 3, 4], 5, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = new Float64Array(N);
    m.stamp(G, b, x, 1 / 48000);
    const Gin = 1 / 2e6;
    expect(G[0][1]).toBeCloseTo(-Gin, 10);
    expect(G[1][0]).toBeCloseTo(-Gin, 10);
  });

  it('stamps gm VCCS in linear region', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    m.init([0, 1, 2, 3, 4], 5, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = Float64Array.from([0, 0.01, 0, 0, 9, 0]); // small diff
    m.stamp(G, b, x, 1 / 48000);
    const gm = 282.74e-6; // Aol / Rg = 200000 / (1/(2*pi*7.5*30e-12))
    expect(G[5][1]).toBeCloseTo(gm, 7);
    expect(G[5][0]).toBeCloseTo(-gm, 7);
  });

  it('stamps output buffer Norton equivalent', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    m.init([0, 1, 2, 3, 4], 5, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = new Float64Array(N);
    m.stamp(G, b, x, 1 / 48000);
    const Gout = 1 / 75;
    expect(G[3][3]).toBeGreaterThanOrEqual(Gout * 0.99);
    expect(G[3][5]).toBeCloseTo(Gout, 4);
  });

  it('limits VCCS current in slew region', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    m.init([0, 1, 2, 3, 4], 5, 0, {});
    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = Float64Array.from([0, 1.0, 0, 0, 9, 0]); // large diff
    m.stamp(G, b, x, 1 / 48000);
    expect(G[5][1]).toBeCloseTo(0, 8); // no gm
    const Imax = 15e-6;
    expect(b[5]).toBeCloseTo(Imax, 8);
  });
});
