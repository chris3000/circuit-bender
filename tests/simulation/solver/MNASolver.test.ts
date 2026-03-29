// tests/simulation/solver/MNASolver.test.ts
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import { ResistorModel } from '@/simulation/models/ResistorModel';

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
});
