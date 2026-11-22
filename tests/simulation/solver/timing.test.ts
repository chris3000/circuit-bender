/**
 * Timing, pitch and aliasing behaviour of the solver as a whole.
 *
 * These are the properties that make an oscillator sound right: edges land at
 * their true instant rather than on the sample grid, so pitch is accurate and
 * continuous, and the output is band-limited.
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
import { DiodeModel, DIODE_LED_RED_PARAMS } from '@/simulation/models/DiodeModel';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';

const SR = 48000;
const DT = 1 / SR;

function registry(): ModelRegistry {
  const reg = new ModelRegistry();
  reg.register('resistor', () => new ResistorModel());
  reg.register('capacitor', () => new CapacitorModel());
  reg.register('potentiometer', () => new PotentiometerModel());
  reg.register('power', () => new PowerSourceModel());
  reg.register('ground', () => new GroundModel());
  reg.register('audio-output', () => new AudioOutputModel());
  reg.register('led', () => new DiodeModel(DIODE_LED_RED_PARAMS));
  reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
  reg.register('cd40106', () => new SchmittTriggerModel());
  return reg;
}

type Params = Record<string, number | string | boolean>;
const comp = (id: string, type: string, pins: Array<[string, string]>, parameters: Params = {}) =>
  ({ id, type, pins: pins.map(([pid, ptype]) => ({ id: pid, label: pid, type: ptype })), parameters });
const wire = (fc: string, fp: string, tc: string, tp: string) =>
  ({ id: `${fc}.${fp}-${tc}.${tp}`, from: { componentId: fc, pinId: fp }, to: { componentId: tc, pinId: tp } });
const twoPin: Array<[string, string]> = [['a', 'bidirectional'], ['b', 'bidirectional']];
const icPins: Array<[string, string]> = Array.from({ length: 14 }, (_, i) =>
  [`p${i}`, i === 12 ? 'power' : i === 13 ? 'ground' : 'bidirectional']);
const supply = () => [
  comp('pwr', 'power', [['pos', 'power'], ['neg', 'ground']], { voltage: 9 }),
  comp('gnd', 'ground', [['gnd', 'ground']]),
];

/** CD40106 relaxation oscillator: R from output to input, C from input to ground. */
function oscillator(resistance: number, capacitance = 100e-9) {
  const solver = new MNASolver(registry());
  solver.loadCircuit([
    ...supply(),
    comp('r', 'resistor', twoPin, { resistance }),
    comp('c', 'capacitor', twoPin, { capacitance }),
    comp('ic', 'cd40106', icPins),
    comp('out', 'audio-output', [['in', 'input']]),
  ], [
    wire('pwr', 'neg', 'gnd', 'gnd'), wire('pwr', 'pos', 'ic', 'p12'), wire('gnd', 'gnd', 'ic', 'p13'),
    wire('r', 'a', 'ic', 'p0'), wire('r', 'b', 'ic', 'p6'),
    wire('c', 'a', 'ic', 'p0'), wire('c', 'b', 'gnd', 'gnd'),
    wire('ic', 'p6', 'out', 'in'),
  ]);
  return solver;
}

/** The audio jack's input resistance, which loads the gate output it is wired to. */
const JACK_LOAD = 1e6;

/**
 * Frequency the model's own equations predict: thresholds 0.40/0.59·Vdd and a
 * 280Ω output driving the timing resistor with the jack in parallel.
 */
function expectedFrequency(resistance: number, capacitance = 100e-9): number {
  const tauR = resistance + (280 * JACK_LOAD) / (280 + JACK_LOAD);
  const vHigh = JACK_LOAD / (280 + JACK_LOAD);   // output high level as a fraction of Vdd
  return 1 / (tauR * capacitance * Math.log((0.59 / 0.40) * ((vHigh - 0.40) / (vHigh - 0.59))));
}

/** Run the solver and return audio samples (after a settling period). */
function render(solver: MNASolver, seconds: number, settle = 0.25): Float64Array {
  for (let i = 0; i < SR * settle; i++) solver.step(DT);
  const out = new Float64Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = solver.step(DT);
  return out;
}

/** Fundamental frequency from interpolated rising zero crossings. */
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

/** Power at one frequency (Hann-windowed single-bin DFT). */
function powerAt(samples: Float64Array, freq: number): number {
  let re = 0, im = 0;
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    const ph = (2 * Math.PI * freq * i) / SR;
    re += samples[i] * w * Math.cos(ph);
    im -= samples[i] * w * Math.sin(ph);
  }
  return re * re + im * im;
}

