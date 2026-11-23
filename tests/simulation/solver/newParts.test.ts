/**
 * The parts added for bending — the 555, CD4093, the two counters, the LM386,
 * the light-dependent resistor, body contacts, the push button and the
 * speaker — each wired into a small circuit and run through the solver.
 */
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { createStandardModels } from '@/simulation/models/standardModels';
import { ldrOhms, touchOhms } from '@/simulation/models/VariableResistorModel';
import { starveOhms } from '@/simulation/models/PowerSourceModel';
import type { BinaryCounterModel, DecadeCounterModel } from '@/simulation/models/CmosChipModel';

const SR = 48000;
const DT = 1 / SR;

type Params = Record<string, number | string | boolean>;
const comp = (id: string, type: string, pins: string[], parameters: Params = {}) =>
  ({ id, type, pins: pins.map((pid) => ({ id: pid, label: pid, type: 'bidirectional' })), parameters });
const wire = (from: string, to: string) => {
  const [fc, fp] = from.split('.'), [tc, tp] = to.split('.');
  return { id: `${from}-${to}`, from: { componentId: fc, pinId: fp }, to: { componentId: tc, pinId: tp } };
};
const res = (id: string, resistance: number) => comp(id, 'resistor', ['a', 'b'], { resistance });
const cap = (id: string, capacitance: number) => comp(id, 'capacitor', ['a', 'b'], { capacitance });
const supply = (voltage = 9, extra: Params = {}) => [
  comp('pwr', 'power', ['pos', 'neg'], { voltage, ...extra }),
  comp('gnd', 'ground', ['gnd']),
];
const jack = (id = 'jack') => comp(id, 'audio-output', ['in']);
const GROUNDED = wire('pwr.neg', 'gnd.gnd');

