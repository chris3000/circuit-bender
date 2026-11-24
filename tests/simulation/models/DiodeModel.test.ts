import { describe, it, expect } from 'vitest';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from '@/simulation/models/DiodeModel';

/** An ideal junction: nothing in series with it. */
const BARE_JUNCTION = { Is: 1e-14, n: 1, Rs: 0 };

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
    const bare = new DiodeModel(BARE_JUNCTION);
    bare.init([0, 1], 2, 0, {});
    expect(bare.getNonlinearNodes()).toEqual([0, 1]);
  });

  describe('a junction with no series resistance', () => {
    it('has 0 internal nodes', () => {
      expect(new DiodeModel(BARE_JUNCTION).getInternalNodeCount()).toBe(0);
    });

    it('stamps junction directly between anode and cathode', () => {
      const m = new DiodeModel(BARE_JUNCTION);
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

  describe('LED', () => {
    it('has a few ohms of its own, so its current is finite with no resistor', () => {
      expect(DIODE_LED_RED_PARAMS.Rs).toBeGreaterThan(0);
      expect(new DiodeModel(DIODE_LED_RED_PARAMS).getInternalNodeCount()).toBe(1);
    });

    it('says what current it passes, and how that compares with what it stands', () => {
      const m = new DiodeModel(DIODE_LED_RED_PARAMS);
      m.init([0, 1], 2, 0, {});
      // 2.1 V across the junction itself (node 2 is between it and the series resistance)
      const { Is, n } = DIODE_LED_RED_PARAMS;
      const amps = Is * (Math.exp(2.1 / (n * 0.02585)) - 1);
      const x = Float64Array.from([2.2, 0, 2.1]);
      expect(m.current(x)).toBeCloseTo(amps, 9);
      expect(m.strain(x)).toBeCloseTo(amps / 0.03, 6);
      // Reversed it passes nothing and is under no strain
      const reversed = Float64Array.from([-9, 0, -9]);
      expect(Math.abs(m.current(reversed))).toBeLessThan(1e-12);
      expect(m.strain(reversed)).toBe(0);
    });
  });
});
