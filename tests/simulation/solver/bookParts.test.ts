/**
 * The parts added so that the circuits in the two books can be built
 * (Nicolas Collins, Handmade Electronic Music; Ray Wilson, Make: Analog
 * Synthesizers), each wired the way the books wire it and run through the
 * solver. Where a book gives a figure, the figure is checked.
 */
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { createStandardModels } from '@/simulation/models/standardModels';
import { optoOhms } from '@/simulation/models/OptoCouplerModel';
import { SIGNAL_WAVES } from '@/simulation/models/SignalSourceModel';

const SR = 48000;
const DT = 1 / SR;

type Params = Record<string, number | string | boolean>;
const comp = (id: string, type: string, pins: string[], parameters: Params = {}) =>
  ({ id, type, pins: pins.map((pid) => ({ id: pid, label: pid, type: 'bidirectional' })), parameters });
type Part = ReturnType<typeof comp>;
const wire = (from: string, to: string) => {
  const [fc, fp] = from.split('.'), [tc, tp] = to.split('.');
  return { id: `${from}-${to}`, from: { componentId: fc, pinId: fp }, to: { componentId: tc, pinId: tp } };
};
type Wire = ReturnType<typeof wire>;
const res = (id: string, resistance: number) => comp(id, 'resistor', ['a', 'b'], { resistance });
const cap = (id: string, capacitance: number) => comp(id, 'capacitor', ['a', 'b'], { capacitance });
/** A 9 V battery with its − on ground. */
const supply = (voltage = 9) => [comp('pwr', 'power', ['pos', 'neg'], { voltage }), comp('gnd', 'ground', ['gnd'])];
/** A second battery under the first, its + on ground: `neg.neg` is the negative rail. */
const negative = (voltage = 9) => comp('neg', 'power', ['pos', 'neg'], { voltage });
const NEGATIVE = wire('neg.pos', 'gnd.gnd');
const wave = (name: typeof SIGNAL_WAVES[number]) => SIGNAL_WAVES.indexOf(name);
const source = (id: string, name: typeof SIGNAL_WAVES[number], frequency: number, volts: number, level = 1) =>
  comp(id, 'audio-input', ['out'], { wave: wave(name), frequency, volts, level });

const six = [1, 2, 3, 4, 5, 6];
const PINS: Record<string, string[]> = {
  cd40106: [...six.map((i) => `a${i}`), ...six.map((i) => `y${i}`), 'vdd', 'vss'],
  cd4049: [...six.map((i) => `a${i}`), ...six.map((i) => `y${i}`), 'vdd', 'vss'],
  cd4040: ['clk', 'rst', ...Array.from({ length: 12 }, (_, i) => `q${i + 1}`), 'vdd', 'vss'],
  cd4013: ['d1', 'clk1', 'set1', 'rst1', 'd2', 'clk2', 'set2', 'rst2', 'q1', 'nq1', 'q2', 'nq2', 'vdd', 'vss'],
  lm324: [...[1, 2, 3, 4].flatMap((i) => [`m${i}`, `p${i}`, `o${i}`]), 'vp', 'vm'],
  tl072: [...[1, 2].flatMap((i) => [`m${i}`, `p${i}`, `o${i}`]), 'vp', 'vm'],
  lm13700: [...[1, 2].flatMap((i) => [`p${i}`, `m${i}`, `d${i}`, `abc${i}`, `out${i}`, `bin${i}`, `bout${i}`]), 'vp', 'vm'],
  '2n3904': ['b', 'c', 'e'], '2n3906': ['b', 'c', 'e'], '2n5457': ['g', 'd', 's'],
  spdt: ['com', 'a', 'b'], optocoupler: ['a', 'k', 'c1', 'c2'], piezo: ['pos', 'neg'], '1n4004': ['a', 'k'],
};
const part = (id: string, type: string, parameters: Params = {}) => comp(id, type, PINS[type], parameters);

function build(components: Part[], wires: Wire[]) {
  const solver = new MNASolver(createStandardModels());
  solver.loadCircuit(components as never, [wire('pwr.neg', 'gnd.gnd'), ...wires] as never);
  return solver;
}
const volts = (solver: MNASolver, pin: string) => {
  const [c, p] = pin.split('.');
  return solver.getNodeVoltageByPin(c, p);
};
/** The voltage at `pin` for `seconds`, a reading per audio sample. */
function trace(solver: MNASolver, pin: string, seconds: number) {
  const out = new Float64Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) { solver.step(DT); out[i] = volts(solver, pin); }
  return out;
}
/** What is heard for `seconds`. */
function listen(solver: MNASolver, seconds: number) {
  const out = new Float64Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = solver.step(DT);
  return out;
}
/** A trace as a meter reads it: its extremes, its middle and how often it rises through the middle. */
function read(x: Float64Array) {
  let lo = Infinity, hi = -Infinity, sum = 0;
  for (const v of x) { lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; }
  const mean = sum / x.length;
  let first = -1, last = -1, count = 0;
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1] < mean && x[i] >= mean) {
      const t = i - 1 + (mean - x[i - 1]) / (x[i] - x[i - 1]);
      if (first < 0) first = t;
      last = t;
      count++;
    }
  }
  return { lo, hi, swing: hi - lo, mean, hertz: count < 2 ? 0 : ((count - 1) / (last - first)) * SR };
}
const at = (x: Float64Array, seconds: number) => x[Math.round(seconds * SR)];

