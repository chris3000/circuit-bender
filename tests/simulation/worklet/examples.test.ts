/**
 * Runs the real example circuits — built by the same code the Examples menu
 * uses and serialized the same way App.tsx does — through the solver.
 * Hand-built test circuits can drift from what the app actually loads; these
 * cannot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { capacitorDefinition } from '@/components/definitions/Capacitor';
import { cd40106Definition } from '@/components/definitions/CD40106';
import { lm741Definition } from '@/components/definitions/LM741';
import { potentiometerDefinition } from '@/components/definitions/Potentiometer';
import { powerSupplyDefinition } from '@/components/definitions/PowerSupply';
import { groundDefinition } from '@/components/definitions/Ground';
import { transistor2N3904Definition } from '@/components/definitions/Transistor2N3904';
import { diode1N914Definition } from '@/components/definitions/Diode1N914';
import { audioOutputJackDefinition } from '@/components/definitions/AudioOutputJack';
import { ledDefinition } from '@/components/definitions/LED';
import { switchDefinition } from '@/components/definitions/Switch';
import { junctionDefinition } from '@/components/definitions/Junction';
import { exampleCircuits } from '@/examples/circuits';
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
import { SwitchModel } from '@/simulation/models/SwitchModel';
import { JunctionModel } from '@/simulation/models/JunctionModel';

const SR = 48000;
const DT = 1 / SR;

function modelRegistry(): ModelRegistry {
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
  reg.register('switch', () => new SwitchModel());
  reg.register('junction', () => new JunctionModel());
  return reg;
}

/** Build an example and hand it to the solver exactly as App.tsx serializes it. */
function load(name: string) {
  const example = exampleCircuits.find(e => e.name === name);
  if (!example) throw new Error(`No example named "${name}"`);
  const { components, connections } = example.build();
  const solver = new MNASolver(modelRegistry());
  solver.loadCircuit(
    components.map(c => ({
      id: c.id,
      type: c.type,
      pins: c.pins.map(p => ({ id: p.id, label: p.label, type: p.type })),
      parameters: { ...c.parameters },
    })),
    connections.map(c => ({
      id: c.id,
      from: { componentId: c.from.componentId, pinId: c.from.pinId },
      to: { componentId: c.to.componentId, pinId: c.to.pinId },
    })),
  );
  return { solver, components };
}

function render(solver: MNASolver, seconds: number, settle = 0.25): Float64Array {
  for (let i = 0; i < SR * settle; i++) solver.step(DT);
  const out = new Float64Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = solver.step(DT);
  return out;
}

function measureFrequency(samples: Float64Array): number {
  let first = -1, last = -1, count = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) {
      const t = i - 1 + samples[i - 1] / (samples[i - 1] - samples[i]);
      if (first < 0) first = t;
      last = t;
      count++;
    }
  }
  return ((count - 1) / (last - first)) * SR;
}

/** The audio jack's input resistance, which loads the gate output it is wired to. */
const JACK_LOAD = 1e6;

/** CD40106 relaxation oscillator frequency from the model's thresholds and loaded 280Ω output. */
function schmittFrequency(resistance: number, capacitance: number): number {
  const tauR = resistance + (280 * JACK_LOAD) / (280 + JACK_LOAD);
  const vHigh = JACK_LOAD / (280 + JACK_LOAD);   // output high level as a fraction of Vdd
  return 1 / (tauR * capacitance * Math.log((0.59 / 0.40) * ((vHigh - 0.40) / (vHigh - 0.59))));
}

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of [
    resistorDefinition, capacitorDefinition, cd40106Definition, lm741Definition,
    potentiometerDefinition, powerSupplyDefinition, groundDefinition,
    transistor2N3904Definition, diode1N914Definition, audioOutputJackDefinition,
    ledDefinition, switchDefinition, junctionDefinition,
  ]) registry.register(def);
});

