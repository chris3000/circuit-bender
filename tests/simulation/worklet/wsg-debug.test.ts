/**
 * WSG Debug Test — diagnose why the WSG example produces no audio.
 * Tests each section of the circuit independently, then together.
 */
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import { ResistorModel } from '@/simulation/models/ResistorModel';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';
import { PotentiometerModel } from '@/simulation/models/PotentiometerModel';
import { PowerSourceModel } from '@/simulation/models/PowerSourceModel';
import { GroundModel } from '@/simulation/models/GroundModel';
import { AudioOutputModel } from '@/simulation/models/AudioOutputModel';
import { DiodeModel, DIODE_1N914_PARAMS } from '@/simulation/models/DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS } from '@/simulation/models/BJTModel';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';
import { SwitchModel } from '@/simulation/models/SwitchModel';

function fullRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  reg.register('resistor', () => new ResistorModel());
  reg.register('capacitor', () => new CapacitorModel());
  reg.register('potentiometer', () => new PotentiometerModel());
  reg.register('power', () => new PowerSourceModel());
  reg.register('ground', () => new GroundModel());
  reg.register('audio-output', () => new AudioOutputModel());
  reg.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
  reg.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
  reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
  reg.register('cd40106', () => new SchmittTriggerModel());
  reg.register('switch', () => new SwitchModel());
  return reg;
}

function makeComp(id: string, type: string, pins: { id: string; type: string }[], params: Record<string, number | string | boolean> = {}) {
  return { id, type, pins: pins.map(p => ({ id: p.id, label: p.id, type: p.type })), parameters: params };
}
function makeConn(fc: string, fp: string, tc: string, tp: string) {
  return { id: `${fc}_${fp}_${tc}_${tp}`, from: { componentId: fc, pinId: fp }, to: { componentId: tc, pinId: tp } };
}

const icPins = Array.from({ length: 14 }, (_, i) => ({
  id: `p${i}`, type: i >= 12 ? 'power' : 'bidirectional',
}));

// LM741 pins: 0=IN-, 1=IN+, 2=V-, 3=OUT, 4=V+
const opampPins = [
  { id: 'inm', type: 'input' },
  { id: 'inp', type: 'input' },
  { id: 'vneg', type: 'power' },
  { id: 'out', type: 'output' },
  { id: 'vpos', type: 'power' },
];

const dt = 1 / 48000;