describe('audio in: a signal from outside', () => {
  const into = (name: typeof SIGNAL_WAVES[number], frequency = 220, level = 1) =>
    build([...supply(), source('in', name, frequency, 1, level), res('load', 10e3)], [wire('in.out', 'load.a'), wire('load.b', 'gnd.gnd')]);

  it.each(['sine', 'triangle', 'square', 'saw'] as const)('plays a %s at the pitch and size asked for', (name) => {
    const heard = read(trace(into(name), 'in.out', 0.5));
    expect(heard.hertz).toBeCloseTo(220, 0);
    // 1 V behind 600 Ω, into 10 kΩ
    expect(heard.hi).toBeCloseTo(10 / 10.6, 2);
    expect(heard.lo).toBeCloseTo(-10 / 10.6, 2);
    expect(Math.abs(heard.mean)).toBeLessThan(0.01);
  });

  it('gives a square its edges at the right instants, not on the nearest sample', () => {
    // 1 kHz is 48 samples a cycle, 997 Hz is not a whole number of them
    expect(read(trace(into('square', 997), 'in.out', 1)).hertz).toBeCloseTo(997, 1);
    const square = trace(into('square', 1000), 'in.out', 0.01);
    expect(new Set([...square].map((v) => Math.round(v * 1000))).size).toBe(2); // only ever fully up or fully down
  });

  it('plucks a string again and again, each pluck dying away', () => {
    const string = trace(into('guitar', 110), 'in.out', 3.2);
    const loud = (from: number, to: number) => read(string.subarray(Math.round(from * SR), Math.round(to * SR))).swing;
    expect(loud(0, 0.2)).toBeGreaterThan(1);
    expect(loud(1.2, 1.6)).toBeLessThan(loud(0, 0.2) / 3);
    expect(loud(1.6, 1.8)).toBeGreaterThan(1); // plucked again
    expect(read(string.subarray(0, SR / 2)).hertz).toBeCloseTo(110, 0);
  });

  it('hisses: no pitch, and never twice the same', () => {
    const noise = trace(into('noise'), 'in.out', 0.5);
    const heard = read(noise);
    expect(heard.swing).toBeGreaterThan(1.5);
    expect(heard.hertz).toBeGreaterThan(5000);
    expect(new Set(noise.subarray(0, 1000)).size).toBeGreaterThan(990);
  });

  it('is turned down by its level, and retuned, while it plays', () => {
    const solver = into('sine', 1000);
    trace(solver, 'in.out', 0.05);
    solver.updateParam('in', 'level', 0.25);
    expect(read(trace(solver, 'in.out', 0.05)).hi).toBeCloseTo(0.25 * 10 / 10.6, 2);
    solver.updateParam('in', 'frequency', 500);
    expect(read(trace(solver, 'in.out', 0.2)).hertz).toBeCloseTo(500, 0);
    solver.updateParam('in', 'wave', wave('square'));
    expect(read(trace(solver, 'in.out', 0.2)).hertz).toBeCloseTo(500, 0);
    solver.updateParam('in', 'level', 0);
    expect(read(trace(solver, 'in.out', 0.05)).swing).toBeLessThan(1e-6);
  });

  it('starts silent at the circuit\'s resting point, so nothing thumps', () => {
    const solver = into('sine');
    expect(volts(solver, 'in.out')).toBeCloseTo(0, 6);
  });
});

/**
 * Collins, chapter 21: a CMOS inverter with a resistor from output to input
 * is an amplifier. In by 0.1 µF and 10 kΩ, feedback 100 kΩ or 1 MΩ, out by 10 µF.
 */
describe('CD4049: inverters as amplifiers (Collins)', () => {
  function preamp(feedback: number, inVolts: number, stages = 1, extra: Part[] = [], extraWires: Wire[] = []) {
    const parts = [...supply(), source('in', 'sine', 1000, inVolts), part('u', 'cd4049'), cap('co', 10e-6), res('load', 100e3), ...extra];
    const wires = [wire('u.vdd', 'pwr.pos'), wire('u.vss', 'gnd.gnd'), ...extraWires];
    let from = 'in.out';
    for (let i = 1; i <= stages; i++) {
      parts.push(cap(`ci${i}`, 0.1e-6), res(`ri${i}`, 10e3), res(`rf${i}`, feedback));
      wires.push(wire(from, `ci${i}.a`), wire(`ci${i}.b`, `ri${i}.a`), wire(`ri${i}.b`, `u.a${i}`), wire(`u.a${i}`, `rf${i}.a`), wire(`rf${i}.b`, `u.y${i}`));
      from = `u.y${i}`;
    }
    wires.push(wire(from, 'co.a'), wire('co.b', 'load.a'), wire('load.b', 'gnd.gnd'));
    return build(parts, wires);
  }
  const gain = (feedback: number) => {
    const solver = preamp(feedback, 0.01);
    trace(solver, 'load.a', 0.2);
    return read(trace(solver, 'load.a', 0.05)).swing / 0.02;
  };

  it('biases itself at half the supply', () => {
    const solver = preamp(100e3, 0.01);
    expect(volts(solver, 'u.y1')).toBeCloseTo(4.5, 1);
    expect(volts(solver, 'u.a1')).toBeCloseTo(4.5, 1);
  });

  it('amplifies by something under feedback over input resistor, and more with a bigger feedback resistor', () => {
    const small = gain(100e3), big = gain(1e6);
    // An inverter has a gain of only about 25 to spend, so 100k / 10k gives 7, not 10
    expect(small).toBeGreaterThan(6);
    expect(small).toBeLessThan(10);
    expect(big).toBeGreaterThan(20);
    expect(big).toBeLessThan(35);
  });

  it('turns the signal upside down', () => {
    const solver = preamp(100e3, 0.01);
    trace(solver, 'load.a', 0.2);
    let product = 0;
    for (let i = 0; i < 480; i++) { solver.step(DT); product += volts(solver, 'in.out') * volts(solver, 'load.a'); }
    expect(product).toBeLessThan(0);
  });

  it('clips softly when driven hard: rounder than the rails, and never past them', () => {
    const solver = preamp(1e6, 1);
    trace(solver, 'u.y1', 0.2);
    const out = read(trace(solver, 'u.y1', 0.05));
    expect(out.lo).toBeGreaterThan(0);
    expect(out.hi).toBeLessThan(9);
    expect(out.swing).toBeGreaterThan(6);
    expect(out.swing).toBeLessThan(8.5);
  });

  it('makes a distortion of three in a row: a tenth of a volt comes out a square wave', () => {
    const solver = preamp(1e6, 0.1, 3);
    trace(solver, 'u.y3', 0.2);
    const out = trace(solver, 'u.y3', 0.05);
    const heard = read(out);
    expect(heard.hertz).toBeCloseTo(1000, 0);
    expect(heard.lo).toBeLessThan(0.2);
    expect(heard.hi).toBeGreaterThan(8.8);
    // A square spends its time at the ends, not in between
    const between = [...out].filter((v) => v > 2 && v < 7).length / out.length;
    expect(between).toBeLessThan(0.1);
  });

  it('squares a signal up well enough to clock a divider: the octave below (Collins\' Low Rider)', () => {
    const solver = preamp(1e6, 0.1, 2, [part('div', 'cd4040'), res('q1', 100e3), res('q2', 100e3)], [
      wire('div.vdd', 'pwr.pos'), wire('div.vss', 'gnd.gnd'), wire('div.rst', 'gnd.gnd'), wire('u.y2', 'div.clk'),
      wire('div.q1', 'q1.a'), wire('q1.b', 'gnd.gnd'), wire('div.q2', 'q2.a'), wire('q2.b', 'gnd.gnd'),
    ]);
    trace(solver, 'div.q1', 0.2);
    expect(read(trace(solver, 'div.q1', 0.2)).hertz).toBeCloseTo(500, 0);
    expect(read(trace(solver, 'div.q2', 0.2)).hertz).toBeCloseTo(250, 0);
  });

  it('draws current at rest when biased as an amplifier, as the real one does', () => {
    const solver = build([...supply(), part('u', 'cd4049'), res('rf', 1e6), res('rs', 10)],
      [wire('pwr.pos', 'rs.a'), wire('rs.b', 'u.vdd'), wire('u.vss', 'gnd.gnd'), wire('u.a1', 'rf.a'), wire('rf.b', 'u.y1')]);
    solver.step(DT);
    const milliamps = (9 - volts(solver, 'u.vdd')) / 10 * 1000;
    expect(milliamps).toBeGreaterThan(1);
    expect(milliamps).toBeLessThan(10);
  });

  it('is a plain inverter when used as one', () => {
    const logic = (input: string) => {
      const solver = build([...supply(), part('u', 'cd4049'), res('load', 100e3)],
        [wire('u.vdd', 'pwr.pos'), wire('u.vss', 'gnd.gnd'), wire('u.a1', input), wire('u.y1', 'load.a'), wire('load.b', 'gnd.gnd')]);
      solver.step(DT);
      return volts(solver, 'u.y1');
    };
    expect(logic('gnd.gnd')).toBeGreaterThan(8.9);
    expect(logic('pwr.pos')).toBeLessThan(0.1);
  });
});

