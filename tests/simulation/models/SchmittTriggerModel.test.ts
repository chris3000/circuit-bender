import { describe, it, expect } from 'vitest';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';

describe('SchmittTriggerModel', () => {
  it('has 0 internal nodes and 0 branches', () => {
    const m = new SchmittTriggerModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps output conductance to Vdd when output is high', () => {
    const m = new SchmittTriggerModel();
    const pins = new Array(14).fill(-1);
    pins[0] = 0; pins[6] = 1; pins[12] = 2; pins[13] = -1;
    m.init(pins, 0, 0, {});
    const N = 3;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = Float64Array.from([0, 0, 9]);
    m.stamp(G, b, x, 1 / 48000);
    const Gon = 1 / 280;
    expect(G[1][1]).toBeCloseTo(Gon, 4);
    expect(G[1][2]).toBeCloseTo(-Gon, 4);
    expect(G[2][1]).toBeCloseTo(-Gon, 4);
  });

  it('flips output at correct thresholds', () => {
    const m = new SchmittTriggerModel();
    const pins = new Array(14).fill(-1);
    pins[0] = 0; pins[6] = 1; pins[12] = 2; pins[13] = -1;
    m.init(pins, 0, 0, {});
    const dt = 1 / 48000;

    // Drive input above VT+ = 0.58*9 = 5.22V
    const x1 = Float64Array.from([5.5, 0, 9]);
    m.postStep(x1, dt);

    // Now output should be LOW
    const G = Array.from({ length: 3 }, () => new Float64Array(3));
    const b = new Float64Array(3);
    m.stamp(G, b, x1, dt);
    const Gon = 1 / 280;
    expect(G[1][1]).toBeCloseTo(Gon, 4);
    expect(Math.abs(G[1][2])).toBeLessThan(1e-6);
  });
});