describe('oscillator pitch', () => {
  it.each([
    [100000, 'low'],
    [29200, 'A4'],
    [10000, 'high'],
    [2200, 'very high'],
  ])('R = %iΩ oscillates within 0.1%% of the analytic frequency (%s)', (resistance) => {
    const f = measureFrequency(render(oscillator(resistance), 1));
    const expected = expectedFrequency(resistance);
    expect(Math.abs(f / expected - 1)).toBeLessThan(1e-3);
  });

  it('is not quantized to whole-sample periods', () => {
    // These two periods differ by well under one sample (≈37.97 vs ≈38.04)
    const fA = measureFrequency(render(oscillator(10000), 1));
    const fB = measureFrequency(render(oscillator(10020), 1));
    const expectedRatio = expectedFrequency(10000) / expectedFrequency(10020);
    expect(fA).toBeGreaterThan(fB);
    expect(Math.abs(fA / fB / expectedRatio - 1)).toBeLessThan(2e-4);
  });

  it('is accurate at every oversampling factor', () => {
    for (const os of [1, 2, 8]) {
      const solver = oscillator(10000);
      solver.setOversampling(os);
      const f = measureFrequency(render(solver, 0.5));
      expect(Math.abs(f / expectedFrequency(10000) - 1)).toBeLessThan(2e-3);
    }
  });
});

describe('aliasing', () => {
  it('keeps a folded-back harmonic of a square wave below -60 dB', () => {
    const samples = render(oscillator(10000), 1);
    const f0 = measureFrequency(samples);
    // Harmonic 37 lies just under the sample rate and would fold to SR − 37·f0,
    // close to the fundamental, at about -31 dB if edges were snapped to samples.
    const alias = SR - 37 * f0;
    expect(alias).toBeGreaterThan(200);
    expect(Math.abs(alias - f0)).toBeGreaterThan(20);
    const db = 10 * Math.log10(powerAt(samples, alias) / powerAt(samples, f0));
    expect(db).toBeLessThan(-60);
  });

  it('leaves headroom for band-limited overshoot instead of clipping', () => {
    const samples = render(oscillator(10000), 0.5);
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.4);
    expect(peak).toBeLessThan(0.99);
  });
});

describe('live parameter changes', () => {
  it('a potentiometer change retunes the oscillator to the new analytic frequency', () => {
    const solver = new MNASolver(registry());
    solver.loadCircuit([
      ...supply(),
      comp('rfix', 'resistor', twoPin, { resistance: 10000 }),
      comp('pot', 'potentiometer', [['a', 'bidirectional'], ['w', 'bidirectional'], ['b', 'bidirectional']],
        { maxResistance: 100000, position: 0.5 }),
      comp('c', 'capacitor', twoPin, { capacitance: 100e-9 }),
      comp('ic', 'cd40106', icPins),
      comp('out', 'audio-output', [['in', 'input']]),
    ], [
      wire('pwr', 'neg', 'gnd', 'gnd'), wire('pwr', 'pos', 'ic', 'p12'), wire('gnd', 'gnd', 'ic', 'p13'),
      wire('rfix', 'a', 'ic', 'p0'), wire('rfix', 'b', 'pot', 'a'), wire('pot', 'w', 'ic', 'p6'),
      wire('c', 'a', 'ic', 'p0'), wire('c', 'b', 'gnd', 'gnd'),
      wire('ic', 'p6', 'out', 'in'),
    ]);
    const before = measureFrequency(render(solver, 0.5));
    expect(Math.abs(before / expectedFrequency(10000 + 50000) - 1)).toBeLessThan(1e-3);

    solver.updateParam('pot', 'position', 0.2);
    const after = measureFrequency(render(solver, 0.5));
    expect(Math.abs(after / expectedFrequency(10000 + 20000) - 1)).toBeLessThan(1e-3);
  });
});

