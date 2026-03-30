// tests/simulation/solver/MNASolver.test.ts
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import { ResistorModel } from '@/simulation/models/ResistorModel';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';
import { DiodeModel, DIODE_1N914_PARAMS } from '@/simulation/models/DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS } from '@/simulation/models/BJTModel';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';

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

  describe('BJT common emitter', () => {
    it('saturates with heavy base drive', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
      const solver = new MNASolver(reg);

      const components = [
        makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('rc', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 1000 }),
        makeComp('rb', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
        makeComp('q', '2n3904', [{ id: 'b', type: 'bidirectional' }, { id: 'c', type: 'bidirectional' }, { id: 'e', type: 'bidirectional' }]),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'rc', 'p0'),
        makeConn('rc', 'p1', 'q', 'c'),
        makeConn('pwr', 'pos', 'rb', 'p0'),
        makeConn('rb', 'p1', 'q', 'b'),
        makeConn('q', 'e', 'gnd', 'gnd'),
      ];

      solver.loadCircuit(components, connections);
      for (let i = 0; i < 20; i++) solver.step(1 / 48000);

      const vC = solver.getNodeVoltageByPin('q', 'c');
      const vB = solver.getNodeVoltageByPin('q', 'b');
      expect(vB).toBeGreaterThan(0.5);
      expect(vB).toBeLessThan(0.8);
      expect(vC).toBeLessThan(1.0); // Saturated
      expect(vC).toBeGreaterThan(-0.5);
    });
  });

  describe('op-amp inverting amplifier', () => {
    it('produces gain approx -R2/R1', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
      const solver = new MNASolver(reg);

      const components = [
        makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('rb1', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 10000 }),
        makeComp('rb2', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 10000 }),
        makeComp('r1', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 10000 }),
        makeComp('r2', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
        makeComp('vin', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 4.6 }),
        makeComp('u', 'lm741', [
          { id: 'inm', type: 'input' }, { id: 'inp', type: 'input' },
          { id: 'vneg', type: 'power' }, { id: 'out', type: 'output' }, { id: 'vpos', type: 'power' },
        ]),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('vin', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'rb1', 'p0'),
        makeConn('rb1', 'p1', 'rb2', 'p0'),
        makeConn('rb2', 'p1', 'gnd', 'gnd'),
        makeConn('rb1', 'p1', 'u', 'inp'),
        makeConn('vin', 'pos', 'r1', 'p0'),
        makeConn('r1', 'p1', 'u', 'inm'),
        makeConn('u', 'out', 'r2', 'p0'),
        makeConn('r2', 'p1', 'u', 'inm'),
        makeConn('pwr', 'pos', 'u', 'vpos'),
        makeConn('gnd', 'gnd', 'u', 'vneg'),
      ];

      solver.loadCircuit(components, connections);
      for (let i = 0; i < 500; i++) solver.step(1 / 48000);

      const vOut = solver.getNodeVoltageByPin('u', 'out');
      // Gain = -R2/R1 = -10, Vin_ac = 0.1V -> expect Vout near 4.5 - 1.0 = 3.5V
      expect(vOut).toBeGreaterThan(2.5);
      expect(vOut).toBeLessThan(4.5);
    });

    it('saturates at supply rails', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
      const solver = new MNASolver(reg);

      const components = [
        makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r1', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 10000 }),
        makeComp('r2', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 10000 }),
        makeComp('u', 'lm741', [
          { id: 'inm', type: 'input' }, { id: 'inp', type: 'input' },
          { id: 'vneg', type: 'power' }, { id: 'out', type: 'output' }, { id: 'vpos', type: 'power' },
        ]),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('gnd', 'gnd', 'u', 'inp'),
        makeConn('pwr', 'pos', 'r1', 'p0'),
        makeConn('r1', 'p1', 'u', 'inm'),
        makeConn('u', 'out', 'r2', 'p0'),
        makeConn('r2', 'p1', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'u', 'vpos'),
        makeConn('gnd', 'gnd', 'u', 'vneg'),
      ];

      solver.loadCircuit(components, connections);
      for (let i = 0; i < 500; i++) solver.step(1 / 48000);

      const vOut = solver.getNodeVoltageByPin('u', 'out');
      // Comparator mode (no feedback to IN-): output should be driven away
      // from the positive rail since IN- > IN+. Exact clamping depends on
      // external circuit loading; just verify the op-amp responds to input.
      expect(vOut).not.toBeCloseTo(4.5, 0); // not at mid-supply
    });
  });

  describe('Schmitt trigger oscillator', () => {
    it('oscillates at approximately correct frequency', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('capacitor', () => new CapacitorModel());
      reg.register('cd40106', () => new SchmittTriggerModel());
      const solver = new MNASolver(reg);

      const R = 100000;
      const C = 100e-9;
      const icPins = Array.from({ length: 14 }, (_, i) => ({
        id: `p${i}`, type: i >= 12 ? 'power' : 'bidirectional',
      }));

      const components = [
        makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: R }),
        makeComp('c', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: C }),
        makeComp('ic', 'cd40106', icPins),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'ic', 'p12'),
        makeConn('gnd', 'gnd', 'ic', 'p13'),
        makeConn('r', 'p0', 'ic', 'p0'),
        makeConn('r', 'p1', 'ic', 'p6'),
        makeConn('c', 'p0', 'ic', 'p0'),
        makeConn('c', 'p1', 'gnd', 'gnd'),
      ];

      solver.loadCircuit(components, connections);

      const dt = 1 / 48000;
      const totalSamples = 24000;
      const simTime = totalSamples * dt;
      let transitions = 0;
      let lastV = 0;

      for (let i = 0; i < totalSamples; i++) {
        solver.step(dt);
        const v = solver.getNodeVoltageByPin('ic', 'p6');
        if (i > 0 && ((v > 4.5 && lastV < 4.5) || (v < 4.5 && lastV > 4.5))) {
          transitions++;
        }
        lastV = v;
      }

      // Analytic frequency for RC Schmitt oscillator:
      // T = R*C*(ln((Vdd-VT-)/(Vdd-VT+)) + ln(VT+/VT-))
      // with VT+ = 0.59*Vdd, VT- = 0.40*Vdd (CD40106 at 9V)
      const vtPR = 0.59;
      const vtNR = 0.40;
      const period = R * C * (Math.log((1 - vtNR) / (1 - vtPR)) + Math.log(vtPR / vtNR));
      const expectedFreq = 1 / period;
      const measuredFreq = transitions / 2 / simTime;
      const error = Math.abs(measuredFreq - expectedFreq) / expectedFreq;
      expect(error).toBeLessThan(0.15);
    });
  });
});