describe('changeover switch', () => {
  it('joins its common pin to one throw or the other', () => {
    const solver = build([...supply(), part('sw', 'spdt', { throw: 0 }), res('ra', 1e3), res('rb', 3e3), res('top', 1e3)],
      [wire('pwr.pos', 'top.a'), wire('top.b', 'sw.com'), wire('sw.a', 'ra.a'), wire('ra.b', 'gnd.gnd'), wire('sw.b', 'rb.a'), wire('rb.b', 'gnd.gnd')]);
    solver.step(DT);
    expect(volts(solver, 'sw.com')).toBeCloseTo(4.5, 2);
    expect(volts(solver, 'rb.a')).toBeCloseTo(0, 2);
    solver.updateParam('sw', 'throw', 1);
    solver.step(DT); solver.step(DT);
    expect(volts(solver, 'sw.com')).toBeCloseTo(6.75, 2);
    expect(volts(solver, 'ra.a')).toBeCloseTo(0, 2);
  });

  it('picks between two signals (Wilson\'s VCF input switch)', () => {
    const solver = build([...supply(), source('one', 'sine', 300, 1), source('two', 'sine', 700, 1), part('sw', 'spdt', { throw: 0 }), res('load', 47e3)],
      [wire('one.out', 'sw.a'), wire('two.out', 'sw.b'), wire('sw.com', 'load.a'), wire('load.b', 'gnd.gnd')]);
    expect(read(trace(solver, 'load.a', 0.3)).hertz).toBeCloseTo(300, 0);
    solver.updateParam('sw', 'throw', 1);
    trace(solver, 'load.a', 0.01);
    expect(read(trace(solver, 'load.a', 0.3)).hertz).toBeCloseTo(700, 0);
  });
});

/** Collins, chapter 18: tape a photocell to an LED, and one circuit can turn another down. */
describe('opto-coupler: an LED on a photocell (Collins)', () => {
  const lit = (ledResistor: number | null) => {
    const led = ledResistor === null
      ? [wire('o.a', 'gnd.gnd')]
      : [wire('pwr.pos', 'rl.a'), wire('rl.b', 'o.a')];
    const solver = build([...supply(), part('o', 'optocoupler'), res('rl', ledResistor ?? 1e3), res('top', 10e3)],
      [...led, wire('o.k', 'gnd.gnd'), wire('pwr.pos', 'top.a'), wire('top.b', 'o.c1'), wire('o.c2', 'gnd.gnd')]);
    solver.step(DT);
    const v = volts(solver, 'o.c1');
    return { ohms: 10e3 * v / (9 - v), ledVolts: volts(solver, 'o.a') };
  };

  it('is megohms in the dark and a couple of kilohms with 10 mA through the LED', () => {
    expect(lit(null).ohms).toBeGreaterThan(2e6);
    expect(optoOhms(0)).toBe(5e6);
    expect(optoOhms(10e-3)).toBeCloseTo(2000, -1);
    const bright = lit(470); // about 15 mA
    expect(bright.ledVolts).toBeGreaterThan(1.8);
    expect(bright.ledVolts).toBeLessThan(2.4);
    expect(bright.ohms).toBeGreaterThan(1000);
    expect(bright.ohms).toBeLessThan(2000);
  });

  it('falls in resistance as the LED is driven harder', () => {
    const ohms = [100e3, 10e3, 1e3, 470].map((r) => lit(r).ohms);
    for (let i = 1; i < ohms.length; i++) expect(ohms[i]).toBeLessThan(ohms[i - 1] / 1.5);
  });

  it('starts settled: a lit LED has had time to act on the cell', () => {
    expect(lit(1e3).ohms).toBeCloseTo(optoOhms((9 - lit(1e3).ledVolts) / 1e3), -2);
  });

  it('lets a signal through when lit and shuts it off in the dark, with no wire between the two sides', () => {
    const through = (on: boolean) => {
      const solver = build([...supply(), source('in', 'sine', 1000, 1), part('o', 'optocoupler'), res('rl', 1e3), res('load', 10e3)],
        [wire(on ? 'pwr.pos' : 'gnd.gnd', 'rl.a'), wire('rl.b', 'o.a'), wire('o.k', 'gnd.gnd'), wire('in.out', 'o.c1'), wire('o.c2', 'load.a'), wire('load.b', 'gnd.gnd')]);
      return read(trace(solver, 'load.a', 0.02)).swing / 2;
    };
    expect(through(true)).toBeGreaterThan(0.6);
    expect(through(false)).toBeLessThan(0.01);
  });

  it('answers light in milliseconds and lets go of it slowly, which is what takes the clicks off', () => {
    // A 5 Hz square on the LED: lit for the first 100 ms, dark for the next
    const solver = build([...supply(), source('lfo', 'square', 5, 4), part('o', 'optocoupler'), res('rl', 330), res('top', 10e3)],
      [wire('lfo.out', 'rl.a'), wire('rl.b', 'o.a'), wire('o.k', 'gnd.gnd'), wire('pwr.pos', 'top.a'), wire('top.b', 'o.c1'), wire('o.c2', 'gnd.gnd')]);
    const cell = trace(solver, 'o.c1', 0.4);
    const litLevel = at(cell, 0.09), darkLevel = at(cell, 0.199);
    expect(darkLevel - litLevel).toBeGreaterThan(3);
    // 10 ms into the dark it has hardly moved; 10 ms into the light it is most of the way back
    expect(at(cell, 0.11) - litLevel).toBeLessThan(0.25 * (darkLevel - litLevel));
    expect(at(cell, 0.21) - litLevel).toBeLessThan(0.1 * (darkLevel - litLevel));
  });

  it('is overloaded like any LED without a resistor', () => {
    const solver = build([...supply(), part('o', 'optocoupler')], [wire('pwr.pos', 'o.a'), wire('o.k', 'gnd.gnd')]);
    solver.step(DT);
    const model = solver.getModel('o') as unknown as { strain(x: Float64Array): number };
    expect(model.strain(solver.getSolutionVector())).toBeGreaterThan(1);
  });
});

