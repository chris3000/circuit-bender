/**
 * Class 6 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 *
 * The class reads a learner's circuit from one run at 8 kHz. The figures are
 * measured here a second way, at 48 kHz and with this file's own arithmetic,
 * so the two have to agree.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { moreVoices as lesson, moreVoicesKept } from '@/classes/moreVoices';
import { classCircuit, classStage, classStart } from '@/classes';
import { NOWHERE, Work, type Situation } from '@/classes/Work';
import { CD40106, DIODE } from '@/classes/kit';
import { capacitor, connect, exampleCircuits, place, resistor } from '@/examples/circuits';
import { harmonics, measureSignal } from '@/simulation/measure/signal';
import { removeFromCircuit, spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import { componentObstacles } from '@/views/CircuitCanvas/routing/layout';
import { computeWireRoutes } from '@/views/CircuitCanvas/routing/useWireRoutes';
import type { Component } from '@/types/circuit';
import type { Built, Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

const RATE = 48000;
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (circuit: Circuit, situation = NOWHERE) => lesson.build.filter((s) => s.done(new Work(circuit, situation))).map((s) => s.id);
const keptSteps = (circuit: Circuit, situation = NOWHERE) => lesson.keep.filter((s) => s.done(new Work(circuit, situation))).map((s) => s.id);
const made = (circuit: Circuit) => lesson.tries.filter((t) => t.made(new Work(circuit))).map((t) => t.id);
const why = (title: string) => lesson.why.find((p) => p.title === title)!.text;

const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const chipOf = (circuit: Circuit) => only(circuit, 'cd40106');
const resistors = (circuit: Circuit, ohms: number) => all(circuit, 'resistor').filter((r) => r.parameters.resistance === ohms);
const retune = (circuit: Circuit, from: number, to: number) => {
  const part = resistors(circuit, from)[0];
  return circuit.updateComponent(part.id, { parameters: { ...part.parameters, resistance: to, value: formatValue(to, 'resistance') } });
};
const named = (circuit: Circuit, name: string) => all(circuit, 'switch').find((s) => s.label === name)!;
const circuitOf = ({ components, connections }: Built): Circuit => {
  let circuit = new Circuit('built');
  for (const c of components) circuit = circuit.addComponent(c);
  for (const c of connections) circuit = circuit.addConnection(c);
  return circuit;
};

/** The circuits of the build: class 4's oscillator, two voices mixed, the chord, the chord with its slow oscillator, and with the diode. */
const oscillator = () => classStart(lesson);
const twoVoices = () => classStage(lesson, ['play']);
const chord = () => classStage(lesson, ['play', 'second', 'mixer', 'mix']);
const withSlow = () => classStage(lesson, ['play', 'second', 'mixer', 'mix', 'third', 'chord', 'look']);
const chopped = () => classCircuit(lesson);
const keptCircuit = () => circuitOf(moreVoicesKept());

// --- Changes a learner makes ---

/** A diode from one inverter's input to another's output (inverters from 0): A on the input, or K if `turned`. */
function diode(circuit: Circuit, voice: number, slow = 3, turned = false, y = 100): Circuit {
  const chip = chipOf(circuit);
  const part = place('1n914', 360 - 100 * all(circuit, '1n914').length, y);
  return circuit.addComponent(part)
    .addConnection(connect(part, turned ? DIODE.K : DIODE.A, chip, CD40106.A[voice]))
    .addConnection(connect(part, turned ? DIODE.A : DIODE.K, chip, CD40106.Y[slow]));
}
/** The class's circuit without its diode, as the Delete key leaves it. */
const noDiode = () => {
  const circuit = chopped();
  return removeFromCircuit(circuit, [only(circuit, '1n914').id]);
};
/** Two outputs wired straight together. */
const tied = (circuit: Circuit, a = 1, b = 2) => {
  const chip = chipOf(circuit);
  return circuit.addConnection(connect(chip, CD40106.Y[a], chip, CD40106.Y[b]));
};
/** A 47 kΩ where the diode was. */
function resistorForDiode(ohms = 47000): Circuit {
  const circuit = noDiode(), chip = chipOf(circuit);
  const part = resistor(ohms, 360, 160);
  return circuit.addComponent(part).addConnection(connect(part, 0, chip, CD40106.A[0])).addConnection(connect(part, 1, chip, CD40106.Y[3]));
}
/** A diode and 10 kΩ in a line across the second voice's resistors. */
function pulse(turned = false, circuit = chopped()): Circuit {
  const chip = chipOf(circuit);
  const part = place('1n914', 360, 100), quick = resistor(10000, 260, 100);
  return circuit.addComponent(part).addComponent(quick)
    .addConnection(connect(chip, CD40106.Y[1], part, turned ? DIODE.K : DIODE.A))
    .addConnection(connect(part, turned ? DIODE.A : DIODE.K, quick, 0))
    .addConnection(connect(quick, 1, chip, CD40106.A[1]));
}
/** What passes the check: diodes on the two voices a fifth apart, and the slow oscillator's 1 MΩ made `ohms`. */
const gatedFifth = (ohms = 680000) => retune(diode(diode(noDiode(), 1), 2), 1e6, ohms);
/** A switch dropped onto the wire from the third voice's output to its mixing resistor. */
function withKey(circuit: Circuit): { circuit: Circuit; key: Component } {
  const chip = chipOf(circuit);
  const wire = circuit.getConnections().find((c) => c.from.componentId === chip.id && c.from.pinId === chip.pins[CD40106.Y[2]].id
    && circuit.getComponent(c.to.componentId)?.parameters.resistance === 10000)!;
  const key = place('switch', 620, 330, { parameters: { closed: 1 } });
  return { circuit: spliceIntoWire(circuit.addComponent(key), key, wire.id), key };
}
/** The slow oscillator and every diode taken away with the Delete key. */
function tidied(circuit: Circuit): Circuit {
  const slow = [...resistors(circuit, 1e6), ...resistors(circuit, 680000), ...all(circuit, 'capacitor').filter((c) => c.parameters.capacitance === 1e-6)];
  return removeFromCircuit(circuit, [...all(circuit, '1n914'), ...slow].map((part) => part.id));
}

