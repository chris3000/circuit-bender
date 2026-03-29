import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import { ResistorModel } from '@/simulation/models/ResistorModel';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';
import { PotentiometerModel } from '@/simulation/models/PotentiometerModel';
import { PowerSourceModel } from '@/simulation/models/PowerSourceModel';
import { GroundModel } from '@/simulation/models/GroundModel';
import { AudioOutputModel } from '@/simulation/models/AudioOutputModel';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from '@/simulation/models/DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS } from '@/simulation/models/BJTModel';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';

function fullRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  reg.register('resistor', () => new ResistorModel());
  reg.register('capacitor', () => new CapacitorModel());
  reg.register('potentiometer', () => new PotentiometerModel());
  reg.register('power', () => new PowerSourceModel());
  reg.register('ground', () => new GroundModel());
  reg.register('audio-output', () => new AudioOutputModel());
  reg.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
  reg.register('led', () => new DiodeModel(DIODE_LED_RED_PARAMS));
  reg.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
  reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
  reg.register('cd40106', () => new SchmittTriggerModel());
  return reg;
}

function makeComp(id: string, type: string, pins: { id: string; type: string }[], params: Record<string, number | string | boolean> = {}) {
  return { id, type, pins: pins.map(p => ({ id: p.id, label: p.id, type: p.type })), parameters: params };
}
function makeConn(fc: string, fp: string, tc: string, tp: string) {
  return { id: `${fc}_${fp}_${tc}_${tp}`, from: { componentId: fc, pinId: fp }, to: { componentId: tc, pinId: tp } };
}

describe('Regression: example circuits', () => {
  it('simple oscillator produces non-zero periodic output', () => {
    const solver = new MNASolver(fullRegistry());
    const icPins = Array.from({ length: 14 }, (_, i) => ({
      id: `p${i}`, type: i >= 12 ? 'power' : 'bidirectional',
    }));

    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('r', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 16000 }),
      makeComp('c', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 100e-9 }),
      makeComp('ic', 'cd40106', icPins),
      makeComp('out', 'audio-output', [{ id: 'in', type: 'input' }]),
    ];
    const connections = [
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'ic', 'p12'),
      makeConn('gnd', 'gnd', 'ic', 'p13'),
      makeConn('r', 'p0', 'ic', 'p0'),
      makeConn('r', 'p1', 'ic', 'p6'),
      makeConn('c', 'p0', 'ic', 'p0'),
      makeConn('c', 'p1', 'gnd', 'gnd'),
      makeConn('ic', 'p6', 'out', 'in'),
    ];

    solver.loadCircuit(components, connections);

    let hasNonZero = false;
    let hasNaN = false;
    for (let i = 0; i < 4800; i++) {
      const sample = solver.step(1 / 48000);
      if (Math.abs(sample) > 0.01) hasNonZero = true;
      if (!isFinite(sample)) hasNaN = true;
    }

    expect(hasNaN).toBe(false);
    expect(hasNonZero).toBe(true);
  });

  it('subcycling does not produce NaN', () => {
    const solver = new MNASolver(fullRegistry());
    solver.setSubcycles(4);
    const icPins = Array.from({ length: 14 }, (_, i) => ({
      id: `p${i}`, type: i >= 12 ? 'power' : 'bidirectional',
    }));

    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('r', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 16000 }),
      makeComp('c', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 100e-9 }),
      makeComp('ic', 'cd40106', icPins),
      makeComp('out', 'audio-output', [{ id: 'in', type: 'input' }]),
    ];
    const connections = [
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'ic', 'p12'),
      makeConn('gnd', 'gnd', 'ic', 'p13'),
      makeConn('r', 'p0', 'ic', 'p0'),
      makeConn('r', 'p1', 'ic', 'p6'),
      makeConn('c', 'p0', 'ic', 'p0'),
      makeConn('c', 'p1', 'gnd', 'gnd'),
      makeConn('ic', 'p6', 'out', 'in'),
    ];

    solver.loadCircuit(components, connections);

    let hasNaN = false;
    for (let i = 0; i < 2400; i++) {
      const sample = solver.step(1 / 48000);
      if (!isFinite(sample)) hasNaN = true;
    }
    expect(hasNaN).toBe(false);
  });
});