/** Collins, chapters 7 and 8: a piezo disc is a contact microphone and a speaker. */
describe('piezo disc (Collins)', () => {
  const mic = () => build([...supply(), part('pz', 'piezo'), res('load', 1e6)], [wire('pz.pos', 'load.a'), wire('load.b', 'gnd.gnd'), wire('pz.neg', 'gnd.gnd')]);

  it('is silent until it is knocked, then rings and dies away', () => {
    const solver = mic();
    expect(read(trace(solver, 'pz.pos', 0.05)).swing).toBe(0);
    solver.updateParam('pz', 'tap', 1);
    const knock = trace(solver, 'pz.pos', 0.5);
    const first = read(knock.subarray(0, SR / 50)), later = read(knock.subarray(SR / 4));
    expect(first.hi).toBeGreaterThan(0.15);
    expect(first.hi).toBeLessThan(0.5);
    expect(later.swing).toBeLessThan(first.swing / 100);
  });

  it('knocks once per tap, however long it is held', () => {
    const solver = mic();
    solver.updateParam('pz', 'tap', 1);
    trace(solver, 'pz.pos', 0.6);
    solver.updateParam('pz', 'tap', 1); // still held
    expect(read(trace(solver, 'pz.pos', 0.1)).swing).toBeLessThan(1e-3);
    solver.updateParam('pz', 'tap', 0);
    solver.updateParam('pz', 'tap', 1);
    expect(read(trace(solver, 'pz.pos', 0.1)).swing).toBeGreaterThan(0.3);
  });

  it('is loud enough, through the inverter preamp, to hear', () => {
    const solver = build([...supply(), part('pz', 'piezo'), part('u', 'cd4049'), res('ri', 10e3), res('rf', 1e6), cap('ci', 0.1e-6)],
      [wire('u.vdd', 'pwr.pos'), wire('u.vss', 'gnd.gnd'), wire('pz.neg', 'gnd.gnd'), wire('pz.pos', 'ci.a'), wire('ci.b', 'ri.a'), wire('ri.b', 'u.a1'), wire('u.a1', 'rf.a'), wire('rf.b', 'u.y1')]);
    trace(solver, 'u.y1', 0.1);
    solver.updateParam('pz', 'tap', 1);
    expect(read(trace(solver, 'u.y1', 0.05)).swing).toBeGreaterThan(1);
  });

  it('is a speaker when it is driven: an oscillator straight across it is heard', () => {
    const solver = build([...supply(), part('osc', 'cd40106'), res('r', 100e3), cap('c', 10e-9), part('pz', 'piezo')],
      [wire('osc.vdd', 'pwr.pos'), wire('osc.vss', 'gnd.gnd'), wire('osc.a1', 'r.a'), wire('r.b', 'osc.y1'), wire('osc.a1', 'c.a'), wire('c.b', 'gnd.gnd'),
        wire('osc.y1', 'pz.pos'), wire('pz.neg', 'gnd.gnd')]);
    listen(solver, 0.1);
    const heard = read(listen(solver, 0.5));
    expect(heard.swing).toBeGreaterThan(0.5);
    expect(heard.hertz).toBeGreaterThan(500);
    expect(heard.hertz).toBeLessThan(2500);
    expect(heard.hertz).toBeCloseTo(read(trace(solver, 'osc.y1', 0.5)).hertz, -1);
  });
});

describe('1N4004 rectifier', () => {
  const drop = (ohms: number) => {
    const solver = build([...supply(), part('d', '1n4004'), res('r', ohms)], [wire('pwr.pos', 'r.a'), wire('r.b', 'd.a'), wire('d.k', 'gnd.gnd')]);
    solver.step(DT);
    return volts(solver, 'd.a');
  };

  it('drops about 0.7 V at a few milliamps and under a volt at an amp', () => {
    expect(drop(1e3)).toBeGreaterThan(0.6);
    expect(drop(1e3)).toBeLessThan(0.75);
    expect(drop(8.2)).toBeGreaterThan(0.85);
    expect(drop(8.2)).toBeLessThan(1.05);
  });

  it('passes nothing backwards: a battery put in the wrong way round does no harm', () => {
    const solver = build([...supply(), part('d', '1n4004'), res('circuit', 1e3)], [wire('pwr.pos', 'd.k'), wire('d.a', 'circuit.a'), wire('circuit.b', 'gnd.gnd')]);
    solver.step(DT);
    expect(Math.abs(volts(solver, 'circuit.a'))).toBeLessThan(1e-3);
  });

  it('is not overloaded by 100 mA, which would cook a 1N914\'s little brother the LED', () => {
    const solver = build([...supply(), part('d', '1n4004'), res('r', 82)], [wire('pwr.pos', 'r.a'), wire('r.b', 'd.a'), wire('d.k', 'gnd.gnd')]);
    solver.step(DT);
    const model = solver.getModel('d') as unknown as { strain(x: Float64Array): number };
    expect(model.strain(solver.getSolutionVector())).toBeLessThan(0.2);
  });
});

