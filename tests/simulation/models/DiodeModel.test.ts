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
      m.stamp(G, b, x, 1 / 48000);
      const Grs = 1 / 0.568;
      expect(G[0][0]).toBeCloseTo(Grs, 1);
      expect(G[2][2]).toBeGreaterThan(Grs);
      expect(G[1][1]).toBeGreaterThan(0);
    });

    it('reports convergence error from junction voltage change', () => {
      const m = new DiodeModel(DIODE_1N914_PARAMS);
      m.init([0, 1], 2, 0, {});
      const xOld = Float64Array.from([0.6, 0, 0.55]);
      const xNew = Float64Array.from([0.6, 0, 0.60]);
      const err = m.convergenceError(xOld, xNew);
      expect(err).toBeCloseTo(0.05, 4);
    });
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
      m.stamp(G, b, x, 1 / 48000);
      expect(G[0][0]).toBeGreaterThan(0);
      expect(G[1][1]).toBeGreaterThan(0);
    });
  });
});