describe('probes', () => {
  it('report node voltages aligned with the audio stream', () => {
    const solver = new MNASolver(registry());
    solver.loadCircuit([
      ...supply(),
      comp('r1', 'resistor', twoPin, { resistance: 10000 }),
      comp('r2', 'resistor', twoPin, { resistance: 20000 }),
    ], [
      wire('pwr', 'neg', 'gnd', 'gnd'), wire('pwr', 'pos', 'r1', 'a'),
      wire('r1', 'b', 'r2', 'a'), wire('r2', 'b', 'gnd', 'gnd'),
    ]);
    solver.setProbes([{ componentId: 'r1', pinId: 'b' }, { componentId: 'pwr', pinId: 'pos' }]);
    for (let i = 0; i < 100; i++) solver.step(DT);
    expect(solver.getProbeSample(0)).toBeCloseTo(6, 6);
    expect(solver.getProbeSample(1)).toBeCloseTo(9, 6);
    expect(solver.getProbeSample(5)).toBe(0);
  });

  it('show a square wave at the oscillator frequency with full rail-to-rail swing', () => {
    const solver = oscillator(10000);
    solver.setProbes([{ componentId: 'ic', pinId: 'p6' }]);
    for (let i = 0; i < SR / 4; i++) solver.step(DT);
    const trace = new Float64Array(SR / 2);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < trace.length; i++) {
      solver.step(DT);
      const v = solver.getProbeSample(0);
      trace[i] = v - 4.5;
      min = Math.min(min, v); max = Math.max(max, v);
    }
    // Probes are raw node voltages, not the band-limited audio: no overshoot
    expect(min).toBeGreaterThan(0);
    expect(max).toBeLessThan(9);
    expect(max - min).toBeGreaterThan(8.5);
    expect(Math.abs(measureFrequency(trace) / expectedFrequency(10000) - 1)).toBeLessThan(2e-3);
  });
});

describe('op-amp', () => {
  // Open loop, so the output direction depends on the input polarity
  function comparator(vPlusDivider: [number, number], vMinusDivider: [number, number]) {
    const solver = new MNASolver(registry());
    solver.loadCircuit([
      ...supply(),
      comp('pa', 'resistor', twoPin, { resistance: vPlusDivider[0] }),
      comp('pb', 'resistor', twoPin, { resistance: vPlusDivider[1] }),
      comp('ma', 'resistor', twoPin, { resistance: vMinusDivider[0] }),
      comp('mb', 'resistor', twoPin, { resistance: vMinusDivider[1] }),
      comp('op', 'lm741', [['inm', 'input'], ['inp', 'input'], ['vneg', 'power'], ['out', 'output'], ['vpos', 'power']]),
      comp('load', 'resistor', twoPin, { resistance: 10000 }),
    ], [
      wire('pwr', 'neg', 'gnd', 'gnd'), wire('pwr', 'pos', 'op', 'vpos'), wire('gnd', 'gnd', 'op', 'vneg'),
      wire('pwr', 'pos', 'pa', 'a'), wire('pa', 'b', 'pb', 'a'), wire('pb', 'b', 'gnd', 'gnd'), wire('pa', 'b', 'op', 'inp'),
      wire('pwr', 'pos', 'ma', 'a'), wire('ma', 'b', 'mb', 'a'), wire('mb', 'b', 'gnd', 'gnd'), wire('ma', 'b', 'op', 'inm'),
      wire('op', 'out', 'load', 'a'), wire('load', 'b', 'gnd', 'gnd'),
    ]);
    for (let i = 0; i < 200; i++) solver.step(DT);
    return solver.getNodeVoltageByPin('op', 'out');
  }

  it('drives the output high when IN+ is above IN-', () => {
    expect(comparator([10000, 20000], [20000, 10000])).toBeGreaterThan(7);
  });

  it('drives the output low when IN+ is below IN-', () => {
    expect(comparator([20000, 10000], [10000, 20000])).toBeLessThan(2);
  });
});

describe('nonlinear circuits', () => {
  it('converges to a solution that satisfies the diode equation', () => {
    const solver = new MNASolver(registry());
    solver.loadCircuit([
      ...supply(),
      comp('r', 'resistor', twoPin, { resistance: 1000 }),
      comp('led', 'led', [['a', 'bidirectional'], ['k', 'bidirectional']]),
    ], [
      wire('pwr', 'neg', 'gnd', 'gnd'), wire('pwr', 'pos', 'r', 'a'),
      wire('r', 'b', 'led', 'a'), wire('led', 'k', 'gnd', 'gnd'),
    ]);
    for (let i = 0; i < 2000; i++) solver.step(DT);
    const vLed = solver.getNodeVoltageByPin('led', 'a');
    const iResistor = (9 - vLed) / 1000;
    const iDiode = 1e-20 * (Math.exp(vLed / (2 * 0.02585)) - 1);
    expect(vLed).toBeGreaterThan(1.5);
    expect(vLed).toBeLessThan(2.5);
    expect(Math.abs(iDiode / iResistor - 1)).toBeLessThan(0.01);
    const model = solver.getModel('led') as DiodeModel;
    expect(model.isLit()).toBe(true);
  });
});