describe('2N3906: the PNP transistor (Wilson)', () => {
  const switched = (baseTo: string) => {
    const solver = build([...supply(), part('q', '2n3906'), res('rb', 10e3), res('rc', 1e3)],
      [wire('pwr.pos', 'q.e'), wire('q.b', 'rb.a'), wire('rb.b', baseTo), wire('q.c', 'rc.a'), wire('rc.b', 'gnd.gnd')]);
    solver.step(DT);
    return { collector: volts(solver, 'q.c'), base: volts(solver, 'q.b') };
  };

  it('turns on when its base is taken below its emitter', () => {
    const on = switched('gnd.gnd');
    expect(on.collector).toBeGreaterThan(8.7);
    expect(9 - on.base).toBeGreaterThan(0.6);
    expect(9 - on.base).toBeLessThan(0.9);
  });

  it('is off with its base at its emitter', () => {
    expect(switched('pwr.pos').collector).toBeLessThan(0.01);
  });

  it('follows its base from a diode drop above', () => {
    const solver = build([...supply(), part('q', '2n3906'), res('r1', 10e3), res('r2', 10e3), res('re', 1e3)],
      [wire('pwr.pos', 'r1.a'), wire('r1.b', 'r2.a'), wire('r2.b', 'gnd.gnd'), wire('r1.b', 'q.b'), wire('pwr.pos', 're.a'), wire('re.b', 'q.e'), wire('q.c', 'gnd.gnd')]);
    solver.step(DT);
    const above = volts(solver, 'q.e') - volts(solver, 'q.b');
    expect(above).toBeGreaterThan(0.6);
    expect(above).toBeLessThan(0.8);
  });
});

/** Wilson uses the 2N5457 as a resistor a voltage sets (the Noise Toaster's VCA) and as a switch. */
describe('2N5457: the JFET (Wilson)', () => {
  /** A divider from ground to the negative rail that puts the gate `gate` volts below ground. */
  const gateAt = (gate: number): [Part[], Wire[]] => [
    [negative(), res('ga', 9e3 - gate * 1e3 + 1), res('gb', gate * 1e3 + 1)],
    [NEGATIVE, wire('gnd.gnd', 'gb.a'), wire('gb.b', 'j.g'), wire('j.g', 'ga.a'), wire('ga.b', 'neg.neg')],
  ];
  const drain = (gate: number) => {
    const [parts, wires] = gateAt(gate);
    const solver = build([...supply(), part('j', '2n5457'), res('rd', 100), ...parts],
      [wire('pwr.pos', 'rd.a'), wire('rd.b', 'j.d'), wire('j.s', 'gnd.gnd'), ...wires]);
    solver.step(DT);
    return (9 - volts(solver, 'j.d')) / 100;
  };

  it('passes a couple of milliamps with its gate at its source, less as the gate goes down, nothing below about −1.4 V', () => {
    expect(drain(0)).toBeGreaterThan(1e-3); // the data sheet's IDSS: 1 to 5 mA
    expect(drain(0)).toBeLessThan(5e-3);
    expect(drain(0.5)).toBeLessThan(drain(0) / 2);
    expect(drain(1)).toBeLessThan(drain(0.5) / 2);
    expect(drain(2)).toBeLessThan(1e-6);
    expect(drain(5)).toBeLessThan(1e-6);
  });

  it('is a resistor the gate sets: a small signal is turned down, turned up or shut off', () => {
    const across = (gate: number) => {
      const [parts, wires] = gateAt(gate);
      const solver = build([...supply(), part('j', '2n5457'), source('in', 'sine', 1000, 0.1), res('rs', 10e3), ...parts],
        [wire('in.out', 'rs.a'), wire('rs.b', 'j.d'), wire('j.s', 'gnd.gnd'), ...wires]);
      return read(trace(solver, 'j.d', 0.02)).swing / 2;
    };
    const on = across(0), half = across(0.7), off = across(3);
    // A few hundred ohms against 10 kΩ when on; open when off
    expect(on).toBeLessThan(0.006);
    expect(half).toBeGreaterThan(on * 1.5);
    expect(off).toBeGreaterThan(0.098);
  });

  it('passes a signal from drain to source or blocks it (the Noise Toaster\'s VCA)', () => {
    const through = (gate: number) => {
      const [parts, wires] = gateAt(gate);
      const solver = build([...supply(), part('j', '2n5457'), source('in', 'sine', 1000, 0.1), res('load', 10e3), ...parts],
        [wire('in.out', 'j.d'), wire('j.s', 'load.a'), wire('load.b', 'gnd.gnd'), ...wires]);
      return read(trace(solver, 'load.a', 0.02)).swing / 2;
    };
    expect(through(0)).toBeGreaterThan(0.085);
    expect(through(4)).toBeLessThan(0.001);
  });

  it('follows its gate from a volt or so above: a buffer that takes nothing from what it listens to', () => {
    const solver = build([...supply(), part('j', '2n5457'), res('rs', 10e3), res('rg', 1e6)],
      [wire('pwr.pos', 'j.d'), wire('j.s', 'rs.a'), wire('rs.b', 'gnd.gnd'), wire('j.g', 'rg.a'), wire('rg.b', 'gnd.gnd')]);
    solver.step(DT);
    expect(volts(solver, 'j.s')).toBeGreaterThan(0.5);
    expect(volts(solver, 'j.s')).toBeLessThan(1.4);
    expect(Math.abs(volts(solver, 'j.g'))).toBeLessThan(1e-3); // no gate current to speak of
  });

  it('has a diode at its gate, which conducts if the gate is taken above the channel', () => {
    const solver = build([...supply(), part('j', '2n5457'), res('rg', 10e3)], [wire('pwr.pos', 'rg.a'), wire('rg.b', 'j.g'), wire('j.s', 'gnd.gnd'), wire('j.d', 'gnd.gnd')]);
    solver.step(DT);
    expect(volts(solver, 'j.g')).toBeGreaterThan(0.4);
    expect(volts(solver, 'j.g')).toBeLessThan(0.8);
  });
});

