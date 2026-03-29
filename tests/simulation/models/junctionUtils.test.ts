import { describe, it, expect } from 'vitest';
import {
  computeVcrit,
  limitJunctionVoltage,
  linearizeJunction,
  BOLTZMANN_VOLTAGE,
} from '@/simulation/models/junctionUtils';

describe('junctionUtils', () => {
  describe('computeVcrit', () => {
    it('computes critical voltage for 1N914', () => {
      const Vcrit = computeVcrit(2.52e-9, 1.752, BOLTZMANN_VOLTAGE);
      expect(Vcrit).toBeCloseTo(0.77, 1);
    });
  });

  describe('limitJunctionVoltage', () => {
    const nVt = 1.752 * BOLTZMANN_VOLTAGE;
    const Vcrit = 0.77;

    it('does not limit small voltage changes', () => {
      const v = limitJunctionVoltage(0.65, 0.64, nVt, Vcrit);
      expect(v).toBe(0.65);
    });

    it('limits large positive jumps above Vcrit', () => {
      const v = limitJunctionVoltage(2.0, 0.7, nVt, Vcrit);
      expect(v).toBeCloseTo(0.7 + 2 * nVt, 4);
    });

    it('jumps to Vcrit from negative', () => {
      const v = limitJunctionVoltage(5.0, -0.1, nVt, Vcrit);
      expect(v).toBe(Vcrit);
    });

    it('does not limit below Vcrit', () => {
      const v = limitJunctionVoltage(0.3, 0.0, nVt, Vcrit);
      expect(v).toBe(0.3);
    });
  });

  describe('linearizeJunction', () => {
    it('produces correct values at Vd=0.6V for 1N914', () => {
      const { Gd, Ieq, Id } = linearizeJunction(0.6, 2.52e-9, 1.752, BOLTZMANN_VOLTAGE);
      const nVt = 1.752 * BOLTZMANN_VOLTAGE;
      const expectedId = 2.52e-9 * (Math.exp(0.6 / nVt) - 1);
      expect(Id).toBeCloseTo(expectedId, 10);
      const expectedGd = (2.52e-9 / nVt) * Math.exp(0.6 / nVt);
      expect(Gd).toBeCloseTo(expectedGd, 10);
      expect(Ieq).toBeCloseTo(Id - Gd * 0.6, 10);
    });

    it('returns near-zero conductance when reverse biased', () => {
      const { Gd, Id } = linearizeJunction(-1.0, 2.52e-9, 1.752, BOLTZMANN_VOLTAGE);
      expect(Gd).toBeLessThan(1e-10);
      expect(Id).toBeCloseTo(-2.52e-9, 12);
    });
  });
});