describe('example circuits', () => {
  it.each(exampleCircuits.map(e => e.name))('%s: output is finite and never clips', (name) => {
    const { solver } = load(name);
    const samples = render(solver, 0.5);
    let peak = 0;
    for (const s of samples) {
      expect(Number.isFinite(s)).toBe(true);
      peak = Math.max(peak, Math.abs(s));
    }
    expect(peak).toBeLessThan(0.99);
  });

  it.each([
    ['Simple Oscillator', 27000 + 2200, 100e-9],
    ['Oscillator + Op-Amp', 27000 + 2200, 100e-9],
    ['Low Drone', 100000, 100e-9],
    ['High Chirp', 10000, 100e-9],
    ['Pitch Control', 10000 + 0.5 * 100000, 100e-9],
  ])('%s: plays at the pitch its component values give', (name, resistance, capacitance) => {
    const { solver } = load(name);
    const samples = render(solver, 1);
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.3);

    const expected = schmittFrequency(resistance, capacitance);
    // The op-amp example loads the oscillator through 100k, shifting it slightly
    const tolerance = name === 'Oscillator + Op-Amp' ? 0.01 : 0.001;
    expect(Math.abs(measureFrequency(samples) / expected - 1)).toBeLessThan(tolerance);
  });

  it('Simple Oscillator is A4', () => {
    const { solver } = load('Simple Oscillator');
    expect(measureFrequency(render(solver, 1))).toBeCloseTo(440.9, 0);
  });

  it('LED Blinker: the LED turns on and off', () => {
    const { solver, components } = load('LED Blinker');
    const led = components.find(c => c.type === 'led')!;
    const model = solver.getModel(led.id) as DiodeModel;
    let lit = 0, dark = 0;
    // Blink period is ~0.77s; watch for 2s in 10ms slices
    for (let slice = 0; slice < 200; slice++) {
      for (let i = 0; i < SR / 100; i++) solver.step(DT);
      if (model.isLit()) lit++; else dark++;
    }
    expect(lit).toBeGreaterThan(20);
    expect(dark).toBeGreaterThan(20);
  });

  it('Pitch Control: turning the pot retunes the oscillator', () => {
    const { solver, components } = load('Pitch Control');
    const pot = components.find(c => c.type === 'potentiometer')!;
    solver.updateParam(pot.id, 'position', 0.1);
    const high = measureFrequency(render(solver, 0.5));
    solver.updateParam(pot.id, 'position', 0.9);
    const low = measureFrequency(render(solver, 0.5));
    expect(Math.abs(high / schmittFrequency(10000 + 10000, 100e-9) - 1)).toBeLessThan(1e-3);
    expect(Math.abs(low / schmittFrequency(10000 + 90000, 100e-9) - 1)).toBeLessThan(1e-3);
  });
});

/**
 * The WSG is checked against what its schematic says each part does, with the
 * controls set through the same parameter messages the UI sends.
 */