/** Wilson's op-amp circuits run from two batteries: +9 V, −9 V and ground between them. */
describe('TL072 and LM324 (Wilson)', () => {
  const inverting = (type: string, inVolts: number) => build(
    [...supply(), negative(), part('u', type), source('in', 'sine', 1000, inVolts), res('ri', 10e3), res('rf', 100e3)],
    [NEGATIVE, wire('u.vp', 'pwr.pos'), wire('u.vm', 'neg.neg'), wire('u.p1', 'gnd.gnd'), wire('in.out', 'ri.a'), wire('ri.b', 'u.m1'), wire('u.m1', 'rf.a'), wire('rf.b', 'u.o1')]);

  it('two batteries in a row make a supply with a rail above ground and a rail below', () => {
    const solver = inverting('tl072', 0.1);
    expect(volts(solver, 'u.vp')).toBeCloseTo(9, 2);
    expect(volts(solver, 'u.vm')).toBeCloseTo(-9, 2);
  });

  it.each(['tl072', 'lm324'])('%s: an inverting amplifier has the gain its two resistors give it, about ground', (type) => {
    const solver = inverting(type, 0.2);
    trace(solver, 'u.o1', 0.02);
    const out = read(trace(solver, 'u.o1', 0.02));
    // 100k over 10k and the source's own 600 Ω
    expect(out.swing / 2).toBeCloseTo(0.2 * 100 / 10.6, 1);
    expect(Math.abs(out.mean)).toBeLessThan(0.01);
    expect(Math.abs(volts(solver, 'u.m1'))).toBeLessThan(0.01); // the virtual earth
  });

  it('clips short of the rails when overdriven: the TL072 evenly, the LM324 nearer its negative rail', () => {
    const clipped = (type: string) => { const s = inverting(type, 5); trace(s, 'u.o1', 0.02); return read(trace(s, 'u.o1', 0.02)); };
    const tl = clipped('tl072'), lm = clipped('lm324');
    expect(tl.hi).toBeGreaterThan(7); expect(tl.hi).toBeLessThan(8);
    expect(tl.lo).toBeCloseTo(-tl.hi, 1);
    expect(lm.hi).toBeCloseTo(7.5, 1);
    expect(lm.lo).toBeCloseTo(-8, 1);
  });

  it('only the amplifiers that are wired take part', () => {
    const solver = inverting('lm324', 0.2);
    expect(solver.getSolutionVector().every(Number.isFinite)).toBe(true);
    trace(solver, 'u.o1', 0.01);
    expect(solver.getSolutionVector().every(Number.isFinite)).toBe(true);
  });

  /**
   * The Noise Toaster runs four of these from one battery, about a "virtual
   * ground" made by two 4.7 kΩ resistors and 470 µF. Wilson gives the LM324's
   * output as reaching +3 V and −3.5 V from it.
   */
  describe('on one battery, about a virtual ground (the Noise Toaster)', () => {
    const VIRTUAL = [res('va', 4.7e3), res('vb', 4.7e3), cap('vc', 470e-6)];
    const VIRTUAL_WIRES = [wire('pwr.pos', 'va.a'), wire('va.b', 'vb.a'), wire('vb.b', 'gnd.gnd'), wire('va.b', 'vc.a'), wire('vc.b', 'gnd.gnd')];
    const RC = 100e3 * 0.1e-6;
    /** Integrator (amp 1) and Schmitt trigger (amp 2) in a ring: a triangle and a square. */
    const lfo = () => build(
      [...supply(), part('u', 'lm324'), ...VIRTUAL, res('rt', 100e3), cap('ct', 0.1e-6), res('rh1', 47e3), res('rh2', 100e3)],
      [wire('u.vp', 'pwr.pos'), wire('u.vm', 'gnd.gnd'), ...VIRTUAL_WIRES,
        wire('u.p1', 'va.b'), wire('rt.b', 'u.m1'), wire('u.m1', 'ct.a'), wire('ct.b', 'u.o1'),
        wire('u.m2', 'va.b'), wire('u.o1', 'rh1.a'), wire('rh1.b', 'u.p2'), wire('u.p2', 'rh2.a'), wire('rh2.b', 'u.o2'), wire('u.o2', 'rt.a')]);

    it('the square swings between the levels Wilson measures', () => {
      const solver = lfo();
      trace(solver, 'u.o2', 0.2);
      const square = read(trace(solver, 'u.o2', 0.5));
      expect(square.hi - 4.5).toBeCloseTo(3, 1);
      expect(square.lo - 4.5).toBeCloseTo(-3.5, 1);
    });

    it('oscillates from the moment it is switched on, at the rate its parts set', () => {
      const solver = lfo();
      const triangle = read(trace(solver, 'u.o1', 1));
      // The trigger turns over when the triangle is 47/100 of the square's distance from the middle, the other side of it
      const top = 4.5 + 3.5 * 0.47, bottom = 4.5 - 3 * 0.47;
      expect(triangle.hi).toBeCloseTo(top, 1);
      expect(triangle.lo).toBeCloseTo(bottom, 1);
      // It climbs at 3.5 V / RC and falls at 3 V / RC
      const period = (top - bottom) * RC * (1 / 3.5 + 1 / 3);
      expect(triangle.hertz).toBeCloseTo(1 / period, 0);
    });

    it('leaves its virtual ground where the two resistors put it', () => {
      const solver = lfo();
      const ground = read(trace(solver, 'va.b', 1));
      expect(ground.mean).toBeCloseTo(4.5, 2);
      expect(ground.swing).toBeLessThan(0.01);
    });

    it('does the same without the big capacitor: what an output delivers comes from the battery, not from the virtual ground', () => {
      const solver = build(
        [...supply(), part('u', 'lm324'), res('va', 4.7e3), res('vb', 4.7e3), res('rt', 100e3), cap('ct', 0.1e-6), res('rh1', 47e3), res('rh2', 100e3)],
        [wire('u.vp', 'pwr.pos'), wire('u.vm', 'gnd.gnd'), wire('pwr.pos', 'va.a'), wire('va.b', 'vb.a'), wire('vb.b', 'gnd.gnd'),
          wire('u.p1', 'va.b'), wire('rt.b', 'u.m1'), wire('u.m1', 'ct.a'), wire('ct.b', 'u.o1'),
          wire('u.m2', 'va.b'), wire('u.o1', 'rh1.a'), wire('rh1.b', 'u.p2'), wire('u.p2', 'rh2.a'), wire('rh2.b', 'u.o2'), wire('u.o2', 'rt.a')]);
      expect(read(trace(solver, 'va.b', 0.5)).swing).toBeLessThan(0.01);
    });
  });

  it('a comparator with a resistor back to its + input turns over at two different levels (hysteresis)', () => {
    // 10k in, 100k back: the levels are a tenth of the output's, either side of ground
    const solver = build(
      [...supply(), negative(), part('u', 'tl072'), source('in', 'triangle', 50, 2), res('r1', 10e3), res('r2', 100e3)],
      [NEGATIVE, wire('u.vp', 'pwr.pos'), wire('u.vm', 'neg.neg'), wire('u.m1', 'gnd.gnd'), wire('in.out', 'r1.a'), wire('r1.b', 'u.p1'), wire('u.p1', 'r2.a'), wire('r2.b', 'u.o1')]);
    const flips: Array<{ input: number; up: boolean }> = [];
    let before = volts(solver, 'u.o1');
    for (let i = 0; i < SR / 10; i++) {
      solver.step(DT);
      const now = volts(solver, 'u.o1');
      if (Math.abs(now) > 7 && Math.abs(before) > 7 && Math.sign(now) !== Math.sign(before)) flips.push({ input: volts(solver, 'in.out'), up: now > 0 });
      if (Math.abs(now) > 7) before = now;
    }
    expect(flips.length).toBeGreaterThanOrEqual(8);
    for (const flip of flips.slice(1)) {
      // It goes up only once the input is well above ground, and down only once it is well below
      expect(flip.input).toBeCloseTo(flip.up ? 0.77 : -0.77, 0);
      expect(flip.up ? flip.input : -flip.input).toBeGreaterThan(0.6);
    }
    const out = read(trace(solver, 'u.o1', 0.1));
    expect(out.hertz).toBeCloseTo(50, 0);
    expect(out.hi).toBeGreaterThan(7);
    expect(out.lo).toBeLessThan(-7);
  });

  it('a comparator without feedback simply follows which input is higher', () => {
    const solver = build(
      [...supply(), negative(), part('u', 'lm324'), source('in', 'sine', 100, 1), res('load', 10e3)],
      [NEGATIVE, wire('u.vp', 'pwr.pos'), wire('u.vm', 'neg.neg'), wire('u.m1', 'gnd.gnd'), wire('in.out', 'u.p1'), wire('u.o1', 'load.a'), wire('load.b', 'gnd.gnd')]);
    trace(solver, 'u.o1', 0.05);
    const out = read(trace(solver, 'u.o1', 0.1));
    expect(out.hertz).toBeCloseTo(100, 0);
    expect(out.hi).toBeGreaterThan(7);
    expect(out.lo).toBeLessThan(-7.5);
  });
});