describe('starting state', () => {
  it('begins at the DC operating point: a decoupled bias rail is already settled', () => {
    const solver = new MNASolver(registry());
    solver.loadCircuit([
      ...supply(),
      comp('r1', 'resistor', twoPin, { resistance: 100e3 }),
      comp('r2', 'resistor', twoPin, { resistance: 100e3 }),
      comp('c', 'capacitor', twoPin, { capacitance: 220e-6 }),   // 11 s time constant
    ], [
      wire('pwr', 'neg', 'gnd', 'gnd'), wire('pwr', 'pos', 'r1', 'a'), wire('r1', 'b', 'r2', 'a'),
      wire('r2', 'b', 'gnd', 'gnd'), wire('r1', 'b', 'c', 'a'), wire('c', 'b', 'gnd', 'gnd'),
    ]);
    expect(solver.getNodeVoltageByPin('c', 'a')).toBeCloseTo(4.5, 6);
    for (let i = 0; i < 100; i++) solver.step(DT);
    expect(solver.getNodeVoltageByPin('c', 'a')).toBeCloseTo(4.5, 6);
  });

  it('a coupling capacitor into the jack blocks DC, with no start-up thump', () => {
    const solver = new MNASolver(registry());
    solver.loadCircuit([
      ...supply(),
      comp('c', 'capacitor', twoPin, { capacitance: 1e-6 }),
      comp('out', 'audio-output', [['in', 'input']]),
    ], [
      wire('pwr', 'neg', 'gnd', 'gnd'), wire('pwr', 'pos', 'c', 'a'), wire('c', 'b', 'out', 'in'),
    ]);
    // The jack's input resistance holds its side of the capacitor at ground
    expect(solver.getNodeVoltageByPin('out', 'in')).toBeCloseTo(0, 6);
    for (let i = 0; i < 2000; i++) expect(Math.abs(solver.step(DT))).toBeLessThan(1e-6);
  });

  it('an oscillator wired straight to the jack settles to a centred waveform', () => {
    // A square wave has no DC operating point to start from, so the output
    // DC blocker has to find its centre; after that it sits at ±0.5.
    const solver = oscillator(29200);
    for (let i = 0; i < SR / 2; i++) solver.step(DT);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 4800; i++) { const v = solver.step(DT); min = Math.min(min, v); max = Math.max(max, v); }
    expect(max).toBeLessThan(0.75);
    expect(min).toBeGreaterThan(-0.75);
    expect(Math.abs(max + min)).toBeLessThan(0.1);
  });

  it('applies the jack input trim to the recorded level only', () => {
    const full = oscillator(29200), half = oscillator(29200);
    half.updateParam('out', 'gain', 0.5);
    for (let i = 0; i < SR / 2; i++) { full.step(DT); half.step(DT); }
    let a = 0, b = 0;
    for (let i = 0; i < 4800; i++) { a = Math.max(a, Math.abs(full.step(DT))); b = Math.max(b, Math.abs(half.step(DT))); }
    expect(b / a).toBeCloseTo(0.5, 3);
    expect(half.getNodeVoltageByPin('ic', 'p6')).toBeCloseTo(full.getNodeVoltageByPin('ic', 'p6'), 9);
  });
});

describe('robustness', () => {
  it('a gate wired straight back to its own input stays finite and bounded in work', () => {
    const solver = new MNASolver(registry());
    solver.loadCircuit([
      ...supply(),
      comp('ic', 'cd40106', icPins),
      comp('out', 'audio-output', [['in', 'input']]),
    ], [
      wire('pwr', 'neg', 'gnd', 'gnd'), wire('pwr', 'pos', 'ic', 'p12'), wire('gnd', 'gnd', 'ic', 'p13'),
      wire('ic', 'p6', 'ic', 'p0'), wire('ic', 'p6', 'out', 'in'),
    ]);
    const start = performance.now();
    let finite = true;
    for (let i = 0; i < SR / 10; i++) {
      if (!Number.isFinite(solver.step(DT))) finite = false;
    }
    expect(finite).toBe(true);
    // 0.1s of audio; without the per-sample event cap this never returns
    expect(performance.now() - start).toBeLessThan(5000);
  });

  it('an empty circuit produces silence', () => {
    const solver = new MNASolver(registry());
    solver.loadCircuit([], []);
    expect(solver.step(DT)).toBe(0);
  });

  it('resetState restarts the oscillator from the same initial conditions', () => {
    const solver = oscillator(10000);
    const first = Array.from({ length: 500 }, () => solver.step(DT));
    solver.resetState();
    const second = Array.from({ length: 500 }, () => solver.step(DT));
    expect(second).toEqual(first);
  });
});
