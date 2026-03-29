// tests/simulation/solver/MNASolver.test.ts
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import { ResistorModel } from '@/simulation/models/ResistorModel';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';
import { DiodeModel, DIODE_1N914_PARAMS } from '@/simulation/models/DiodeModel';

function makeComp(id: string, type: string, pins: { id: string; type: string }[], params: Record<string, number | string | boolean> = {}) {
  return { id, type, pins: pins.map(p => ({ id: p.id, label: p.id, type: p.type })), parameters: params };
}

function makeConn(fromComp: string, fromPin: string, toComp: string, toPin: string) {
  return { id: `${fromComp}_${fromPin}_${toComp}_${toPin}`, from: { componentId: fromComp, pinId: fromPin }, to: { componentId: toComp, pinId: toPin } };
}

describe('MNASolver', () => {
  function createRegistry() {
    const reg = new ModelRegistry();
    reg.register('resistor', () => new ResistorModel());
    return reg;
  }

  describe('resistor divider', () => {
    it('produces correct midpoint voltage', () => {
      const solver = new MNASolver(createRegistry());
      const components = [
        makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r1', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 10000 }),
        makeComp('r2', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 10000 }),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'r1', 'p0'),
        makeConn('r1', 'p1', 'r2', 'p0'),
        makeConn('r2', 'p1', 'gnd', 'gnd'),
      ];
      solver.loadCircuit(components, connections);
      solver.step(1 / 48000);
      const midVoltage = solver.getNodeVoltageByPin('r1', 'p1');
      expect(midVoltage).toBeCloseTo(4.5, 2);
    });
  });

  describe('subcycling', () => {
    it('accepts subcycle count', () => {
      const solver = new MNASolver(createRegistry());
      solver.setSubcycles(4);
    });
  });

  describe('RC step response', () => {
    it('tracks analytic curve within 2%', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('capacitor', () => new CapacitorModel());
      const solver = new MNASolver(reg);

      const R = 10000;
      const C = 100e-9;
      const tau = R * C;
      const Vs = 9;
      const dt = 1 / 48000;

      const components = [
        makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: Vs }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: R }),
        makeComp('c', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: C }),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'r', 'p0'),
        makeConn('r', 'p1', 'c', 'p0'),
        makeConn('c', 'p1', 'gnd', 'gnd'),
      ];

      solver.loadCircuit(components, connections);

      const steps = Math.ceil(2 * tau / dt);
      for (let i = 0; i < steps; i++) {
        solver.step(dt);
      }

      const t = steps * dt;
      const expected = Vs * (1 - Math.exp(-t / tau));
      const actual = solver.getNodeVoltageByPin('c', 'p0');
      const error = Math.abs(actual - expected) / expected;
      expect(error).toBeLessThan(0.02);
    });
  });

  describe('diode forward bias', () => {
    it('produces ~0.6-0.7V drop across 1N914', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
      const solver = new MNASolver(reg);

      const components = [
        makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 1000 }),
        makeComp('d', '1n914', [{ id: 'a', type: 'bidirectional' }, { id: 'k', type: 'bidirectional' }]),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'r', 'p0'),
        makeConn('r', 'p1', 'd', 'a'),
        makeConn('d', 'k', 'gnd', 'gnd'),
      ];

      solver.loadCircuit(components, connections);
      for (let i = 0; i < 10; i++) solver.step(1 / 48000);

      const vAnode = solver.getNodeVoltageByPin('d', 'a');
      expect(vAnode).toBeGreaterThan(0.5);
      expect(vAnode).toBeLessThan(0.85);
    });
  });
});