/**
 * Wilson, figure 6-6: the Noise Toaster's white noise generator. A 2N3904
 * with its emitter taken above its breakdown voltage through 1 MΩ, and two
 * transistor stages to bring the hiss up.
 */
describe('white noise from a transistor in breakdown (Wilson, figure 6-6)', () => {
  const generator = (battery: number) => build(
    [...supply(battery), part('q5', '2n3904'), part('q2', '2n3904'), part('q6', '2n3904'),
      res('r8', 1e6), cap('c3', 0.1e-6), res('r9', 10e3), res('r10', 470e3), cap('c7', 0.1e-6), res('r25', 100e3), res('r15', 10e3), res('r19', 470e3)],
    [wire('pwr.pos', 'r8.a'), wire('r8.b', 'q5.e'), wire('q5.b', 'gnd.gnd'), wire('q5.e', 'c3.a'), wire('c3.b', 'q2.b'),
      wire('pwr.pos', 'r9.a'), wire('r9.b', 'q2.c'), wire('q2.c', 'r10.a'), wire('r10.b', 'q2.b'), wire('q2.e', 'gnd.gnd'),
      wire('q2.c', 'c7.a'), wire('c7.b', 'r25.a'), wire('r25.b', 'q6.b'),
      wire('pwr.pos', 'r15.a'), wire('r15.b', 'q6.c'), wire('q6.c', 'r19.a'), wire('r19.b', 'q6.b'), wire('q6.e', 'gnd.gnd')]);

  it('the emitter sits at its breakdown voltage, like a zener', () => {
    const solver = generator(9);
    expect(volts(solver, 'q5.e')).toBeGreaterThan(6.8);
    expect(volts(solver, 'q5.e')).toBeLessThan(7.6);
  });

  it('gives about 1.5 V peak to peak of hiss at the output, as Wilson says', () => {
    const solver = generator(9);
    trace(solver, 'q6.c', 0.2);
    const emitter = read(trace(solver, 'q5.e', 0.2));
    const out = read(trace(solver, 'q6.c', 1));
    expect(emitter.swing).toBeLessThan(0.01); // "very low amplitude" before the amplifier
    expect(out.swing).toBeGreaterThan(1);
    expect(out.swing).toBeLessThan(2.2);
    expect(out.hertz).toBeGreaterThan(3000); // no pitch: it crosses its middle thousands of times a second
  });

  it('stops when the battery runs down, as Wilson warns', () => {
    const solver = generator(6);
    trace(solver, 'q6.c', 0.2);
    expect(read(trace(solver, 'q6.c', 0.3)).swing).toBeLessThan(0.001);
  });

  it('a transistor used the ordinary way makes no noise at all', () => {
    const solver = build([...supply(), part('q', '2n3904'), res('rc', 10e3), res('rb', 470e3)],
      [wire('pwr.pos', 'rc.a'), wire('rc.b', 'q.c'), wire('q.c', 'rb.a'), wire('rb.b', 'q.b'), wire('q.e', 'gnd.gnd')]);
    expect(read(trace(solver, 'q.c', 0.1)).swing).toBeLessThan(1e-6);
  });
});

/** Wilson, appendix B: the LM13700 as a voltage-controlled amplifier, on ±9 V. */
describe('LM13700: an amplifier whose gain is a current (Wilson)', () => {
  function vca(biasResistor: number | null, inVolts: number) {
    const bias = biasResistor === null ? [] : [res('rabc', biasResistor)];
    const biasWires = biasResistor === null ? [] : [wire('pwr.pos', 'rabc.a'), wire('rabc.b', 'u.abc1')];
    const solver = build(
      [...supply(), negative(), part('u', 'lm13700'), source('in', 'sine', 1000, inVolts),
        res('rin', 100e3), res('rg1', 1e3), res('rg2', 1e3), res('rl', 10e3), res('rb', 10e3), ...bias],
      [NEGATIVE, wire('u.vp', 'pwr.pos'), wire('u.vm', 'neg.neg'),
        // the signal divided down to a few millivolts, as the data sheet has it
        wire('in.out', 'rin.a'), wire('rin.b', 'u.p1'), wire('u.p1', 'rg1.a'), wire('rg1.b', 'gnd.gnd'), wire('u.m1', 'rg2.a'), wire('rg2.b', 'gnd.gnd'),
        wire('u.out1', 'rl.a'), wire('rl.b', 'gnd.gnd'), wire('u.out1', 'u.bin1'), wire('u.bout1', 'rb.a'), wire('rb.b', 'neg.neg'), ...biasWires]);
    trace(solver, 'u.out1', 0.02);
    const out = read(trace(solver, 'u.out1', 0.02));
    const buffered = read(trace(solver, 'u.bout1', 0.02));
    const microamps = biasResistor === null ? 0 : (9 - volts(solver, 'u.abc1')) / biasResistor * 1e6;
    return { out, buffered, microamps, biasVolts: volts(solver, 'u.abc1') - volts(solver, 'u.vm') };
  }

  it('is silent with no bias current', () => {
    expect(vca(null, 1).out.swing).toBeLessThan(0.001);
  });

  it('is as loud as its bias current is large', () => {
    const quiet = vca(1e6, 1), middle = vca(330e3, 1), loud = vca(100e3, 1);
    expect(middle.out.swing / quiet.out.swing).toBeCloseTo(middle.microamps / quiet.microamps, 1);
    expect(loud.out.swing / quiet.out.swing).toBeCloseTo(loud.microamps / quiet.microamps, 0);
    expect(loud.out.swing).toBeGreaterThan(8 * quiet.out.swing);
  });

  it('has the gain the data sheet gives: 19.2 times the bias current, in amps per volt', () => {
    const { out, microamps } = vca(100e3, 1);
    const inputVolts = 1 * 1 / 101.6; // what the divider leaves of 1 V
    const expected = 19.2 * microamps * 1e-6 * inputVolts * 10e3;
    expect(out.swing / 2).toBeGreaterThan(expected * 0.85); // a little under: the input pair is already rounding it off
    expect(out.swing / 2).toBeLessThan(expected * 1.05);
  });

  it('holds its bias pin two diode drops above the negative rail', () => {
    const { biasVolts } = vca(100e3, 1);
    expect(biasVolts).toBeGreaterThan(1);
    expect(biasVolts).toBeLessThan(1.5);
  });

  it('can never put out more current than its bias: a big input is rounded off, which is how it shapes a triangle into a sine', () => {
    const { out, microamps } = vca(33e3, 10);
    const most = microamps * 1e-6 * 10e3;
    expect(out.hi).toBeLessThan(most);
    expect(out.hi).toBeGreaterThan(most * 0.9);
    expect(out.lo).toBeCloseTo(-out.hi, 1);
  });

  it('its buffer follows the output from two diode drops below', () => {
    const { out, buffered } = vca(100e3, 1);
    expect(buffered.swing).toBeCloseTo(out.swing, 1);
    expect(out.mean - buffered.mean).toBeGreaterThan(1);
    expect(out.mean - buffered.mean).toBeLessThan(1.6);
  });
});