describe('WSG Debug', () => {

  // ===== TEST 1: Single oscillator → direct to audio output =====
  it('single Schmitt oscillator produces audio', () => {
    const solver = new MNASolver(fullRegistry());
    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('ic', 'cd40106', icPins),
      makeComp('pot', 'potentiometer', [
        { id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }, { id: 'p2', type: 'bidirectional' },
      ], { maxResistance: 1000000, position: 0.5 }),
      makeComp('r', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 4700 }),
      makeComp('c', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 22e-9 }),
      makeComp('out', 'audio-output', [{ id: 'in', type: 'input' }]),
    ];
    const connections = [
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'ic', 'p12'),
      makeConn('gnd', 'gnd', 'ic', 'p13'),
      makeConn('pot', 'p0', 'ic', 'p0'),
      makeConn('pot', 'p1', 'ic', 'p6'),  // wiper to output (rheostat)
      makeConn('r', 'p0', 'ic', 'p0'),
      makeConn('r', 'p1', 'ic', 'p6'),
      makeConn('c', 'p0', 'ic', 'p0'),
      makeConn('c', 'p1', 'gnd', 'gnd'),
      makeConn('ic', 'p6', 'out', 'in'),  // direct to audio
    ];

    solver.loadCircuit(components, connections);
    let nonZeroSamples = 0;
    for (let i = 0; i < 4800; i++) {
      const s = solver.step(dt);
      if (Math.abs(s) > 0.01) nonZeroSamples++;
    }
    console.log(`Test 1 (single osc → audio): ${nonZeroSamples} non-zero samples out of 4800`);
    expect(nonZeroSamples).toBeGreaterThan(100);
  });

  // ===== TEST 2: Single oscillator → op-amp → audio output =====
  it('single oscillator through op-amp produces audio', () => {
    const solver = new MNASolver(fullRegistry());
    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('ic', 'cd40106', icPins),
      makeComp('r_fb', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 30000 }),
      makeComp('c_osc', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 100e-9 }),
      // Op-amp input resistor
      makeComp('r_in', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
      // Op-amp feedback resistor
      makeComp('r_fb2', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
      // Bias resistors
      makeComp('r16', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
      makeComp('r17', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
      // Output coupling
      makeComp('r12', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 1000 }),
      makeComp('c6', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 1e-6 }),
      makeComp('u', 'lm741', opampPins),
      makeComp('out', 'audio-output', [{ id: 'in', type: 'input' }]),
    ];
    const connections = [
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'ic', 'p12'),
      makeConn('gnd', 'gnd', 'ic', 'p13'),
      // Oscillator
      makeConn('r_fb', 'p0', 'ic', 'p0'),
      makeConn('r_fb', 'p1', 'ic', 'p6'),
      makeConn('c_osc', 'p0', 'ic', 'p0'),
      makeConn('c_osc', 'p1', 'gnd', 'gnd'),
      // Op-amp power (DIP8: pin 3=V-, pin 6=V+)
      makeConn('pwr', 'pos', 'u', 'vpos'),
      makeConn('gnd', 'gnd', 'u', 'vneg'),
      // Op-amp input: oscillator → R_in → IN- (pin 1)
      makeConn('ic', 'p6', 'r_in', 'p0'),
      makeConn('r_in', 'p1', 'u', 'inm'),
      // Op-amp feedback: OUT (pin 5) → R_fb2 → IN-
      makeConn('u', 'out', 'r_fb2', 'p0'),
      makeConn('r_fb2', 'p1', 'u', 'inm'),
      // Op-amp bias: R16 from V+ to IN+ (pin 2), R17 from IN+ to GND
      makeConn('pwr', 'pos', 'r16', 'p0'),
      makeConn('r16', 'p1', 'u', 'inp'),
      makeConn('u', 'inp', 'r17', 'p0'),
      makeConn('r17', 'p1', 'gnd', 'gnd'),
      // Op-amp output: OUT → R12 → C6 → audio
      makeConn('u', 'out', 'r12', 'p0'),
      makeConn('r12', 'p1', 'c6', 'p0'),
      makeConn('c6', 'p1', 'out', 'in'),
    ];

    solver.loadCircuit(components, connections);

    // Run 500 steps to let bias settle
    for (let i = 0; i < 500; i++) solver.step(dt);

    // Check op-amp bias point
    const vInPlus = solver.getNodeVoltageByPin('u', 'inp');
    console.log(`Test 2: Op-amp IN+ bias = ${vInPlus.toFixed(2)}V (expect ~4.5V)`);

    const vOut = solver.getNodeVoltageByPin('u', 'out');
    console.log(`Test 2: Op-amp OUT = ${vOut.toFixed(2)}V`);

    const vOsc = solver.getNodeVoltageByPin('ic', 'p6');
    console.log(`Test 2: Oscillator output = ${vOsc.toFixed(2)}V`);

    // Now run and count audio
    let nonZeroSamples = 0;
    let maxSample = 0;
    for (let i = 0; i < 4800; i++) {
      const s = solver.step(dt);
      if (Math.abs(s) > 0.001) nonZeroSamples++;
      maxSample = Math.max(maxSample, Math.abs(s));
    }
    console.log(`Test 2 (osc → opamp → audio): ${nonZeroSamples} non-zero samples, max=${maxSample.toFixed(4)}`);
    expect(nonZeroSamples).toBeGreaterThan(100);
  });

  // ===== TEST 3: Op-amp bias without oscillator =====
  it('op-amp bias settles to mid-rail', () => {
    const solver = new MNASolver(fullRegistry());
    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('r16', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
      makeComp('r17', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
      makeComp('r11', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 750000 }),
      makeComp('u', 'lm741', opampPins),
    ];
    const connections = [
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'u', 'vpos'),
      makeConn('gnd', 'gnd', 'u', 'vneg'),
      makeConn('pwr', 'pos', 'r16', 'p0'),
      makeConn('r16', 'p1', 'u', 'inp'),
      makeConn('u', 'inp', 'r17', 'p0'),
      makeConn('r17', 'p1', 'gnd', 'gnd'),
      makeConn('u', 'out', 'r11', 'p0'),
      makeConn('r11', 'p1', 'u', 'inm'),
    ];

    solver.loadCircuit(components, connections);
    for (let i = 0; i < 2000; i++) solver.step(dt);

    const vInPlus = solver.getNodeVoltageByPin('u', 'inp');
    const vInMinus = solver.getNodeVoltageByPin('u', 'inm');
    const vOut = solver.getNodeVoltageByPin('u', 'out');

    console.log(`Test 3: IN+=${vInPlus.toFixed(2)}V, IN-=${vInMinus.toFixed(2)}V, OUT=${vOut.toFixed(2)}V`);
    expect(vInPlus).toBeCloseTo(4.5, 0);
    expect(vOut).toBeGreaterThan(2);
    expect(vOut).toBeLessThan(7);
  });

  // ===== TEST 4: Three oscillators without op-amp =====
  it('three WSG oscillators produce output directly', () => {
    const solver = new MNASolver(fullRegistry());
    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('ic', 'cd40106', icPins),
      // Wacky (gate B: pin1 in, pin7 out)
      makeComp('potW', 'potentiometer', [
        { id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }, { id: 'p2', type: 'bidirectional' },
      ], { maxResistance: 1000000, position: 0.3 }),
      makeComp('r6', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 4700 }),
      makeComp('c4', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 22e-9 }),
      // Weird (gate A: pin0 in, pin6 out)
      makeComp('potWd', 'potentiometer', [
        { id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }, { id: 'p2', type: 'bidirectional' },
      ], { maxResistance: 1000000, position: 0.5 }),
      makeComp('c5', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 22e-9 }),
      // Direct output from Weird
      makeComp('out', 'audio-output', [{ id: 'in', type: 'input' }]),
    ];
    const connections = [
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'ic', 'p12'),
      makeConn('gnd', 'gnd', 'ic', 'p13'),
      // Wacky
      makeConn('potW', 'p0', 'ic', 'p1'),
      makeConn('potW', 'p1', 'ic', 'p7'),
      makeConn('r6', 'p0', 'ic', 'p1'),
      makeConn('r6', 'p1', 'ic', 'p7'),
      makeConn('c4', 'p0', 'ic', 'p1'),
      makeConn('c4', 'p1', 'gnd', 'gnd'),
      // Weird
      makeConn('potWd', 'p0', 'ic', 'p0'),
      makeConn('potWd', 'p1', 'ic', 'p6'),
      makeConn('c5', 'p0', 'ic', 'p0'),
      makeConn('c5', 'p1', 'gnd', 'gnd'),
      // Direct audio from Weird
      makeConn('ic', 'p6', 'out', 'in'),
    ];

    solver.loadCircuit(components, connections);

    let nonZero = 0;
    for (let i = 0; i < 4800; i++) {
      const s = solver.step(dt);
      if (Math.abs(s) > 0.01) nonZero++;
    }
    console.log(`Test 4 (3 osc direct): ${nonZero} non-zero samples`);

    const vWacky = solver.getNodeVoltageByPin('ic', 'p7');
    const vWeird = solver.getNodeVoltageByPin('ic', 'p6');
    console.log(`Test 4: Wacky=${vWacky.toFixed(2)}V, Weird=${vWeird.toFixed(2)}V`);

    expect(nonZero).toBeGreaterThan(100);
  });

  // ===== TEST 5: Full WSG as built in the example =====
  it('full WSG produces audio', () => {
    const solver = new MNASolver(fullRegistry());

    // Replicate the exact WSG circuit from circuits.ts
    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('ic', 'cd40106', icPins),
      makeComp('opamp', 'lm741', opampPins),
      makeComp('out', 'audio-output', [{ id: 'in', type: 'input' }]),
      // Wacky
      makeComp('potWacky', 'potentiometer', [
        { id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }, { id: 'p2', type: 'bidirectional' },
      ], { maxResistance: 1000000, position: 0.3 }),
      makeComp('r6', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 4700 }),
      makeComp('c4', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 22e-9 }),
      // Weird
      makeComp('potWeird', 'potentiometer', [
        { id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }, { id: 'p2', type: 'bidirectional' },
      ], { maxResistance: 1000000, position: 0.5 }),
      makeComp('c5', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 22e-9 }),
      // Zany
      makeComp('potZany', 'potentiometer', [
        { id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }, { id: 'p2', type: 'bidirectional' },
      ], { maxResistance: 1000000, position: 0.7 }),
      makeComp('r15', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 4700 }),
      makeComp('c7', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 1e-6 }),
      // Cross-coupling D1+S2+Q1
      makeComp('d1', '1n914', [{ id: 'a', type: 'bidirectional' }, { id: 'k', type: 'bidirectional' }]),
      makeComp('s2', 'switch', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { closed: 1 }),
      makeComp('q1', '2n3904', [{ id: 'b', type: 'bidirectional' }, { id: 'c', type: 'bidirectional' }, { id: 'e', type: 'bidirectional' }]),
      makeComp('r7', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 4700 }),
      makeComp('r14', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 4700 }),
      // Zany cross-coupling
      makeComp('r13', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 1000000 }),
      makeComp('potZaniness', 'potentiometer', [
        { id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }, { id: 'p2', type: 'bidirectional' },
      ], { maxResistance: 100000, position: 0.5 }),
      makeComp('r19', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 47000 }),
      // Filter
      makeComp('r5', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 1000000 }),
      makeComp('potOddness', 'potentiometer', [
        { id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }, { id: 'p2', type: 'bidirectional' },
      ], { maxResistance: 1000000, position: 0.5 }),
      makeComp('c1', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 100e-9 }),
      // Op-amp output stage
      makeComp('r4', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 1000000 }),
      makeComp('r11', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 75000 }),
      makeComp('r16', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
      makeComp('r17', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 100000 }),
      makeComp('r12', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 1000 }),
      makeComp('c6', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 1e-6 }),
      makeComp('c9', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 100e-9 }),
    ];

    const connections = [
      // Power
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'ic', 'p12'),
      makeConn('gnd', 'gnd', 'ic', 'p13'),
      makeConn('pwr', 'pos', 'opamp', 'vpos'),
      makeConn('gnd', 'gnd', 'opamp', 'vneg'),
      // Wacky (gate B: p1=in, p7=out)
      makeConn('potWacky', 'p0', 'ic', 'p1'),
      makeConn('potWacky', 'p1', 'ic', 'p7'),
      makeConn('r6', 'p0', 'ic', 'p1'),
      makeConn('r6', 'p1', 'ic', 'p7'),
      makeConn('c4', 'p0', 'ic', 'p1'),
      makeConn('c4', 'p1', 'gnd', 'gnd'),
      // Weird (gate A: p0=in, p6=out)
      makeConn('potWeird', 'p0', 'ic', 'p0'),
      makeConn('potWeird', 'p1', 'ic', 'p6'),
      makeConn('c5', 'p0', 'ic', 'p0'),
      makeConn('c5', 'p1', 'gnd', 'gnd'),
      // Zany (gate C: p2=in, p8=out)
      makeConn('potZany', 'p0', 'ic', 'p2'),
      makeConn('potZany', 'p1', 'ic', 'p8'),
      makeConn('r15', 'p0', 'ic', 'p2'),
      makeConn('r15', 'p1', 'ic', 'p8'),
      makeConn('c7', 'p0', 'ic', 'p2'),
      makeConn('c7', 'p1', 'gnd', 'gnd'),
      // Cross-coupling DISABLED for debugging
      // makeConn('ic', 'p7', 'd1', 'a'),
      // makeConn('d1', 'k', 's2', 'p0'),
      // makeConn('s2', 'p1', 'q1', 'b'),
      // makeConn('q1', 'c', 'r7', 'p0'),
      // makeConn('r7', 'p1', 'ic', 'p6'),
      // makeConn('q1', 'e', 'r14', 'p0'),
      // makeConn('r14', 'p1', 'ic', 'p0'),
      // makeConn('ic', 'p8', 'potZaniness', 'p0'),
      // makeConn('potZaniness', 'p1', 'r19', 'p0'),
      // makeConn('r19', 'p1', 'r13', 'p0'),
      // makeConn('r13', 'p1', 'ic', 'p1'),
      // Filter
      makeConn('ic', 'p6', 'r5', 'p0'),
      makeConn('r5', 'p1', 'potOddness', 'p0'),
      makeConn('potOddness', 'p1', 'gnd', 'gnd'),
      makeConn('r5', 'p1', 'c1', 'p0'),
      makeConn('c1', 'p1', 'r4', 'p0'),
      // Op-amp (DIP8: p1=IN-, p2=IN+, p3=V-, p5=OUT, p6=V+)
      makeConn('r4', 'p1', 'opamp', 'inm'),
      makeConn('opamp', 'out', 'r11', 'p0'),
      makeConn('r11', 'p1', 'opamp', 'inm'),
      makeConn('pwr', 'pos', 'r16', 'p0'),
      makeConn('r16', 'p1', 'opamp', 'inp'),
      makeConn('opamp', 'inp', 'r17', 'p0'),
      makeConn('r17', 'p1', 'gnd', 'gnd'),
      makeConn('opamp', 'out', 'r12', 'p0'),
      makeConn('r12', 'p1', 'c6', 'p0'),
      makeConn('c6', 'p1', 'out', 'in'),
      // Bypass
      makeConn('pwr', 'pos', 'c9', 'p0'),
      makeConn('c9', 'p1', 'gnd', 'gnd'),
    ];

    solver.loadCircuit(components, connections);

    // Run step by step, detect when voltages collapse
    let lastNonZeroStep = -1;
    for (let i = 0; i < 2000; i++) {
      solver.step(dt);
      const vW = solver.getNodeVoltageByPin('ic', 'p7');
      const vWd = solver.getNodeVoltageByPin('ic', 'p6');
      if (Math.abs(vW) > 0.01 || Math.abs(vWd) > 0.01) lastNonZeroStep = i;
      if (i < 3 || (i > 0 && i % 200 === 0) || (lastNonZeroStep === i - 1 && Math.abs(vW) < 0.01)) {
        const vZ = solver.getNodeVoltageByPin('ic', 'p8');
        const vPwr = solver.getNodeVoltageByPin('pwr', 'pos');
        console.log(`  Step ${i}: Wacky=${vW.toFixed(3)} Weird=${vWd.toFixed(3)} Zany=${vZ.toFixed(3)} Vpwr=${vPwr.toFixed(3)}`);
      }
    }
    console.log(`  Last non-zero step: ${lastNonZeroStep}`);

    // Probe key nodes
    const vWacky = solver.getNodeVoltageByPin('ic', 'p7');
    const vWeird = solver.getNodeVoltageByPin('ic', 'p6');
    const vZany = solver.getNodeVoltageByPin('ic', 'p8');
    const vInPlus = solver.getNodeVoltageByPin('opamp', 'inp');
    const vInMinus = solver.getNodeVoltageByPin('opamp', 'inm');
    const vOpOut = solver.getNodeVoltageByPin('opamp', 'out');
    const vAudioOut = solver.getNodeVoltageByPin('out', 'in');

    console.log(`Test 5 (full WSG) after 2000 steps:`);
    console.log(`  Wacky out: ${vWacky.toFixed(3)}V`);
    console.log(`  Weird out: ${vWeird.toFixed(3)}V`);
    console.log(`  Zany out:  ${vZany.toFixed(3)}V`);
    console.log(`  Op IN+:    ${vInPlus.toFixed(3)}V`);
    console.log(`  Op IN-:    ${vInMinus.toFixed(3)}V`);
    console.log(`  Op OUT:    ${vOpOut.toFixed(3)}V`);
    console.log(`  Audio out: ${vAudioOut.toFixed(6)}V`);

    // Run 1 second and check audio
    let nonZero = 0;
    let maxSample = 0;
    let nanCount = 0;
    for (let i = 0; i < 48000; i++) {
      const s = solver.step(dt);
      if (!isFinite(s)) nanCount++;
      if (Math.abs(s) > 0.001) nonZero++;
      maxSample = Math.max(maxSample, Math.abs(s));
    }
    console.log(`  Audio: ${nonZero} non-zero samples, max=${maxSample.toFixed(4)}, NaN=${nanCount}`);

    expect(nanCount).toBe(0);
    // This is the key assertion — does WSG produce audio?
    expect(nonZero).toBeGreaterThan(0);
  });
});