const PINS = {
  ne555: ['trig', 'thres', 'reset', 'ctrl', 'disch', 'out', 'vcc', 'gnd'],
  cd40106: [...Array.from({ length: 6 }, (_, i) => `a${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `y${i + 1}`), 'vdd', 'vss'],
  cd4093: ['a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'a4', 'b4', 'y1', 'y2', 'y3', 'y4', 'vdd', 'vss'],
  cd4040: ['clk', 'rst', ...Array.from({ length: 12 }, (_, i) => `q${i + 1}`), 'vdd', 'vss'],
  cd4017: ['clk', 'inh', 'rst', ...Array.from({ length: 10 }, (_, i) => `q${i}`), 'co', 'vdd', 'vss'],
  lm386: ['inm', 'inp', 'gnd', 'out', 'vs'],
};
const chip = (id: string, type: keyof typeof PINS, parameters: Params = {}) => comp(id, type, PINS[type], parameters);

function build(components: ReturnType<typeof comp>[], wires: ReturnType<typeof wire>[]) {
  const solver = new MNASolver(createStandardModels());
  solver.loadCircuit(components as never, [GROUNDED, ...wires] as never);
  return solver;
}
const run = (solver: MNASolver, seconds: number) => {
  const out = new Float64Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = solver.step(DT);
  return out;
};
const volts = (solver: MNASolver, pin: string) => {
  const [c, p] = pin.split('.');
  return solver.getNodeVoltageByPin(c, p);
};
/** Frequency of the audio output, from its rising zero crossings. */
function frequency(samples: Float64Array): number {
  let first = -1, last = -1, count = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) {
      const t = i - 1 + samples[i - 1] / (samples[i - 1] - samples[i]);
      if (first < 0) first = t;
      last = t;
      count++;
    }
  }
  return count < 2 ? 0 : ((count - 1) / (last - first)) * SR;
}
const peak = (samples: Float64Array) => samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
/** The audible frequency at `pin`: a jack is put on it and the circuit run. */
function pitchAt(pin: string, components: ReturnType<typeof comp>[], wires: ReturnType<typeof wire>[], seconds = 0.5) {
  const solver = build([...components, jack()], [...wires, wire(pin, 'jack.in')]);
  run(solver, 0.1);
  return frequency(run(solver, seconds));
}

/** A CD40106 oscillator on gate 1: `osc.y1` is its output. */
const oscillator = (r = 10e3, c = 10e-9) => ({
  parts: [chip('osc', 'cd40106'), res('oscR', r), cap('oscC', c)],
  wires: [
    wire('osc.vdd', 'pwr.pos'), wire('osc.vss', 'gnd.gnd'),
    wire('osc.y1', 'oscR.a'), wire('oscR.b', 'osc.a1'), wire('osc.a1', 'oscC.a'), wire('oscC.b', 'gnd.gnd'),
  ],
});
/** Frequency of a Schmitt RC oscillator with the model's thresholds and 280 Ω output. */
const schmittHz = (r: number, c: number) => 1 / ((r + 280) * c * Math.log((0.59 / 0.40) * ((1 - 0.40) / (1 - 0.59))));

describe('NE555', () => {
  /** The textbook astable: RA from VCC to DISCH, RB from DISCH to the capacitor, TRIG and THRES on the capacitor. */
  const astable = (ra: number, rb: number, c: number, more: ReturnType<typeof wire>[] = [wire('t.reset', 'pwr.pos')]) => ({
    parts: [...supply(), chip('t', 'ne555'), res('ra', ra), res('rb', rb), cap('c', c)],
    wires: [
      wire('t.vcc', 'pwr.pos'), wire('t.gnd', 'gnd.gnd'),
      wire('ra.a', 'pwr.pos'), wire('ra.b', 't.disch'), wire('rb.a', 't.disch'), wire('rb.b', 't.thres'),
      wire('t.trig', 't.thres'), wire('c.a', 't.thres'), wire('c.b', 'gnd.gnd'), ...more,
    ],
  });

  it.each([
    [10e3, 47e3, 10e-9],
    [10e3, 100e3, 4.7e-9],
    [22e3, 22e3, 100e-9],
  ])('oscillates at 1.44 / ((RA + 2·RB)·C) with RA %d, RB %d, C %d', (ra, rb, c) => {
    const { parts, wires } = astable(ra, rb, c);
    const expected = 1 / (Math.LN2 * (ra + 2 * rb) * c);
    expect(pitchAt('t.out', parts, wires) / expected).toBeCloseTo(1, 2);
  });

  it('runs a little slow with a small RA, which the discharge transistor cannot pull all the way down', () => {
    // 1 kΩ from 9 V into the 20 Ω transistor leaves 0.18 V on DISCH: the capacitor empties towards that
    const { parts, wires } = astable(1e3, 100e3, 4.7e-9);
    const low = 9 * 20 / 1020;
    const expected = 1 / ((101e3 * Math.LN2 + 100e3 * Math.log((6 - low) / (3 - low))) * 4.7e-9);
    expect(pitchAt('t.out', parts, wires) / expected).toBeCloseTo(1, 2);
  });

  it('swings its output from near ground to two diode drops below the supply', () => {
    const { parts, wires } = astable(10e3, 47e3, 100e-9);
    const solver = build(parts, wires);
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < SR * 0.1; i++) {
      solver.step(DT);
      const v = volts(solver, 't.out');
      low = Math.min(low, v); high = Math.max(high, v);
    }
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBeLessThan(0.1);
    expect(high).toBeCloseTo(9 - 1.3, 1);
  });

  it('holds its control pin at two thirds of the supply', () => {
    const { parts, wires } = astable(10e3, 47e3, 10e-9);
    expect(volts(build(parts, wires), 't.ctrl')).toBeCloseTo(6, 2);
  });

  it('runs with RESET left open, and stops with its output low when RESET is grounded', () => {
    const open = astable(10e3, 47e3, 10e-9, []);
    expect(pitchAt('t.out', open.parts, open.wires)).toBeGreaterThan(1000);
    const held = astable(10e3, 47e3, 10e-9, [wire('t.reset', 'gnd.gnd')]);
    const solver = build(held.parts, held.wires);
    run(solver, 0.05);
    expect(volts(solver, 't.out')).toBeLessThan(0.1);
    expect(peak(run(build([...held.parts, jack()], [...held.wires, wire('t.out', 'jack.in')]), 0.1).subarray(2400))).toBeLessThan(1e-3);
  });

  it('drops in pitch when a resistor pulls its control pin down, as the bend does', () => {
    const plain = astable(10e3, 47e3, 10e-9);
    const bent = astable(10e3, 47e3, 10e-9, [wire('t.reset', 'pwr.pos'), wire('pull.a', 't.ctrl'), wire('pull.b', 'pwr.pos')]);
    const f0 = pitchAt('t.out', plain.parts, plain.wires);
    const f1 = pitchAt('t.out', [...bent.parts, res('pull', 4.7e3)], bent.wires);
    expect(f1).toBeLessThan(f0 * 0.8); // a higher control voltage: longer to charge to it
  });
});

describe('CD4093', () => {
  /** A gated oscillator on gate 1: input A is the enable, input B the RC feedback. */
  const gated = (enable: string | null) => ({
    parts: [...supply(), chip('u', 'cd4093'), res('r', 22e3), cap('c', 10e-9)],
    wires: [
      wire('u.vdd', 'pwr.pos'), wire('u.vss', 'gnd.gnd'),
      wire('u.y1', 'r.a'), wire('r.b', 'u.b1'), wire('c.a', 'u.b1'), wire('c.b', 'gnd.gnd'),
      ...(enable ? [wire('u.a1', enable)] : []),
    ],
  });

  it('oscillates like a Schmitt inverter while its other input is high', () => {
    const { parts, wires } = gated('pwr.pos');
    expect(pitchAt('u.y1', parts, wires) / schmittHz(22e3, 10e-9)).toBeCloseTo(1, 2);
  });

  it('is silent, output high, while its other input is low', () => {
    const { parts, wires } = gated('gnd.gnd');
    const solver = build(parts, wires);
    run(solver, 0.05);
    expect(volts(solver, 'u.y1')).toBeCloseTo(9, 2);
    expect(pitchAt('u.y1', parts, wires)).toBe(0);
  });

  it('reads an unwired input as low', () => {
    const { parts, wires } = gated(null);
    expect(pitchAt('u.y1', parts, wires)).toBe(0);
  });

  it('starts and stops as the enable input is switched', () => {
    const { parts, wires } = gated('sw.b');
    const solver = build(
      [...parts, comp('sw', 'pushbutton', ['a', 'b'], { closed: 0 }), res('down', 100e3), jack()],
      [...wires, wire('sw.a', 'pwr.pos'), wire('down.a', 'sw.b'), wire('down.b', 'gnd.gnd'), wire('u.y1', 'jack.in')],
    );
    expect(peak(run(solver, 0.1).subarray(2400))).toBeLessThan(1e-3);
    solver.updateParam('sw', 'closed', 1);
    expect(frequency(run(solver, 0.2))).toBeGreaterThan(1000);
    solver.updateParam('sw', 'closed', 0);
    expect(peak(run(solver, 0.2).subarray(4800))).toBeLessThan(1e-3);
  });
});

describe('CD4040', () => {
  const divider = (more: ReturnType<typeof wire>[] = []) => {
    const osc = oscillator();
    return {
      parts: [...supply(), ...osc.parts, chip('div', 'cd4040')],
      wires: [...osc.wires, wire('div.vdd', 'pwr.pos'), wire('div.vss', 'gnd.gnd'), wire('div.clk', 'osc.y1'), ...more],
    };
  };

  it.each([[1, 2], [2, 4], [4, 16], [7, 128]])('divides the clock: Q%d is the clock ÷ %d', (q, by) => {
    const { parts, wires } = divider();
    const clock = pitchAt('osc.y1', parts, wires);
    expect(pitchAt(`div.q${q}`, parts, wires, 1) / (clock / by)).toBeCloseTo(1, 3);
  });

  it('counts falling edges of the clock, one at a time', () => {
    const { parts, wires } = divider([wire('div.q1', 'load.a'), wire('load.b', 'gnd.gnd')]);
    const solver = build([...parts, res('load', 1e6)], wires);
    const counter = solver.getModel('div') as unknown as BinaryCounterModel;
    let previous = counter.getCount(), wasHigh = volts(solver, 'osc.y1') > 4.5, steps = 0;
    for (let i = 0; i < SR * 0.05; i++) {
      solver.step(DT);
      const count = counter.getCount(), high = volts(solver, 'osc.y1') > 4.5;
      if (count !== previous) {
        expect(count).toBe((previous + 1) & 0xfff);
        expect(wasHigh && !high).toBe(true); // the clock has just fallen
        steps++;
      }
      previous = count; wasHigh = high;
    }
    expect(steps).toBeGreaterThan(100);
  });

  it('holds at zero while RESET is high', () => {
    const { parts, wires } = divider([wire('div.rst', 'pwr.pos'), wire('div.q1', 'load.a'), wire('load.b', 'gnd.gnd')]);
    const solver = build([...parts, res('load', 1e6)], wires);
    run(solver, 0.05);
    expect((solver.getModel('div') as unknown as BinaryCounterModel).getCount()).toBe(0);
    expect(volts(solver, 'div.q1')).toBeCloseTo(0, 3);
  });

  it('keeps one matrix per state of the outputs in use, not per count', () => {
    // Only Q1 is wired: the chip has two states as far as the circuit goes
    const { parts, wires } = divider([wire('div.q1', 'load.a'), wire('load.b', 'gnd.gnd')]);
    const solver = build([...parts, res('load', 1e6)], wires);
    const states = new Set<number>();
    const model = solver.getModel('div')!;
    for (let i = 0; i < SR * 0.05; i++) { solver.step(DT); states.add(model.getDiscreteState!()); }
    expect(states.size).toBe(2);
  });
});

describe('CD4017', () => {
  const stepper = (more: ReturnType<typeof wire>[] = []) => {
    const osc = oscillator();
    return {
      parts: [...supply(), ...osc.parts, chip('seq', 'cd4017')],
      wires: [...osc.wires, wire('seq.vdd', 'pwr.pos'), wire('seq.vss', 'gnd.gnd'), wire('seq.clk', 'osc.y1'), ...more],
    };
  };
  const loads = Array.from({ length: 10 }, (_, q) => res(`l${q}`, 1e6));
  const loadWires = loads.flatMap((_, q) => [wire(`seq.q${q}`, `l${q}.a`), wire(`l${q}.b`, 'gnd.gnd')]);

  it('gives each output a tenth of the clock, and the carry too', () => {
    const { parts, wires } = stepper();
    const clock = pitchAt('osc.y1', parts, wires);
    expect(pitchAt('seq.q3', parts, wires, 1) / (clock / 10)).toBeCloseTo(1, 3);
    expect(pitchAt('seq.co', parts, wires, 1) / (clock / 10)).toBeCloseTo(1, 3);
  });

  it('has exactly one output high at a time, in order, stepping on rising edges', () => {
    const { parts, wires } = stepper(loadWires);
    const solver = build([...parts, ...loads], wires);
    const counter = solver.getModel('seq') as unknown as DecadeCounterModel;
    let previous = counter.getCount(), wasHigh = volts(solver, 'osc.y1') > 4.5, steps = 0;
    for (let i = 0; i < SR * 0.05; i++) {
      solver.step(DT);
      const high = Array.from({ length: 10 }, (_, q) => volts(solver, `seq.q${q}`) > 4.5);
      expect(high.filter(Boolean)).toHaveLength(1);
      expect(high.indexOf(true)).toBe(counter.getCount());
      const clockHigh = volts(solver, 'osc.y1') > 4.5;
      if (counter.getCount() !== previous) {
        expect(counter.getCount()).toBe((previous + 1) % 10);
        expect(!wasHigh && clockHigh).toBe(true);
        steps++;
      }
      previous = counter.getCount(); wasHigh = clockHigh;
    }
    expect(steps).toBeGreaterThan(100);
  });

  it('stops while CLOCK INHIBIT is high, and returns to Q0 on RESET', () => {
    const inhibited = stepper([wire('seq.inh', 'pwr.pos'), ...loadWires]);
    const solver = build([...inhibited.parts, ...loads], inhibited.wires);
    run(solver, 0.05);
    expect((solver.getModel('seq') as unknown as DecadeCounterModel).getCount()).toBe(0);

    const reset = stepper([wire('seq.rst', 'q4r.b'), wire('seq.q4', 'q4r.a'), ...loadWires]);
    // Q4 wired back to RESET: it counts 0 1 2 3 and starts again
    const short = build([...reset.parts, ...loads, res('q4r', 1e3)], reset.wires);
    const seen = new Set<number>();
    for (let i = 0; i < SR * 0.05; i++) { short.step(DT); seen.add((short.getModel('seq') as unknown as DecadeCounterModel).getCount()); }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('LM386', () => {
  /** The amplifier with `vin` on its + input (from a second supply, so it can be stepped). */
  const amplifier = (vin: number, parameters: Params = {}, vs = 9) => build(
    [...supply(vs), chip('amp', 'lm386', parameters), comp('sig', 'power', ['pos', 'neg'], { voltage: vin }), res('load', 1e3)],
    [
      wire('amp.vs', 'pwr.pos'), wire('amp.gnd', 'gnd.gnd'), wire('amp.inm', 'gnd.gnd'),
      wire('sig.pos', 'amp.inp'), wire('sig.neg', 'gnd.gnd'), wire('amp.out', 'load.a'), wire('load.b', 'gnd.gnd'),
    ],
  );
  const settled = (solver: MNASolver) => { run(solver, 0.01); return volts(solver, 'amp.out') * 1001 / 1000; }; // undo the 1 Ω output against the 1 kΩ load

  it('idles at half the supply', () => {
    expect(settled(amplifier(0))).toBeCloseTo(4.5, 2);
    expect(settled(amplifier(0, {}, 12))).toBeCloseTo(6, 2);
  });

  it('amplifies by 20 as it comes', () => {
    expect(settled(amplifier(0.05))).toBeCloseTo(4.5 + 1, 2);
    expect(settled(amplifier(-0.1))).toBeCloseTo(4.5 - 2, 2);
  });

  it('amplifies by up to 200 with its gain set', () => {
    expect(settled(amplifier(0.01, { gain: 200 }))).toBeCloseTo(4.5 + 2, 2);
    expect(settled(amplifier(0.01, { gain: 50 }))).toBeCloseTo(4.5 + 0.5, 2);
    expect(settled(amplifier(0.01, { gain: 5000 }))).toBeCloseTo(4.5 + 2, 2); // no further
  });

  it('clips a volt inside each rail', () => {
    expect(settled(amplifier(1))).toBeCloseTo(8, 1);
    expect(settled(amplifier(-1))).toBeCloseTo(1, 1);
  });

  it('follows a change of input within a sample', () => {
    const solver = amplifier(0);
    run(solver, 0.01);
    solver.updateParam('sig', 'voltage', 0.1);
    run(solver, 2 * DT);
    expect(volts(solver, 'amp.out')).toBeCloseTo(6.5, 1);
  });

  it('loads each input with 50 kΩ to ground', () => {
    const solver = build(
      [...supply(), chip('amp', 'lm386'), res('r', 50e3)],
      [wire('amp.vs', 'pwr.pos'), wire('amp.gnd', 'gnd.gnd'), wire('amp.inm', 'gnd.gnd'), wire('r.a', 'pwr.pos'), wire('r.b', 'amp.inp')],
    );
    expect(volts(solver, 'amp.inp')).toBeCloseTo(4.5, 3);
  });
});

describe('light-dependent resistor and body contacts', () => {
  it('follow their curves', () => {
    expect(ldrOhms(0)).toBeCloseTo(1e6);
    expect(ldrOhms(0.5)).toBeCloseTo(31623, 0);
    expect(ldrOhms(1)).toBeCloseTo(1e3);
    expect(ldrOhms(7)).toBeCloseTo(1e3);
    expect(touchOhms(0)).toBe(1e9);
    expect(touchOhms(0.001)).toBeGreaterThan(1.9e6);
    expect(touchOhms(1)).toBeCloseTo(50e3);
    expect(touchOhms(Number.NaN)).toBe(1e9);
  });

  /** The part under test between the supply and a 10 kΩ resistor to ground. */
  const dividerWith = (type: string, parameters: Params) => build(
    [...supply(), comp('x', type, ['a', 'b'], parameters), res('r', 10e3)],
    [wire('x.a', 'pwr.pos'), wire('x.b', 'r.a'), wire('r.b', 'gnd.gnd')],
  );
  const across10k = (ohms: number) => (9 * 10e3) / (10e3 + ohms);

  it('an LDR passes more as the light comes up, without the circuit starting again', () => {
    const solver = dividerWith('ldr', { light: 0 });
    expect(volts(solver, 'r.a')).toBeCloseTo(across10k(1e6), 3);
    for (const light of [0.25, 0.5, 1]) {
      solver.updateParam('x', 'light', light);
      run(solver, 2 * DT);
      expect(volts(solver, 'r.a')).toBeCloseTo(across10k(ldrOhms(light)), 3);
    }
  });

  it('an LDR with nothing said about the light sits half way', () => {
    expect(volts(dividerWith('ldr', {}), 'r.a')).toBeCloseTo(across10k(ldrOhms(0.5)), 3);
  });

  it('body contacts pass nothing until touched, then more the harder they are pressed', () => {
    const solver = dividerWith('body-contact', {});
    expect(volts(solver, 'r.a')).toBeLessThan(1e-3);
    solver.updateParam('x', 'touch', 0.2);
    run(solver, 2 * DT);
    const light = volts(solver, 'r.a');
    solver.updateParam('x', 'touch', 1);
    run(solver, 2 * DT);
    expect(volts(solver, 'r.a')).toBeCloseTo(across10k(50e3), 3);
    expect(light).toBeGreaterThan(0.04);
    expect(light).toBeLessThan(volts(solver, 'r.a'));
    solver.updateParam('x', 'touch', 0);
    run(solver, 2 * DT);
    expect(volts(solver, 'r.a')).toBeLessThan(1e-3);
  });

  it('a finger across an oscillator\'s resistor raises its pitch', () => {
    const osc = oscillator(100e3, 10e-9);
    const solver = build(
      [...supply(), ...osc.parts, comp('finger', 'body-contact', ['a', 'b'], {}), jack()],
      [...osc.wires, wire('finger.a', 'oscR.a'), wire('finger.b', 'oscR.b'), wire('osc.y1', 'jack.in')],
    );
    run(solver, 0.05);
    const untouched = frequency(run(solver, 0.3));
    solver.updateParam('finger', 'touch', 1);
    const pressed = frequency(run(solver, 0.3));
    expect(untouched / schmittHz(100e3, 10e-9)).toBeCloseTo(1, 2);
    expect(pressed / schmittHz(1 / (1 / 100e3 + 1 / 50e3), 10e-9)).toBeCloseTo(1, 2);
  });
});

describe('push button', () => {
  it('connects while it is held', () => {
    const solver = build(
      [...supply(), comp('b', 'pushbutton', ['a', 'b'], { closed: 0 }), res('r', 10e3)],
      [wire('b.a', 'pwr.pos'), wire('b.b', 'r.a'), wire('r.b', 'gnd.gnd')],
    );
    expect(volts(solver, 'r.a')).toBeLessThan(1e-3);
    solver.updateParam('b', 'closed', 1);
    run(solver, 2 * DT);
    expect(volts(solver, 'r.a')).toBeCloseTo(9, 3);
    solver.updateParam('b', 'closed', 0);
    run(solver, 2 * DT);
    expect(volts(solver, 'r.a')).toBeLessThan(1e-3);
  });
});

describe('speaker', () => {
  const coupled = (from: string, more: ReturnType<typeof comp>[], wires: ReturnType<typeof wire>[]) => build(
    [...supply(), ...more, cap('couple', 220e-6), comp('spk', 'speaker', ['pos', 'neg'])],
    [...wires, wire(from, 'couple.a'), wire('couple.b', 'spk.pos'), wire('spk.neg', 'gnd.gnd')],
  );

  it('is an 8 Ω load', () => {
    const solver = build(
      [...supply(), res('r', 8), comp('spk', 'speaker', ['pos', 'neg'])],
      [wire('r.a', 'pwr.pos'), wire('r.b', 'spk.pos'), wire('spk.neg', 'gnd.gnd')],
    );
    expect(volts(solver, 'spk.pos')).toBeCloseTo(4.5, 3);
  });

  /** The oscillator with a second gate to do the driving, so the load cannot stop it. */
  const buffered = () => {
    const osc = oscillator();
    return { parts: osc.parts, wires: [...osc.wires, wire('osc.y1', 'osc.a2')] };
  };

  it('is what is heard: the voltage across it', () => {
    const osc = buffered();
    const solver = coupled('osc.y2', osc.parts, osc.wires);
    run(solver, 0.2);
    const heard = run(solver, 0.2);
    expect(frequency(heard)).toBeGreaterThan(1000);
    // A gate's 280 Ω output into 8 Ω: 8/288 of the swing, about 0.25 V of 9 — barely a whisper
    expect(peak(heard)).toBeGreaterThan(0.005);
    expect(peak(heard)).toBeLessThan(0.03);
  });

  it('is loud with an LM386 in front of it', () => {
    const osc = oscillator();
    const solver = coupled('amp.out', [
      ...osc.parts, chip('amp', 'lm386'), res('top', 100e3), res('bottom', 2.2e3), cap('in', 100e-9),
    ], [
      ...osc.wires, wire('amp.vs', 'pwr.pos'), wire('amp.gnd', 'gnd.gnd'), wire('amp.inm', 'gnd.gnd'),
      // The gate's 9 V swing cut down to about 0.2 V for the amplifier
      wire('osc.y1', 'top.a'), wire('top.b', 'bottom.a'), wire('bottom.b', 'gnd.gnd'), wire('top.b', 'in.a'), wire('in.b', 'amp.inp'),
    ]);
    run(solver, 0.5);
    const heard = run(solver, 0.2);
    expect(frequency(heard)).toBeGreaterThan(1000);
    expect(peak(heard)).toBeGreaterThan(0.15);
  });

  it('stops a gate that has to drive it and keep time as well', () => {
    const osc = oscillator();
    const solver = coupled('osc.y1', osc.parts, osc.wires);
    run(solver, 0.2);
    expect(frequency(run(solver, 0.5))).toBeLessThan(100); // 8 Ω on a 280 Ω output: it crawls
  });

  it('is heard along with a jack', () => {
    const osc = buffered();
    const both = coupled('osc.y2', [...osc.parts, jack()], [...osc.wires, wire('osc.y1', 'jack.in')]);
    const jackOnly = build([...supply(), ...osc.parts, jack()], [...osc.wires, wire('osc.y1', 'jack.in')]);
    run(both, 0.3); run(jackOnly, 0.3);
    expect(peak(run(both, 0.1))).toBeGreaterThan(0.3);
    expect(peak(run(jackOnly, 0.1))).toBeGreaterThan(0.4);
  });
});

describe('starving the supply', () => {
  it('puts nothing in series at rest and a decade more for each quarter turn', () => {
    expect(starveOhms(0)).toBe(0);
    expect(starveOhms(0.25)).toBeCloseTo(900, -1);
    expect(starveOhms(0.5)).toBeCloseTo(9901, -1);
    expect(starveOhms(0.75)).toBeCloseTo(99910, -2);
    expect(starveOhms(1)).toBeCloseTo(1e6);
    expect(starveOhms(-3)).toBe(0);
    expect(starveOhms(Number.NaN)).toBe(0);
  });

  it('sags the supply by what the circuit draws through it', () => {
    const solver = build([...supply(9, { starve: 0.5 }), res('load', 10e3)], [wire('load.a', 'pwr.pos'), wire('load.b', 'gnd.gnd')]);
    expect(volts(solver, 'pwr.pos')).toBeCloseTo(9 * 10e3 / (10e3 + starveOhms(0.5)), 3);
    solver.updateParam('pwr', 'starve', 0);
    run(solver, 2 * DT);
    expect(volts(solver, 'pwr.pos')).toBeCloseTo(9, 6);
  });

  it('leaves a circuit exactly as it was when the knob is at rest', () => {
    const osc = oscillator();
    const plain = build([...supply(), ...osc.parts, jack()], [...osc.wires, wire('osc.y1', 'jack.in')]);
    const atRest = build([...supply(9, { starve: 0 }), ...osc.parts, jack()], [...osc.wires, wire('osc.y1', 'jack.in')]);
    expect([...run(atRest, 0.05)]).toEqual([...run(plain, 0.05)]);
  });

  it('sags the rail an oscillator runs from, and its sound with it', () => {
    const osc = oscillator(27e3, 100e-9);
    const solver = build([...supply(), ...osc.parts, jack()], [...osc.wires, wire('osc.y1', 'jack.in')]);
    run(solver, 0.1);
    const heard = [0, 0.5, 0.75, 1].map((starve) => {
      solver.updateParam('pwr', 'starve', starve);
      run(solver, 0.5);
      let rail = 0;
      const samples = run(solver, 0.5);
      for (let i = 0; i < 2000; i++) { solver.step(DT); rail += volts(solver, 'pwr.pos') / 2000; }
      return { rail, level: peak(samples), pitch: frequency(samples) };
    });
    expect(heard[0].rail).toBeCloseTo(9, 6);
    expect(heard[0].pitch / schmittHz(27e3, 100e-9)).toBeCloseTo(1, 2);
    for (let i = 1; i < heard.length; i++) {
      expect(heard[i].rail).toBeLessThan(heard[i - 1].rail);
      expect(heard[i].level).toBeLessThan(heard[i - 1].level);
      // Quieter, but it keeps going, and higher: the rail dips each time the
      // gate charges the capacitor, and the thresholds dip with it
      expect(heard[i].pitch).toBeGreaterThan(heard[0].pitch * 1.1);
    }
    expect(heard[3].rail).toBeLessThan(2);
    expect(heard[3].level).toBeLessThan(heard[0].level / 5);
    // and comes all the way back
    solver.updateParam('pwr', 'starve', 0);
    run(solver, 0.1);
    expect(frequency(run(solver, 0.5)) / heard[0].pitch).toBeCloseTo(1, 3);
  });

  it('lets two oscillators on a starved rail pull on each other', () => {
    // The second oscillator is never heard directly: only through what it does to the supply
    const first = oscillator(27e3, 100e-9);
    const parts = [...supply(), ...first.parts, res('r2', 33e3), cap('c2', 220e-9), jack()];
    const wires = [
      ...first.wires, wire('osc.y1', 'jack.in'),
      wire('osc.y2', 'r2.a'), wire('r2.b', 'osc.a2'), wire('osc.a2', 'c2.a'), wire('c2.b', 'gnd.gnd'),
    ];
    /** How much the first oscillator's period wanders, as a fraction of it. */
    const wander = (starve: number) => {
      const solver = build(parts, wires);
      solver.updateParam('pwr', 'starve', starve);
      run(solver, 0.5);
      const samples = run(solver, 1);
      const periods: number[] = [];
      let last = -1;
      for (let i = 1; i < samples.length; i++) {
        if (samples[i - 1] < 0 && samples[i] >= 0) {
          const t = i - 1 + samples[i - 1] / (samples[i - 1] - samples[i]);
          if (last >= 0) periods.push(t - last);
          last = t;
        }
      }
      const mean = periods.reduce((a, b) => a + b, 0) / periods.length;
      return (Math.max(...periods) - Math.min(...periods)) / mean;
    };
    expect(wander(0)).toBeLessThan(0.005);
    expect(wander(0.75)).toBeGreaterThan(0.1);
  });

  it('collapses the rail of something that draws milliamps within the first quarter turn', () => {
    const solver = build([...supply(9, { starve: 0.25 }), chip('amp', 'lm386')], [wire('amp.vs', 'pwr.pos'), wire('amp.gnd', 'gnd.gnd')]);
    expect(volts(solver, 'pwr.pos')).toBeLessThan(7);
    expect(volts(solver, 'pwr.pos')).toBeGreaterThan(5);
  });
});

describe('a bend', () => {
  /** Two dividers side by side: `a.b` sits at 6 V and `c.b` at 3 V. */
  const twoDividers = () => build(
    [...supply(), res('a', 10e3), res('b', 20e3), res('c', 20e3), res('d', 10e3)],
    [wire('a.a', 'pwr.pos'), wire('a.b', 'b.a'), wire('b.b', 'gnd.gnd'), wire('c.a', 'pwr.pos'), wire('c.b', 'd.a'), wire('d.b', 'gnd.gnd')],
  );
  const at = (componentId: string, pinId: string) => ({ componentId, pinId });

  it('joins two points while it is held and lets them go again', () => {
    const solver = twoDividers();
    expect(volts(solver, 'a.b')).toBeCloseTo(6, 6);
    expect(volts(solver, 'c.b')).toBeCloseTo(3, 6);
    expect(solver.setBend(at('a', 'b'), at('c', 'b'))).toBe(true);
    run(solver, 2 * DT);
    expect(volts(solver, 'a.b')).toBeCloseTo(4.5, 2);
    expect(volts(solver, 'c.b')).toBeCloseTo(4.5, 2);
    expect(solver.setBend(null, null)).toBe(false);
    run(solver, 2 * DT);
    expect(volts(solver, 'a.b')).toBeCloseTo(6, 6);
    expect(volts(solver, 'c.b')).toBeCloseTo(3, 6);
  });

  it('can be made through a resistance', () => {
    const solver = twoDividers();
    solver.setBend(at('a', 'b'), at('c', 'b'), 10e3);
    run(solver, 2 * DT);
    // 6 V behind 6.67 kΩ and 3 V behind 6.67 kΩ, joined by 10 kΩ
    const i = 3 / (2 * (20e3 / 3) + 10e3);
    expect(volts(solver, 'a.b')).toBeCloseTo(6 - i * (20e3 / 3), 4);
  });

  it('can go to ground or to the supply', () => {
    const solver = twoDividers();
    solver.setBend(at('a', 'b'), at('gnd', 'gnd'));
    run(solver, 2 * DT);
    expect(volts(solver, 'a.b')).toBeCloseTo(0, 2);
    solver.setBend(at('a', 'b'), at('pwr', 'pos'));
    run(solver, 2 * DT);
    expect(volts(solver, 'a.b')).toBeCloseTo(9, 2);
  });

  it('does nothing between two points that are already joined, or to a pin that does not exist', () => {
    const solver = twoDividers();
    expect(solver.setBend(at('a', 'b'), at('b', 'a'))).toBe(false);
    expect(solver.setBend(at('a', 'b'), at('nothing', 'here'))).toBe(false);
    expect(solver.setBend(at('gnd', 'gnd'), at('b', 'b'))).toBe(false);
    run(solver, 2 * DT);
    expect(volts(solver, 'a.b')).toBeCloseTo(6, 6);
  });

  it('does not connect to an unused pin of a chip, which is nowhere', () => {
    const osc = oscillator();
    const solver = build([...supply(), ...osc.parts], osc.wires);
    expect(solver.setBend(at('osc', 'a1'), at('osc', 'y4'))).toBe(false);
    expect(solver.setBend(at('osc', 'a4'), at('pwr', 'pos'))).toBe(false);
  });

  it('is heard at once and leaves the circuit running: a capacitor keeps its charge', () => {
    const osc = oscillator(27e3, 100e-9);
    const solver = build([...supply(), ...osc.parts, res('extra', 10e3), jack()], [
      ...osc.wires, wire('osc.y1', 'jack.in'), wire('extra.a', 'osc.a1'),
    ]);
    run(solver, 0.1);
    const before = frequency(run(solver, 0.3));
    // Bend the spare resistor across the oscillator's own: it runs faster
    const vCap = volts(solver, 'oscC.a');
    solver.setBend(at('extra', 'b'), at('osc', 'y1'), 0);
    solver.step(DT);
    expect(Math.abs(volts(solver, 'oscC.a') - vCap)).toBeLessThan(0.5);
    const bent = frequency(run(solver, 0.3));
    solver.setBend(null, null);
    const after = frequency(run(solver, 0.3));
    expect(bent / schmittHz(1 / (1 / 27e3 + 1 / 10e3), 100e-9)).toBeCloseTo(1, 1);
    expect(after / before).toBeCloseTo(1, 2);
  });

  it('is gone when the circuit is loaded again', () => {
    const solver = twoDividers();
    solver.setBend(at('a', 'b'), at('c', 'b'));
    solver.resetState();
    expect(volts(solver, 'a.b')).toBeCloseTo(4.5, 2); // stopping and starting keeps it
    const fresh = twoDividers();
    expect(volts(fresh, 'a.b')).toBeCloseTo(6, 6);
  });
});
