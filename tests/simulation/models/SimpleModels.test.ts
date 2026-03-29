import { describe, it, expect } from 'vitest';
import { PotentiometerModel } from '@/simulation/models/PotentiometerModel';
import { PowerSourceModel } from '@/simulation/models/PowerSourceModel';
import { GroundModel } from '@/simulation/models/GroundModel';
import { AudioOutputModel } from '@/simulation/models/AudioOutputModel';

describe('PotentiometerModel', () => {
  it('stamps two conductances split by position', () => {
    const m = new PotentiometerModel();
    m.init([0, 1, 2], 0, 0, { maxResistance: 100000, position: 0.3 });
    const G = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];
    const b = new Float64Array(3);
    const x = new Float64Array(3);
    m.stamp(G, b, x, 1 / 48000);
    const gTop = 1 / (100000 * 0.3);
    const gBottom = 1 / (100000 * 0.7);
    expect(G[0][0]).toBeCloseTo(gTop, 8);
    expect(G[1][1]).toBeCloseTo(gTop + gBottom, 8);
    expect(G[2][2]).toBeCloseTo(gBottom, 8);
  });
});

describe('PowerSourceModel', () => {
  it('has 1 branch and stamps voltage source', () => {
    const m = new PowerSourceModel();
    expect(m.getBranchCount()).toBe(1);
    m.init([0, -1], 0, 1, { voltage: 9 });
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    const x = new Float64Array(2);
    m.stamp(G, b, x, 1 / 48000);
    expect(G[1][0]).toBe(1);
    expect(G[0][1]).toBe(1);
    expect(b[1]).toBe(9);
  });
});

describe('GroundModel', () => {
  it('has no internal nodes or branches', () => {
    const m = new GroundModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps nothing', () => {
    const m = new GroundModel();
    m.init([-1], 0, 0, {});
    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    m.stamp(G, b, new Float64Array(1), 1 / 48000);
    expect(G[0][0]).toBe(0);
    expect(b[0]).toBe(0);
  });
});

describe('AudioOutputModel', () => {
  it('stamps nothing significant', () => {
    const m = new AudioOutputModel();
    m.init([0], 0, 0, {});
    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    m.stamp(G, b, new Float64Array(1), 1 / 48000);
    expect(G[0][0]).toBe(0);
  });
});