/** Wilson, appendix C: a flip-flop with its inverted output wired back to its data input changes over on every clock. */
describe('CD4013: two flip-flops (Wilson)', () => {
  const OSC = [part('osc', 'cd40106'), res('r', 100e3), cap('c', 10e-9)];
  const OSC_WIRES = [wire('osc.vdd', 'pwr.pos'), wire('osc.vss', 'gnd.gnd'), wire('osc.a1', 'r.a'), wire('r.b', 'osc.y1'), wire('osc.a1', 'c.a'), wire('c.b', 'gnd.gnd')];

  it('halves a frequency, and halves it again', () => {
    const solver = build([...supply(), ...OSC, part('ff', 'cd4013'), res('load', 100e3)],
      [...OSC_WIRES, wire('ff.vdd', 'pwr.pos'), wire('ff.vss', 'gnd.gnd'), wire('osc.y1', 'ff.clk1'), wire('ff.nq1', 'ff.d1'),
        wire('ff.q1', 'ff.clk2'), wire('ff.nq2', 'ff.d2'), wire('ff.q2', 'load.a'), wire('load.b', 'gnd.gnd')]);
    trace(solver, 'osc.y1', 0.1);
    const clock = read(trace(solver, 'osc.y1', 0.5)).hertz;
    expect(clock).toBeGreaterThan(500);
    expect(read(trace(solver, 'ff.q1', 0.5)).hertz).toBeCloseTo(clock / 2, 0);
    const second = read(trace(solver, 'ff.q2', 0.5));
    expect(second.hertz).toBeCloseTo(clock / 4, 0);
    expect(second.lo).toBeLessThan(0.1);
    expect(second.hi).toBeGreaterThan(8.9);
  });

  it('remembers its data input at the moment the clock rises, and not otherwise', () => {
    const solver = build([...supply(), part('ff', 'cd4013'), part('data', 'spdt', { throw: 0 }), part('clock', 'spdt', { throw: 0 }), res('load', 100e3), res('load2', 100e3)],
      [wire('ff.vdd', 'pwr.pos'), wire('ff.vss', 'gnd.gnd'), wire('data.a', 'gnd.gnd'), wire('data.b', 'pwr.pos'), wire('data.com', 'ff.d1'),
        wire('clock.a', 'gnd.gnd'), wire('clock.b', 'pwr.pos'), wire('clock.com', 'ff.clk1'), wire('ff.q1', 'load.a'), wire('load.b', 'gnd.gnd'), wire('ff.nq1', 'load2.a'), wire('load2.b', 'gnd.gnd')]);
    const set = (id: string, to: number) => { solver.updateParam(id, 'throw', to); for (let i = 0; i < 4; i++) solver.step(DT); };
    const q = () => volts(solver, 'ff.q1') > 4.5;
    expect(q()).toBe(false);
    expect(volts(solver, 'ff.nq1')).toBeGreaterThan(8.9);
    set('data', 1); expect(q()).toBe(false);   // data alone does nothing
    set('clock', 1); expect(q()).toBe(true);   // the clock rising takes it
    set('data', 0); expect(q()).toBe(true);    // and it is held
    set('clock', 0); expect(q()).toBe(true);   // a falling clock does nothing
    set('clock', 1); expect(q()).toBe(false);
    expect(volts(solver, 'ff.nq1')).toBeGreaterThan(8.9);
  });

  it('is forced by set and reset, whatever the clock is doing', () => {
    const solver = build([...supply(), part('ff', 'cd4013'), part('set', 'spdt', { throw: 0 }), part('reset', 'spdt', { throw: 0 }), res('load', 100e3), res('load2', 100e3)],
      [wire('ff.vdd', 'pwr.pos'), wire('ff.vss', 'gnd.gnd'), wire('ff.d1', 'gnd.gnd'), wire('ff.clk1', 'gnd.gnd'),
        wire('set.a', 'gnd.gnd'), wire('set.b', 'pwr.pos'), wire('set.com', 'ff.set1'), wire('reset.a', 'gnd.gnd'), wire('reset.b', 'pwr.pos'), wire('reset.com', 'ff.rst1'),
        wire('ff.q1', 'load.a'), wire('load.b', 'gnd.gnd'), wire('ff.nq1', 'load2.a'), wire('load2.b', 'gnd.gnd')]);
    const set = (id: string, to: number) => { solver.updateParam(id, 'throw', to); for (let i = 0; i < 4; i++) solver.step(DT); };
    set('set', 1); expect(volts(solver, 'ff.q1')).toBeGreaterThan(8.9);
    set('set', 0); expect(volts(solver, 'ff.q1')).toBeGreaterThan(8.9); // it stays set
    set('reset', 1); expect(volts(solver, 'ff.q1')).toBeLessThan(0.1);
    expect(volts(solver, 'ff.nq1')).toBeGreaterThan(8.9);
  });
});