// --- Measuring, apart from the class's own way of doing it ---

interface Heard {
  /** An inverter's output (from 0), sample by sample. */
  y: (inverter: number) => Float32Array;
  a: (inverter: number) => Float32Array;
  hz: (inverter: number) => number | null;
  sound: Float32Array;
}

function hear(circuit: Circuit, seconds = 1, set: Array<{ componentId: string; parameter: string; value: number }> = []): Heard {
  const chip = chipOf(circuit);
  const pins = [...CD40106.Y.slice(0, 4), ...CD40106.A.slice(0, 4)];
  const run = new Work(circuit).bench({ seconds, sampleRate: RATE, set, watch: pins.map((pin) => [chip, pin] as const) });
  const trace = (pin: number) => run.trace(chip.id, chip.pins[pin].id)!;
  return {
    y: (i) => trace(CD40106.Y[i]),
    a: (i) => trace(CD40106.A[i]),
    hz: (i) => run.volts(chip.id, chip.pins[CD40106.Y[i]].id).hertz,
    sound: run.soundTrace,
  };
}

/** The samples at which a 0 to 9 V output goes high. */
function rises(trace: Float32Array, from = 0): number[] {
  const at: number[] = [];
  let up = trace[from] > 4.5;
  for (let i = from + 1; i < trace.length; i++) {
    if (!up && trace[i] > 6) { up = true; at.push(i); } else if (up && trace[i] < 3) up = false;
  }
  return at;
}

/**
 * A voice that may come and go: its pitch over the cycles it runs for, the
 * part of each of those it is high, how many bursts a second, and the part
 * of its cycles that begin while another output (`slow`) is high.
 */
function running(trace: Float32Array, slow?: Float32Array) {
  const edges = rises(trace, RATE / 2);
  const gaps = edges.slice(1).map((at, i) => at - edges[i]);
  const usual = [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length / 2)];
  let cycles = 0, samples = 0, high = 0, duringHigh = 0;
  const starts: number[] = [];
  const pitch = { high: [0, 0], low: [0, 0] };
  gaps.forEach((gap, i) => {
    if (gap > usual * 3) starts.push(edges[i + 1]);
    if (gap > usual * 1.5) return;
    cycles++;
    samples += gap;
    for (let k = edges[i]; k < edges[i + 1]; k++) if (trace[k] > 4.5) high++;
    if (!slow) return;
    const before = slow[edges[i]] > 4.5, after = slow[edges[i + 1]] > 4.5;
    if (before) duringHigh++;
    if (before === after) {
      const side = before ? pitch.high : pitch.low;
      side[0]++;
      side[1] += gap;
    }
  });
  return {
    hertz: (RATE * cycles) / samples,
    high: high / samples,
    silences: starts.length,
    perSecond: starts.length > 1 ? (RATE * (starts.length - 1)) / (starts[starts.length - 1] - starts[0]) : null,
    whileHigh: duringHigh / cycles,
    hertzWhileHigh: (RATE * pitch.high[0]) / pitch.high[1],
    hertzWhileLow: (RATE * pitch.low[0]) / pitch.low[1],
  };
}

/** The levels a trace rests at, to the nearest tenth of a volt, leaving out the few samples caught on the way between two. */
function levels(trace: Float32Array): number[] {
  const count = new Map<number, number>();
  for (const v of trace) count.set(Math.round(v * 10) / 10, (count.get(Math.round(v * 10) / 10) ?? 0) + 1);
  return [...count.entries()].filter(([, n]) => n > trace.length / 100).map(([v]) => v).sort((x, y) => x - y);
}

/** How loud a pitch is in the sound: the size of the pure tone at that frequency. */
const loudness = (sound: Float32Array, hertz: number) => harmonics(sound, RATE, hertz, 1)[0];

/** How often the loudness of a sound swells, from its level over each hundredth of a second. */
function throb(sound: Float32Array): number | null {
  const window = RATE / 100, hop = window / 4;
  const level: number[] = [];
  for (let i = RATE / 2; i + window <= sound.length; i += hop) {
    let mean = 0, square = 0;
    for (let k = 0; k < window; k++) mean += sound[i + k];
    mean /= window;
    for (let k = 0; k < window; k++) square += (sound[i + k] - mean) ** 2;
    level.push(Math.sqrt(square / window));
  }
  return measureSignal(level, RATE / hop).hertz;
}

