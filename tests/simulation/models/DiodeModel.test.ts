import { describe, it, expect } from 'vitest';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from '@/simulation/models/DiodeModel';

describe('DiodeModel', () => {
  describe('1N914', () => {
    it('has 1 internal node (series resistance)', () => {
      const m = new DiodeModel(DIODE_1N914_PARAMS);
      expect(m.getInternalNodeCount()).toBe(1);
    });

    it('stamps series resistance and junction conductance', () => {
      const m = new DiodeModel(DIODE_1N914_PARAMS);
      m.init([0, 1], 2, 0, {});
      const N = 3;
      const G = Array.from({ length: N }, () => new Float64Array(N));
      const b = new Float64Array(N);
      const x = Float64Array.from([0.6, 0, 0.6]);
      m.stampMatrix(G, 1 / 48000, false);
      m.stampNonlinear(G, b, x, 1 / 48000);
      const Grs = 1 / 0.568;
      expect(G[0][0]).toBeCloseTo(Grs, 1);
      expect(G[2][2]).toBeGreaterThan(Grs);
      expect(G[1][1]).toBeGreaterThan(0);
    });

    it('reports convergence error as the distance from its linearization point', () => {
      const m = new DiodeModel(DIODE_1N914_PARAMS);
      m.init([0, 1], 2, 0, {});
      const G = Array.from({ length: 3 }, () => new Float64Array(3));
      const b = new Float64Array(3);
      const x = Float64Array.from([0.6, 0, 0.55]);
      m.stampNonlinear(G, b, x, 1 / 48000);          // linearized at 0.55 V
      const xNew = Float64Array.from([0.6, 0, 0.60]);
      expect(m.convergenceError(x, xNew)).toBeCloseTo(0.05, 6);
      expect(m.convergenceError(x, x)).toBeCloseTo(0, 9);
    });

    it('limits relative to the previous iteration, not the previous step', () => {
      const m = new DiodeModel(DIODE_1N914_PARAMS);
      m.init([0, 1], 2, 0, {});
      const G = Array.from({ length: 3 }, () => new Float64Array(3));
      const b = new Float64Array(3);
      // Two iterations in the same step, each asking for 5 V: the second is
      // limited from where the first ended up, so the iterate keeps advancing.
      const x = Float64Array.from([5, 0, 5]);
      m.stampNonlinear(G, b, x, 1 / 48000);
      const first = 5 - m.convergenceError(x, x);
      m.stampNonlinear(G, b, x, 1 / 48000);
      const second = 5 - m.convergenceError(x, x);
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(1);
      expect(second).toBeGreaterThan(first);
    });
  });

  it('declares the junction nodes as its nonlinear nodes', () => {
    const withRs = new DiodeModel(DIODE_1N914_PARAMS);
    withRs.init([0, 1], 2, 0, {});
    expect(withRs.getNonlinearNodes()).toEqual([2, 1]);
    const led = new DiodeModel(DIODE_LED_RED_PARAMS);
    led.init([0, 1], 0, 0, {});
    expect(led.getNonlinearNodes()).toEqual([0, 1]);
  });

  describe('LED (Rs=0)', () => {
    it('has 0 internal nodes', () => {
      const m = new DiodeModel(DIODE_LED_RED_PARAMS);
      expect(m.getInternalNodeCount()).toBe(0);
    });

    it('stamps junction directly between anode and cathode', () => {
      const m = new DiodeModel(DIODE_LED_RED_PARAMS);
      m.init([0, 1], 0, 0, {});
      const G = [new Float64Array(2), new Float64Array(2)];
      const b = new Float64Array(2);
      const x = Float64Array.from([1.8, 0]);
      m.stampMatrix(G, 1 / 48000, false);
      m.stampNonlinear(G, b, x, 1 / 48000);
      expect(G[0][0]).toBeGreaterThan(0);
      expect(G[1][1]).toBeGreaterThan(0);
    });
  });
});
