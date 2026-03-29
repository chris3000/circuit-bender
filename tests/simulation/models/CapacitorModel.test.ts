import { describe, it, expect } from 'vitest';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';

describe('CapacitorModel', () => {
  const dt = 1 / 48000;

  it('stamps trapezoidal companion conductance', () => {
    const m = new CapacitorModel();
    m.init([0, 1], 0, 0, { capacitance: 100e-9 });
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    const x = new Float64Array(2);
    m.stamp(G, b, x, dt);
    const Geq = 2 * 100e-9 / dt;
    expect(G[0][0]).toBeCloseTo(Geq, 6);
    expect(G[1][1]).toBeCloseTo(Geq, 6);
    expect(G[0][1]).toBeCloseTo(-Geq, 6);
  });

  it('includes companion current from previous state', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: 100e-9 });
    const G1 = [new Float64Array(1)];
    const b1 = new Float64Array(1);
    const x1 = Float64Array.from([5.0]);
    m.stamp(G1, b1, x1, dt);
    m.postStep(x1, dt);
    const G2 = [new Float64Array(1)];
    const b2 = new Float64Array(1);
    m.stamp(G2, b2, x1, dt);
    expect(b2[0]).not.toBe(0);
  });

  it('convergenceError returns 0 (linear per timestep)', () => {
    const m = new CapacitorModel();
    m.init([0, 1], 0, 0, { capacitance: 100e-9 });
    expect(m.convergenceError(new Float64Array(2), new Float64Array(2))).toBe(0);
  });

  it('reset clears state', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: 100e-9 });
    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    const x = Float64Array.from([5.0]);
    m.stamp(G, b, x, dt);
    m.postStep(x, dt);
    m.reset();
    const G2 = [new Float64Array(1)];
    const b2 = new Float64Array(1);
    m.stamp(G2, b2, new Float64Array(1), dt);
    expect(b2[0]).toBe(0);
  });
});