describe('class 6, more voices: what it says', () => {
  it('has the parts of a class, each with something in it, and no dashes', () => {
    expect(lesson.number).toBe(6);
    expect(lesson.id).toBe('more-voices');
    expect(lesson.unit).toBe('Sound');
    for (const list of [lesson.build, lesson.why, lesson.tries, lesson.keep, lesson.words]) expect(list.length).toBeGreaterThan(0);
    const ids = [...lesson.build, ...lesson.keep].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const text = JSON.stringify([lesson.promise, lesson.startsFrom, lesson.build, lesson.why, lesson.tries, lesson.check, lesson.keep, lesson.words]);
    expect(text).not.toMatch(/[‒-―]/);
    // Every new word is used where the class explains things, not only listed
    const body = [...lesson.build.flatMap((s) => [s.text, s.how]), ...lesson.why.map((p) => p.text), ...lesson.tries.map((t) => t.result.toString())].join(' ').toLowerCase();
    for (const { word } of lesson.words) expect(body).toContain(word.toLowerCase().slice(0, 4));
  });

  it('starts from class 4\'s oscillator, the Simple Oscillator example: 441 Hz, with a switch named SOUND', () => {
    const circuit = oscillator();
    const example = exampleCircuits.find((e) => e.name === 'Simple Oscillator')!.build();
    expect(circuit.getComponents().map((c) => [c.type, c.position, c.parameters])).toEqual(example.components.map((c) => [c.type, c.position, c.parameters]));
    expect(circuit.getConnections()).toHaveLength(example.connections.length);
    expect(resistors(circuit, 27000)).toHaveLength(1);
    expect(resistors(circuit, 2200)).toHaveLength(1);
    expect(only(circuit, 'capacitor').parameters.capacitance).toBe(100e-9);
    expect(only(circuit, 'switch').label).toBe('SOUND');
    expect(hear(circuit).hz(0)!.toFixed(0)).toBe('441');
    expect(step(lesson.build, 'play').how).toContain('It plays 441 Hz');
    expect(why('A load')).toContain('Alone, the first voice ran at 441 Hz');
    // SOUND is what lets it be heard
    const sound = only(circuit, 'switch');
    expect(new Work(circuit).run([{ componentId: sound.id, parameter: 'closed', value: 0 }], 0.2).sound.hertz).toBeNull();
    expect(new Work(circuit).run([], 0.2).sound.hertz).toBeCloseTo(441, -1);
  });

  it('a second voice with twice the resistance plays an octave below: 435 Hz and 217 Hz once the two are mixed', () => {
    const circuit = twoVoices();
    const heard = hear(circuit);
    expect(heard.hz(0)!.toFixed(0)).toBe('435');
    expect(heard.hz(1)!.toFixed(0)).toBe('217');
    expect((heard.hz(0)! / heard.hz(1)!).toFixed(2)).toBe('2.00');
    // 56 kΩ + 2.7 kΩ against 27 kΩ + 2.2 kΩ
    expect(resistors(circuit, 56000)).toHaveLength(1);
    expect(resistors(circuit, 2700)).toHaveLength(1);
    expect((56000 + 2700) / (27000 + 2200)).toBeCloseTo(2, 1);
    expect(step(lesson.build, 'mix').how).toContain('435 Hz and 217 Hz');
    expect(why('Voices')).toContain('58.7 kΩ is about twice the first voice\'s 29.2 kΩ');
    expect(why('A load')).toContain('With a second voice in the mix it ran at 435 Hz');
  });

  it('the chord is 216, 325 and 433 Hz: a note, its fifth (1.50 times) and its octave (2.00 times)', () => {
    const heard = hear(chord());
    const [top, low, middle] = [0, 1, 2].map((i) => heard.hz(i)!);
    expect(low.toFixed(0)).toBe('216');
    expect(middle.toFixed(0)).toBe('325');
    expect(top.toFixed(0)).toBe('433');
    expect((middle / low).toFixed(2)).toBe('1.50');
    expect((top / low).toFixed(2)).toBe('2.00');
    expect(why('Intervals')).toContain('216 Hz, 325 Hz and 433 Hz');
    expect(why('Intervals')).toContain('the fifth above it (1.50 times) and the octave above it (2.00 times)');
    expect(why('A load')).toContain('in the chord it runs at 433 Hz');
    // Each is heard, and equally: equal resistors, equal shares
    const loud = [low, middle, top].map((hertz) => loudness(heard.sound, hertz));
    for (const size of loud) expect(size).toBeGreaterThan(0.19);
    expect(Math.max(...loud) / Math.min(...loud)).toBeLessThan(1.1);
  });

  it('the point where the three 10 kΩ meet moves in steps of 3 V: 0, 3, 6 and 9 V', () => {
    const circuit = chord();
    const mixers = resistors(circuit, 10000);
    expect(mixers).toHaveLength(3);
    const run = new Work(circuit).bench({ seconds: 0.5, watch: [[mixers[0], 1]] });
    const found = levels(run.trace(mixers[0].id, mixers[0].pins[1].id)!);
    expect([...new Set(found.map((v) => Math.round(v)))]).toEqual([0, 3, 6, 9]);
    for (const v of found) expect(Math.abs(v - Math.round(v))).toBeLessThanOrEqual(0.1);
    expect(step(lesson.build, 'look').text).toContain('0, 3, 6 and 9 V');
    expect(step(lesson.build, 'look').how).toContain('steps of 3 V');
  });

  it('1 MΩ and 1 µF go round 1.3 times a second, and leave the chord as it was', () => {
    const circuit = withSlow();
    expect(resistors(circuit, 1e6)).toHaveLength(1);
    const heard = hear(circuit, 4);
    expect(heard.hz(3)!.toFixed(1)).toBe('1.3');
    expect([1, 2, 0].map((i) => heard.hz(i)!.toFixed(0))).toEqual(['216', '325', '433']);
    const slow = measureSignal(heard.y(3), RATE);
    expect(slow.min).toBeLessThan(0.1);
    expect(slow.max).toBeGreaterThan(8.9);
    expect(step(lesson.build, 'rate').text).toContain('reads 1.3 Hz');
    expect(step(lesson.build, 'rate').how).toContain('from 0 V to 9 V');
  });

  it('through the diode the first voice comes in 1.3 bursts a second of 433 Hz, held at 0.6 V in between', () => {
    const heard = hear(chopped(), 4);
    const voice = running(heard.y(0), heard.y(3));
    expect(voice.perSecond!.toFixed(1)).toBe('1.3');
    expect(voice.hertz.toFixed(0)).toBe('433');
    // It runs only while the slow output is high, and evenly
    expect(voice.whileHigh).toBe(1);
    expect(voice.high).toBeCloseTo(0.5, 1);
    expect(heard.hz(3)!.toFixed(1)).toBe('1.3');
    // While the slow output is low the input is held at 0.6 V and the output stays high
    const input = heard.a(0), output = heard.y(0), slow = heard.y(3);
    let lowest = Infinity, highest = -Infinity, outputLow = Infinity;
    for (let i = RATE; i < input.length; i++) {
      // Well inside a low stretch of the slow output: low now, and a hundredth of a second ago
      if (slow[i] > 1 || slow[i - RATE / 100] > 1) continue;
      lowest = Math.min(lowest, input[i]);
      highest = Math.max(highest, input[i]);
      outputLow = Math.min(outputLow, output[i]);
    }
    expect(lowest.toFixed(1)).toBe('0.6');
    expect(highest.toFixed(1)).toBe('0.6');
    expect(outputLow).toBeGreaterThan(8.5);
    // Running, the input turns round at 5.3 V
    expect(measureSignal(heard.a(1).slice(RATE), RATE).max.toFixed(1)).toBe('5.3');
    // The other two voices never stop
    for (const i of [1, 2]) expect(running(heard.y(i)).silences).toBe(0);
    expect(why('The diode')).toContain('holds the voice\'s input at 0.6 V');
    expect(why('The diode')).toContain('never climb to 5.3 V');
    expect(why('An LFO and a gate')).toContain('1.3 bursts a second of 433 Hz');
    expect(step(lesson.build, 'bursts').how).toContain('a block of 433 Hz');
    expect(step(lesson.build, 'bursts').how).toContain('the output stays high');
  });

  it('the Weird Sound Generator gates an oscillator the same way: a diode from its input to another\'s output', () => {
    const wsg = circuitOf(exampleCircuits.find((e) => e.name.includes('Weird'))!.build());
    const work = new Work(wsg);
    const chip = only(wsg, 'cd40106');
    const gates = all(wsg, '1n914').filter((part) => CD40106.A.some((pin) => work.joined(part, DIODE.A, chip, pin))
      && all(wsg, 'switch').some((key) => [0, 1].some((leg) => work.joined(part, DIODE.K, key, leg)
        && CD40106.Y.some((pin) => work.joined(key, 1 - leg, chip, pin)))));
    expect(gates).toHaveLength(1);
    expect(why('An LFO and a gate')).toContain('Weird Sound Generator');
  });

  it('its circuits are laid out with no part on another and every wire drawn', () => {
    const stages = [lesson.start!(), ...lesson.stages!.map((s) => s.circuit()), lesson.circuit(), moreVoicesKept()];
    for (const { components, connections } of stages) {
      const routes = computeWireRoutes(components.map((c) => ({ component: c, position: c.position })), connections, 'schematic');
      expect(routes.size).toBe(connections.length);
      const boxes = components.map((c) => componentObstacles(c, c.position, 'schematic').find((o) => !o.soft)!);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
        }
      }
    }
  });
});