describe('MFOS Weird Sound Generator', () => {
  const NAME = 'MFOS Weird Sound Generator';

  function wsg(settings: Partial<Record<'wacky' | 'zany' | 'zaniness' | 'weird' | 'oddness' | 'wackiness', number>> = {}) {
    const { solver, components } = load(NAME);
    // Pots appear in the example in this order
    const [wacky, zany, zaniness, weird, oddness] = components.filter(c => c.type === 'potentiometer');
    const pots = { wacky, zany, zaniness, weird, oddness };
    for (const [name, value] of Object.entries(settings)) {
      if (name === 'wackiness') solver.updateParam(components.find(c => c.type === 'switch')!.id, 'closed', value);
      else solver.updateParam(pots[name as keyof typeof pots].id, 'position', value);
    }
    const ic = components.find(c => c.type === 'cd40106')!;
    const opamp = components.find(c => c.type === 'lm741')!;
    // Probes: Weird, Wacky and Zany gate outputs, then the op-amp output
    solver.setProbes([
      { componentId: ic.id, pinId: ic.pins[6].id },
      { componentId: ic.id, pinId: ic.pins[7].id },
      { componentId: ic.id, pinId: ic.pins[8].id },
      { componentId: opamp.id, pinId: opamp.pins[3].id },
    ]);
    return { solver, components, opamp };
  }

  /** Run for `seconds` and report each gate's frequency plus the output's swing. */
  function observe(solver: MNASolver, seconds: number, settle = 0.5) {
    for (let i = 0; i < SR * settle; i++) solver.step(DT);
    const n = Math.round(SR * seconds);
    const edges = [0, 0, 0], prev = [0, 0, 0];
    let outMin = Infinity, outMax = -Infinity, peak = 0;
    for (let i = 0; i < n; i++) {
      const sample = solver.step(DT);
      expect(Number.isFinite(sample)).toBe(true);
      peak = Math.max(peak, Math.abs(sample));
      for (let g = 0; g < 3; g++) {
        const v = solver.getProbeSample(g);
        if (i > 0 && prev[g] < 4.5 && v >= 4.5) edges[g]++;
        prev[g] = v;
      }
      const out = solver.getProbeSample(3);
      outMin = Math.min(outMin, out);
      outMax = Math.max(outMax, out);
    }
    return {
      weird: edges[0] / seconds, wacky: edges[1] / seconds, zany: edges[2] / seconds,
      outSwing: outMax - outMin, outCentre: (outMax + outMin) / 2, peak,
    };
  }

  /** Free-running frequency of a gate with `resistance` of feedback, `capacitance` to ground. */
  const rcFrequency = (resistance: number, capacitance: number) =>
    1 / ((resistance + 280) * capacitance * Math.log((0.59 / 0.40) * ((1 - 0.40) / (1 - 0.59))));

  it('starts biased and silent instead of charging up for seconds', () => {
    const { solver, opamp } = wsg();
    // 220 µF on a 50 kΩ divider would take ~30 s to settle from empty
    expect(solver.getNodeVoltageByPin(opamp.id, opamp.pins[1].id)).toBeCloseTo(4.5, 3);
    expect(solver.getNodeVoltageByPin(opamp.id, opamp.pins[3].id)).toBeCloseTo(4.5, 2);
    expect(Math.abs(solver.step(DT))).toBeLessThan(1e-3);
  });

  it('runs all three oscillators at the frequencies their parts give', () => {
    const { solver } = wsg({ wackiness: 0, zaniness: 0.001 });
    const seen = observe(solver, 4);
    // Wacky: R6 + 65% of R1, 22 nF.  Zany: R15 + 40% of R13, 1 µF.  Weird: R7 + R14 + 20% of R9, 22 nF.
    expect(Math.abs(seen.wacky / rcFrequency(4700 + 650e3, 22e-9) - 1)).toBeLessThan(0.01);
    expect(Math.abs(seen.zany / rcFrequency(4700 + 400e3, 1e-6) - 1)).toBeLessThan(0.1);   // few periods in 4 s
    expect(Math.abs(seen.weird / rcFrequency(4700 + 4700 + 200e3, 22e-9) - 1)).toBeLessThan(0.01);
  });

  it('Wackiness gates the Weird oscillator in step with Wacky', () => {
    // D1 holds the Weird input low whenever Wacky is low, so Weird restarts
    // on every Wacky cycle (the "hollow sync" sound)
    const free = observe(wsg({ wackiness: 0, zaniness: 0.001 }).solver, 2);
    const gated = observe(wsg({ wackiness: 1, zaniness: 0.001 }).solver, 2);
    expect(free.weird).toBeGreaterThan(250);
    expect(Math.abs(gated.weird / gated.wacky - 1)).toBeLessThan(0.02);
  });

  it('Zaniness lets Q1 short out the Weird frequency pot, raising the pitch', () => {
    const off = observe(wsg({ wackiness: 0, zaniness: 0.001 }).solver, 2);
    const on = observe(wsg({ wackiness: 0, zaniness: 0.999 }).solver, 2);
    expect(on.weird).toBeGreaterThan(off.weird * 2.5);
  });

  it('puts out line level centred on half supply', () => {
    const seen = observe(wsg().solver, 2);
    expect(seen.outCentre).toBeGreaterThan(4.3);
    expect(seen.outCentre).toBeLessThan(4.7);
    expect(seen.outSwing).toBeGreaterThan(0.2);   // a few hundred millivolts...
    expect(seen.outSwing).toBeLessThan(2);        // ...nowhere near the rails
    expect(seen.peak).toBeGreaterThan(0.08);
    expect(seen.peak).toBeLessThan(0.99);
  });

  it('Oddness is a resonant filter: output peaks when the pitch sits on its corner', () => {
    // With R3 almost fully up the corner is near 2.2 kHz with a strong peak
    // (limited by the 741's bandwidth). A 2 kHz Weird pitch rides it; a
    // 280 Hz one does not.
    const onPeak = observe(wsg({ wackiness: 0, zaniness: 0.001, oddness: 0.999, weird: 0.982 }).solver, 1);
    const offPeak = observe(wsg({ wackiness: 0, zaniness: 0.001, oddness: 0.999, weird: 0.8 }).solver, 1);
    expect(onPeak.weird).toBeGreaterThan(1900);
    expect(onPeak.weird).toBeLessThan(2500);
    expect(onPeak.outSwing).toBeGreaterThan(offPeak.outSwing * 2);
    expect(onPeak.peak).toBeLessThan(0.99);
  });

  it('stays finite and bounded with every control at either extreme', () => {
    for (const v of [0.001, 0.999]) {
      const seen = observe(wsg({ wacky: v, zany: v, zaniness: v, weird: v, oddness: v }).solver, 0.5, 0.1);
      expect(seen.peak).toBeLessThan(1.0001);
    }
  });
});
