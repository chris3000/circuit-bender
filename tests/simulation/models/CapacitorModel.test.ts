import { describe, it, expect } from 'vitest';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';

describe('CapacitorModel', () => {
  const dt = 1 / 48000;
  const C = 100e-9;

  it('stamps trapezoidal companion conductance', () => {
    const m = new CapacitorModel();
    m.init([0, 1], 0, 0, { capacitance: C });
    const G = [new Float64Array(2), new Float64Array(2)];
    m.stampMatrix(G, dt, false);
    const Geq = 2 * C / dt;
    expect(G[0][0]).toBeCloseTo(Geq, 6);
    expect(G[1][1]).toBeCloseTo(Geq, 6);
    expect(G[0][1]).toBeCloseTo(-Geq, 6);
  });

  it('stamps backward-Euler companion conductance', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: C });
    const G = [new Float64Array(1)];
    m.stampMatrix(G, dt, true);
    expect(G[0][0]).toBeCloseTo(C / dt, 6);
  });

  it('includes companion current from previous state', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: C });
    const x1 = Float64Array.from([5.0]);
    m.postStep(x1, dt);
    const b = new Float64Array(1);
    m.stampRhs(b, dt, false);
    // Trapezoidal history: Geq·vPrev + iPrev, with iPrev = Geq·(5 − 0) − 0
    const Geq = 2 * C / dt;
    expect(b[0]).toBeCloseTo(Geq * 5 + Geq * 5, 6);
  });

  it('backward Euler ignores the stored current', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: C });
    m.postStep(Float64Array.from([5.0]), dt); // leaves a non-zero iPrev
    const b = new Float64Array(1);
    m.stampRhs(b, dt, true);
    expect(b[0]).toBeCloseTo((C / dt) * 5, 6);
  });

  it('a backward-Euler step re-establishes the current for trapezoidal steps', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: C });
    m.postStep(Float64Array.from([5.0]), dt);        // stale current from "before the event"
    m.postStep(Float64Array.from([5.001]), dt / 1024, true); // restart step
    const b = new Float64Array(1);
    m.stampRhs(b, dt, false);
    const Geq = 2 * C / dt;
    const iRestart = (C / (dt / 1024)) * 0.001;
    expect(b[0]).toBeCloseTo(Geq * 5.001 + iRestart, 6);
  });

  it('syncState moves the voltage history without a solve', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: C });
    m.syncState(Float64Array.from([3.0]));
    const b = new Float64Array(1);
    m.stampRhs(b, dt, true);
    expect(b[0]).toBeCloseTo((C / dt) * 3, 6);
  });

  it('convergenceError returns 0 (linear per timestep)', () => {
    const m = new CapacitorModel();
    m.init([0, 1], 0, 0, { capacitance: C });
    expect(m.convergenceError(new Float64Array(2), new Float64Array(2))).toBe(0);
  });

  it('reset clears state', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: C });
    m.postStep(Float64Array.from([5.0]), dt);
    m.reset();
    const b = new Float64Array(1);
    m.stampRhs(b, dt, false);
    expect(b[0]).toBe(0);
  });
});