describe('class 6, more voices: the experiments', () => {
  it('two outputs wired straight together both stop, at 4.5 V', () => {
    const circuit = tied(chopped());
    const heard = hear(circuit, 2);
    for (const i of [1, 2]) {
      const output = measureSignal(heard.y(i).slice(RATE / 10), RATE);
      expect(output.mean.toFixed(1)).toBe('4.5');
      expect(output.max - output.min).toBeLessThan(0.2);
      // ...which is between the thresholds, so neither input can get to one
      const input = measureSignal(heard.a(i).slice(RATE), RATE);
      expect(input.min).toBeGreaterThan(3.6);
      expect(input.max).toBeLessThan(5.3);
    }
    // The first voice is not part of it, and carries on
    expect(running(heard.y(0)).hertz).toBeGreaterThan(400);
    const experiment = tryOut('together');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^Both stop\. The joined outputs sit at 4\.5\d V\./);
    expect(made(chopped())).toEqual([]);
    // Whichever two are joined
    expect(experiment.made(new Work(tied(chord(), 0, 2)))).toBe(true);
    expect(experiment.result(new Work(tied(chord(), 0, 2)))).toMatch(/^Both stop\. The joined outputs sit at 4\.[45]\d V\./);
  });

  it('two voices almost alike beat as often as their frequencies differ: 2.6 times a second with 58 kΩ, about once with 59 kΩ', () => {
    const circuit = retune(chopped(), 39000, 58000);
    const heard = hear(circuit, 4);
    const [low, other] = [heard.hz(1)!, heard.hz(2)!];
    expect(low.toFixed(0)).toBe('216');
    expect(other.toFixed(0)).toBe('219');
    expect((other - low).toFixed(1)).toBe('2.6');
    // ...and that is how often the sound of the plain chord swells (without the first voice coming and going over it)
    const plain = hear(retune(chord(), 39000, 58000), 4);
    expect(throb(plain.sound)!).toBeCloseTo(plain.hz(2)! - plain.hz(1)!, 1);
    // The chord as built has no such swell: nothing slower than its own notes
    expect(throb(hear(chord(), 4).sound) ?? Infinity).toBeGreaterThan(20);
    const experiment = tryOut('beat');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^216 Hz and 219 Hz: a throb 2\.6 times a second\./);

    const slower = hear(retune(chopped(), 39000, 59000), 4);
    expect(Math.abs(slower.hz(2)! - slower.hz(1)!)).toBeGreaterThan(0.9);
    expect(Math.abs(slower.hz(2)! - slower.hz(1)!)).toBeLessThan(1.2);
    expect(experiment.made(new Work(retune(chopped(), 39000, 59000)))).toBe(true);
    expect(experiment.result(new Work(circuit))).toContain('Try 59 kΩ: about one beat a second');

    // Exactly alike, they all but stay in step in the app: less than one beat in twenty seconds
    const alike = hear(retune(chopped(), 39000, 58700), 4);
    expect(Math.abs(alike.hz(2)! - alike.hz(1)!)).toBeLessThan(0.05);
    expect(experiment.made(new Work(retune(chopped(), 39000, 58700)))).toBe(false);
    expect(experiment.result(new Work(circuit))).toContain('Type 58.7k and it all but stops');
    expect(experiment.made(new Work(chopped()))).toBe(false);
    expect(experiment.made(new Work(chord()))).toBe(false);
  });

  it('turned round, the diode lets the voice sound only while the slow output is low, and holds it at 8.4 V in between', () => {
    const circuit = diode(noDiode(), 0, 3, true);
    const heard = hear(circuit, 4);
    const voice = running(heard.y(0), heard.y(3));
    expect(voice.perSecond!.toFixed(1)).toBe('1.3');
    expect(voice.whileHigh).toBe(0);
    expect(voice.hertz).toBeGreaterThan(425);
    const input = heard.a(0), output = heard.y(0), slow = heard.y(3);
    let lowest = Infinity, highest = -Infinity, outputHigh = -Infinity;
    for (let i = RATE; i < input.length; i++) {
      if (slow[i] < 8 || slow[i - RATE / 100] < 8) continue;
      lowest = Math.min(lowest, input[i]);
      highest = Math.max(highest, input[i]);
      outputHigh = Math.max(outputHigh, output[i]);
    }
    expect(lowest.toFixed(1)).toBe('8.4');
    expect(highest.toFixed(1)).toBe('8.4');
    expect(outputHigh).toBeLessThan(0.5);
    const experiment = tryOut('round');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^It still comes 1\.3 times a second, but now it sounds while the slow output is low\..* fills the capacitor to 8\.4 V/);
    expect(experiment.made(new Work(chopped()))).toBe(false);
    // A diode with its wires off turns nothing
    expect(experiment.made(new Work(noDiode().addComponent(place('1n914', 360, 160))))).toBe(false);
  });

  it('a 47 kΩ where the diode was never stops the voice: 202 Hz while the slow output is low, 162 Hz while it is high', () => {
    const circuit = resistorForDiode();
    const heard = hear(circuit, 4);
    const voice = running(heard.y(0), heard.y(3));
    expect(voice.silences).toBe(0);
    expect(voice.hertzWhileLow.toFixed(0)).toBe('202');
    expect(voice.hertzWhileHigh.toFixed(0)).toBe('162');
    const experiment = tryOut('resistor');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^No silence now\. The voice plays 202 Hz while the slow output is low and 162 Hz while it is high\./);
    expect(experiment.result(new Work(circuit))).toContain('both pitches are lower than before');
    expect(made(circuit)).toEqual(['resistor']);
    expect(experiment.made(new Work(chopped()))).toBe(false);
    expect(experiment.made(new Work(noDiode()))).toBe(false);
    // A resistor lying beside the circuit bends nothing
    expect(experiment.made(new Work(noDiode().addComponent(resistor(47000, 360, 160))))).toBe(false);
  });

  it('a diode and 10 kΩ across a voice make a pulse: high 14% of each cycle at 367 Hz, or 85% the other way round', () => {
    const circuit = pulse();
    const voice = running(hear(circuit, 2).y(1));
    expect(Math.round(voice.high * 100)).toBe(14);
    expect(voice.hertz.toFixed(0)).toBe('367');
    const turned = running(hear(pulse(true), 2).y(1));
    expect(Math.round(turned.high * 100)).toBe(85);
    const experiment = tryOut('pulse');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^High for 14% of each cycle, at 367 Hz\..* up from 216 Hz\..* high for 85% of each cycle\./);
    expect(experiment.made(new Work(pulse(true)))).toBe(true);
    expect(experiment.result(new Work(pulse(true)))).toMatch(/^High for 85% of each cycle/);
    // The voice that comes and goes is high most of the time, but not for most of each cycle
    expect(made(chopped())).toEqual([]);
    expect(made(gatedFifth())).toEqual([]);
    // ...and on the plain chord too
    expect(experiment.made(new Work(pulse(false, chord())))).toBe(true);
  });

  it('every experiment asks a question with a right answer among its options, and none is made on an empty canvas or the oscillator alone', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(new Circuit('empty')))).toBe(false);
      expect(experiment.made(new Work(oscillator()))).toBe(false);
      expect(experiment.made(new Work(chord()))).toBe(false);
    }
  });
});

describe('class 6, more voices: the check', () => {
  it('has nothing to read on an empty canvas, and says what the build leaves', () => {
    expect(lesson.check.reading(new Work(new Circuit('empty')))).toBeNull();
    expect(lesson.check.passed(new Work(new Circuit('empty')))).toBe(false);
    expect(lesson.check.reading(new Work(chord()))).toBe('No voice is switched on and off');
    expect(lesson.check.reading(new Work(chopped()))).toBe('Only one voice is switched on and off: 433 Hz, 1.3 times a second');
    expect(lesson.check.passed(new Work(chopped()))).toBe(false);
  });

  it('is passed by the hint: a diode each on the two voices a fifth apart, and 680 kΩ in the slow oscillator', () => {
    const circuit = gatedFifth();
    const heard = hear(circuit, 4);
    const low = running(heard.y(1), heard.y(3)), middle = running(heard.y(2), heard.y(3));
    expect(low.perSecond!.toFixed(1)).toBe('1.9');
    expect(middle.perSecond!.toFixed(1)).toBe('1.9');
    expect((middle.hertz / low.hertz).toFixed(1)).toBe('1.5');
    expect(low.whileHigh).toBe(1);
    expect(middle.whileHigh).toBe(1);
    // The first voice is left alone
    expect(running(heard.y(0)).silences).toBe(0);
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    expect(lesson.check.reading(new Work(circuit))).toMatch(/^Switched on and off: 21\d Hz and 32\d Hz, a ratio of 1\.5\d, 1\.9 times a second$/);
    // The hint's sum, and the value it lands on
    expect(1.3 / (2 * 1e-6)).toBeCloseTo(650000, 0);
    expect(lesson.check.hint).toContain('1.3 ÷ (2 × 0.000001) = 650 kΩ');
    expect(lesson.check.hint).toContain('680 kΩ');
    expect(lesson.check.hint).toMatch(/^Calculated, not measured/);
    // All three switched on and off passes too: two of them are a fifth apart
    expect(lesson.check.passed(new Work(diode(circuit, 0)))).toBe(true);
  });

  it('is not passed too slow, with one voice, with the wrong two, or with the two not together', () => {
    // The build's own 1 MΩ: 1.3 times a second
    const slow = gatedFifth(1e6);
    expect(lesson.check.passed(new Work(slow))).toBe(false);
    expect(lesson.check.reading(new Work(slow))).toMatch(/a ratio of 1\.5\d, 1\.3 times a second$/);
    // Too fast
    expect(lesson.check.passed(new Work(gatedFifth(470000)))).toBe(false);
    // One voice only
    const one = retune(chopped(), 1e6, 680000);
    expect(lesson.check.passed(new Work(one))).toBe(false);
    expect(lesson.check.reading(new Work(one))).toBe('Only one voice is switched on and off: 433 Hz, 1.9 times a second');
    // The middle and the top voice are not a fifth apart
    const fourth = retune(diode(chopped(), 2), 1e6, 680000);
    expect(lesson.check.passed(new Work(fourth))).toBe(false);
    expect(lesson.check.reading(new Work(fourth))).toMatch(/a ratio of 1\.33, 1\.9 times a second$/);
    // One diode each way round: they take turns
    const turns = retune(diode(diode(noDiode(), 1), 2, 3, true), 1e6, 680000);
    expect(lesson.check.passed(new Work(turns))).toBe(false);
    expect(lesson.check.reading(new Work(turns))).toMatch(/but not together$/);
    // Diodes lying on the canvas switch nothing
    const loose = retune(noDiode(), 1e6, 680000).addComponent(place('1n914', 360, 100)).addComponent(place('1n914', 260, 100));
    expect(lesson.check.passed(new Work(loose))).toBe(false);
    expect(lesson.check.reading(new Work(loose))).toBe('No voice is switched on and off');
  });
});

describe('class 6, more voices: the steps', () => {
  it('none are done on an empty canvas, and only play on the oscillator it starts from', () => {
    expect(done(new Circuit('empty'))).toEqual([]);
    expect(done(new Circuit('empty'), playing)).toEqual(['play']);
    expect(keptSteps(new Circuit('empty'), playing)).toEqual([]);
    expect(done(oscillator())).toEqual([]);
    expect(done(oscillator(), playing)).toEqual(['play']);
    expect(keptSteps(oscillator())).toEqual([]);
  });

  it('the second oscillator counts once it runs, and its parts lying loose do not', () => {
    const start = oscillator(), chip = chipOf(start);
    const long = resistor(56000, 360, 480), short = resistor(2700, 540, 480), tank = capacitor(100e-9, 160, 340, 90);
    const loose = start.addComponent(long).addComponent(short).addComponent(tank);
    expect(done(loose)).toEqual([]);
    const tankGround = place('ground', 160, 440);
    const second = loose.addComponent(tankGround)
      .addConnection(connect(long, 0, chip, CD40106.A[1])).addConnection(connect(long, 1, short, 0)).addConnection(connect(short, 1, chip, CD40106.Y[1]))
      .addConnection(connect(tank, 0, chip, CD40106.A[1])).addConnection(connect(tank, 1, tankGround, 0));
    expect(done(second)).toEqual(['second']);
    // With the way back from its output broken it does not run
    expect(done(second.removeComponent(long.id))).toEqual([]);

    // The first 10 kΩ dropped onto the wire from 1Y to SOUND, then the second from 2Y to its far end
    const sound = only(second, 'switch');
    const wire = second.getConnections().find((c) => c.from.componentId === chip.id && c.to.componentId === sound.id)!;
    const first = resistor(10000, 720, 210);
    expect(done(second.addComponent(first))).toEqual(['second']);
    const oneMixed = spliceIntoWire(second.addComponent(first), first, wire.id);
    expect(done(oneMixed)).toEqual(['second', 'mixer']);
    const other = resistor(10000, 720, 270);
    const bothMixed = oneMixed.addComponent(other).addConnection(connect(chip, CD40106.Y[1], other, 0)).addConnection(connect(other, 1, sound, 0));
    expect(done(bothMixed)).toEqual(['second', 'mixer', 'mix']);
    const heard = hear(bothMixed);
    expect([heard.hz(0)!.toFixed(0), heard.hz(1)!.toFixed(0)]).toEqual(['435', '217']);
    // The second voice wired straight to the point, with no resistor of its own, is not mixed
    const straight = oneMixed.addConnection(connect(chip, CD40106.Y[1], sound, 0));
    expect(step(lesson.build, 'mix').done(new Work(straight))).toBe(false);
  });

  it('each part of the build is done on its own circuit, and the next is not', () => {
    expect(done(twoVoices())).toEqual(['second', 'mixer', 'mix']);
    expect(done(chord())).toEqual(['second', 'mixer', 'mix', 'third', 'chord']);
    expect(done(withSlow())).toEqual(['second', 'mixer', 'mix', 'third', 'chord', 'slow']);
    expect(done(chopped())).toEqual(['second', 'mixer', 'mix', 'third', 'chord', 'slow', 'gate']);
    // A third voice that is not in the mix is a voice, not a chord
    const circuit = chord();
    const mixer = resistors(circuit, 10000)[2];
    expect(done(circuit.removeComponent(mixer.id))).toEqual(['second', 'mixer', 'mix', 'third']);
    // A diode lying on the canvas, or wired by one leg, gates nothing
    expect(done(noDiode().addComponent(place('1n914', 360, 160)))).toEqual(['second', 'mixer', 'mix', 'third', 'chord', 'slow']);
    const final = chopped(), gate = only(final, '1n914');
    const oneLeg = final.getConnections().find((c) => c.from.componentId === gate.id && c.from.pinId === gate.pins[DIODE.K].id)!;
    expect(done(final.removeConnection(oneLeg.id))).toEqual(['second', 'mixer', 'mix', 'third', 'chord', 'slow']);
  });

  it('the mix is looked at with a probe, the slow output with the meter, the bursts with a second probe', () => {
    const circuit = chord(), chip = chipOf(circuit);
    const mixer = resistors(circuit, 10000)[0];
    const at = (part: Component, pin: number) => ({ componentId: part.id, pinId: part.pins[pin].id });
    const look = step(lesson.build, 'look');
    expect(look.done(new Work(circuit, { ...playing, probes: [at(mixer, 1)] }))).toBe(true);
    expect(look.done(new Work(circuit, { ...playing, probes: [at(only(circuit, 'audio-output'), 0)] }))).toBe(true);
    expect(look.done(new Work(circuit, { ...NOWHERE, probes: [at(mixer, 1)] }))).toBe(false); // not playing
    expect(look.done(new Work(circuit, { ...playing, probes: [at(chip, CD40106.Y[0])] }))).toBe(false); // one voice is not the mix
    expect(look.done(new Work(circuit, playing))).toBe(false);
    expect(look.done(new Work(twoVoices(), { ...playing, probes: [at(resistors(twoVoices(), 10000)[0], 1)] }))).toBe(false); // not three yet

    const slow = withSlow(), slowChip = chipOf(slow);
    const wireOn = (c: Circuit, part: Component, pin: number) =>
      c.getConnections().find((w) => [w.from, w.to].some((end) => end.componentId === part.id && end.pinId === part.pins[pin].id))!.id;
    const rate = step(lesson.build, 'rate');
    expect(rate.done(new Work(slow, { ...playing, wires: [wireOn(slow, slowChip, CD40106.Y[3])] }))).toBe(true);
    expect(rate.done(new Work(slow, { ...playing, wires: [wireOn(slow, slowChip, CD40106.Y[0])] }))).toBe(false);
    expect(rate.done(new Work(slow, { ...NOWHERE, wires: [wireOn(slow, slowChip, CD40106.Y[3])] }))).toBe(false);

    const final = chopped(), finalChip = chipOf(final);
    const bursts = step(lesson.build, 'bursts');
    expect(bursts.done(new Work(final, { ...playing, probes: [at(finalChip, CD40106.Y[0])] }))).toBe(true);
    expect(bursts.done(new Work(final, { ...playing, probes: [at(finalChip, CD40106.Y[1])] }))).toBe(false); // that voice never stops
    expect(bursts.done(new Work(final, playing))).toBe(false);
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['mix', 'look', 'rate']);
    const count = (circuit: Circuit) => [resistors(circuit, 10000).length, all(circuit, 'capacitor').length, all(circuit, '1n914').length];
    expect(count(classStage(lesson, []))).toEqual([2, 2, 0]);
    expect(count(classStage(lesson, ['play', 'second', 'mixer']))).toEqual([2, 2, 0]);
    expect(count(classStage(lesson, ['play', 'second', 'mixer', 'mix']))).toEqual([3, 3, 0]);
    expect(count(classStage(lesson, ['play', 'second', 'mixer', 'mix', 'third', 'chord', 'look']))).toEqual([3, 4, 0]);
    expect(count(classStage(lesson, ['play', 'second', 'mixer', 'mix', 'third', 'chord', 'look', 'slow', 'rate']))).toEqual([3, 4, 1]);
    expect(count(classStage(lesson, lesson.build.map((s) => s.id)))).toEqual([3, 4, 1]);
    // Every circuit on the way keeps class 4's parts where they were, the switch and the Audio Out aside
    const moved = (circuit: Circuit) => oscillator().getComponents()
      .filter((part, i) => JSON.stringify(circuit.getComponents()[i].position) !== JSON.stringify(part.position)).map((part) => part.type);
    for (const circuit of [twoVoices(), chord(), withSlow(), chopped(), keptCircuit()]) expect(moved(circuit)).toEqual(['switch', 'audio-output']);
  });

  it('keeping it: a switch on the fifth, named FIFTH, the diodes and the slow oscillator cleared away, a look at the cover, and a save', () => {
    // None of it is done by the build, not even by the chord before the slow oscillator was added
    for (const circuit of [chord(), withSlow(), chopped(), gatedFifth()]) expect(keptSteps(circuit, playing)).toEqual([]);

    const { circuit: keyed, key } = withKey(gatedFifth());
    expect(keptSteps(keyed)).toEqual(['key']);
    // SOUND takes every voice out, so it is not the switch for the fifth; nor is a switch on another voice
    expect(step(lesson.keep, 'name').done(new Work(keyed.updateComponent(named(keyed, 'SOUND').id, { label: 'FIFTH' })))).toBe(false);
    expect(keptSteps(keyed.addComponent(place('switch', 100, 100, { label: 'FIFTH' })))).toEqual(['key']);
    const base = chord(), baseChip = chipOf(base);
    const onLow = base.getConnections().find((c) => c.from.componentId === baseChip.id && c.from.pinId === baseChip.pins[CD40106.Y[1]].id
      && base.getComponent(c.to.componentId)?.parameters.resistance === 10000)!;
    const wrongKey = place('switch', 620, 270, { parameters: { closed: 1 } });
    expect(keptSteps(spliceIntoWire(base.addComponent(wrongKey), wrongKey, onLow.id))).toEqual([]);

    const namedKey = keyed.updateComponent(key.id, { label: 'fifth' });
    expect(keptSteps(namedKey)).toEqual(['key', 'name']);
    const tidy = tidied(namedKey);
    expect(all(tidy, '1n914')).toHaveLength(0);
    expect(keptSteps(tidy)).toEqual(['key', 'name', 'tidy']);
    // One diode left behind, or the slow oscillator still running, is not tidy
    expect(keptSteps(removeFromCircuit(namedKey, [all(namedKey, '1n914')[0].id]))).toEqual(['key', 'name']);
    expect(keptSteps(removeFromCircuit(namedKey, all(namedKey, '1n914').map((d) => d.id)))).toEqual(['key', 'name']);
    expect(keptSteps(tidy, { ...playing, view: 'cover' })).toEqual(['key', 'name', 'tidy', 'cover']);
    expect(keptSteps(tidy, { ...playing, saved: true })).toEqual(['key', 'name', 'tidy', 'save']);
    expect(step(lesson.keep, 'save').done(new Work(new Circuit('empty'), { ...playing, saved: true }))).toBe(false);
    // The chord is back as it was
    const heard = hear(tidy);
    expect([1, 2, 0].map((i) => heard.hz(i)!.toFixed(0))).toEqual(['216', '325', '433']);
  });

  it('what it keeps is the chord by itself: FIFTH takes the middle note out and leaves the other two louder, SOUND silences it all', () => {
    const kept = keptCircuit();
    expect(keptSteps(kept)).toEqual(['key', 'name', 'tidy']);
    expect(all(kept, 'switch').map((s) => [s.label, s.parameters.closed]).sort()).toEqual([['FIFTH', 1], ['SOUND', 1]]);
    expect(all(kept, '1n914')).toHaveLength(0);
    expect(resistors(kept, 1e6)).toHaveLength(0);
    const fifth = named(kept, 'FIFTH'), sound = named(kept, 'SOUND');
    const open = (key: Component) => [{ componentId: key.id, parameter: 'closed', value: 0 }];

    const whole = hear(kept);
    const [top, low, middle] = [0, 1, 2].map((i) => whole.hz(i)!);
    expect([low, middle, top].map((hertz) => hertz.toFixed(0))).toEqual(['216', '325', '433']);
    for (const hertz of [low, middle, top]) expect(loudness(whole.sound, hertz)).toBeGreaterThan(0.19);

    const without = hear(kept, 1, open(fifth));
    expect(loudness(without.sound, without.hz(2)!)).toBeLessThan(0.01);
    expect(loudness(without.sound, middle)).toBeLessThan(0.01);
    // The two left are an octave apart, and each is louder than it was
    expect((without.hz(0)! / without.hz(1)!).toFixed(2)).toBe('2.00');
    for (const i of [0, 1]) expect(loudness(without.sound, without.hz(i)!)).toBeGreaterThan(1.4 * loudness(whole.sound, whole.hz(i)!));
    expect(step(lesson.keep, 'key').how).toContain('each is louder');
    // Two share the point now: 0, 4.5 and 9 V
    const mixer = resistors(kept, 10000)[0];
    const run = new Work(kept).bench({ seconds: 0.5, set: open(fifth), watch: [[mixer, 1]] });
    expect(levels(run.trace(mixer.id, mixer.pins[1].id)!).map((v) => Math.round(v * 2) / 2)).toEqual([0, 4.5, 9]);

    const silent = new Work(kept).run(open(sound), 0.5).sound;
    expect(silent.hertz).toBeNull();
    expect(silent.max - silent.min).toBeLessThan(0.01);
    // It is the build's chord with one switch more
    expect(kept.getComponents()).toHaveLength(chord().getComponents().length + 1);
  });
});
