/**
 * Class 10 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { steps as lesson, stepsKept, readSequence, type Sequence } from '@/classes/steps';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { CD40106, CD4017, DIODE, LED, NE555, POT } from '@/classes/kit';
import { connect, exampleCircuits, ground, place, pot, resistor } from '@/examples/circuits';
import { spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import type { Component } from '@/types/circuit';
import type { Built, Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

type Change = { componentId: string; parameter: string; value: number };

const mA = (amps: number) => amps * 1000;
const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const built = ({ components, connections }: Built): Circuit => {
  let circuit = new Circuit('built');
  for (const c of components) circuit = circuit.addComponent(c);
  for (const c of connections) circuit = circuit.addConnection(c);
  return circuit;
};
const add = (circuit: Circuit, parts: Component[], wires: ReturnType<typeof connect>[]): Circuit => {
  let next = circuit;
  for (const part of parts) next = next.addComponent(part);
  for (const wire of wires) next = next.addConnection(wire);
  return next;
};
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const why = (title: string) => lesson.why.find((p) => p.title === title)!.text;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);
const kept = (work: Work) => lesson.keep.filter((s) => s.done(work)).map((s) => s.id);
const empty = () => new Work(new Circuit('empty'));

const ohmsOf = (part: Component) => Number(part.parameters.resistance);
const resistors = (circuit: Circuit, ohms: number) => all(circuit, 'resistor').filter((r) => ohmsOf(r) === ohms);
const setOhms = (circuit: Circuit, part: Component, value: number) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, resistance: value, value: formatValue(value, 'resistance') } });
const setFarads = (circuit: Circuit, part: Component, value: number) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, capacitance: value, value: formatValue(value, 'capacitance') } });
/** The wires that end on a pin. */
const wiresOn = (circuit: Circuit, part: Component, pin: number) => circuit.getConnections().filter((c) =>
  (c.from.componentId === part.id && c.from.pinId === part.pins[pin].id) || (c.to.componentId === part.id && c.to.pinId === part.pins[pin].id));
/** The wire between two parts. */
const wireBetween = (circuit: Circuit, a: Component, b: Component) => circuit.getConnections().find((c) =>
  (c.from.componentId === a.id && c.to.componentId === b.id) || (c.from.componentId === b.id && c.to.componentId === a.id))!;
/** A two-legged part of a kind with a leg on a pin. */
const onPin = (circuit: Circuit, parts: Component[], part: Component, pin: number) => {
  const work = new Work(circuit);
  return parts.filter((p) => [0, 1].some((leg) => work.joined(p, leg, part, pin)));
};

// --- The circuits of the class ---

/** The tone the class starts from, the chaser of ten steps beside the retuned tone, the chaser of four, and the sequencer. */
const start = () => classStart(lesson);
const tenChaser = () => classStage(lesson, []);
const fourChaser = () => classStage(lesson, ['retune', 'clock', 'counter', 'lights', 'chase']);
const sequencer = () => classCircuit(lesson);
const keptCircuit = () => built(stepsKept());

const counterOf = (circuit: Circuit) => only(circuit, 'cd4017');
const voiceOf = (circuit: Circuit) => only(circuit, 'ne555');
/** The LED on an output of the counter, through its 1 kΩ. */
const ledOf = (circuit: Circuit, q: number): Component => {
  const limit = onPin(circuit, resistors(circuit, 1000), counterOf(circuit), CD4017.Q[q])[0];
  const work = new Work(circuit);
  return all(circuit, 'led').find((led) => [0, 1].some((leg) => work.joined(led, LED.A, limit, leg)))!;
};
/** The resistor from an output of the counter to CTRL. */
const noteOf = (circuit: Circuit, q: number): Component =>
  onPin(circuit, onPin(circuit, all(circuit, 'resistor'), voiceOf(circuit), NE555.CTRL), counterOf(circuit), CD4017.Q[q])[0];

// --- Circuits a learner might have ---

/** A resistor from an output of the counter to the 555's CTRL. */
function withNote(circuit: Circuit, q: number, ohms: number): Circuit {
  const note = resistor(ohms, 900, 120 + q * 100);
  return add(circuit, [note], [connect(counterOf(circuit), CD4017.Q[q], note, 0), connect(note, 1, voiceOf(circuit), NE555.CTRL)]);
}
/** The second step's 10 kΩ changed for 22 kΩ. */
const composed = (circuit = sequencer()) => setOhms(circuit, noteOf(circuit, 1), 22e3);
/** The wire from Q0 to the first light's 1 kΩ taken off: the resistor and the LED are left hanging. */
function lightOff(circuit = sequencer()): Circuit {
  const limit = onPin(circuit, resistors(circuit, 1000), counterOf(circuit), CD4017.Q[0])[0];
  return circuit.removeConnection(wireBetween(circuit, counterOf(circuit), limit).id);
}
/** One more LED with its own 1 kΩ, fed from two outputs through a diode each. */
function withShared(circuit: Circuit, a: number, b: number): Circuit {
  const counter = counterOf(circuit);
  const first = place('1n914', 820, 480), second = place('1n914', 920, 480);
  const limit = resistor(1000, 1160, 660, 90);
  const led = place('led', 1160, 760, { rotation: 90 });
  const ledGround = ground(1160, 860);
  return add(circuit, [first, second, limit, led, ledGround], [
    connect(counter, CD4017.Q[a], first, DIODE.A), connect(counter, CD4017.Q[b], second, DIODE.A),
    connect(first, DIODE.K, limit, 0), connect(second, DIODE.K, limit, 0),
    connect(limit, 1, led, LED.A), connect(led, LED.K, ledGround, 0),
  ]);
}
/** The LED that `withShared` added: the last one put down. */
const sharedLed = (circuit: Circuit) => all(circuit, 'led')[all(circuit, 'led').length - 1];
/** The clock's resistor, by its value. */
const feedbackOf = (circuit: Circuit, ohms = 470e3) => resistors(circuit, ohms)[0];
/** The clock's 470 kΩ made 47 kΩ, and a 500 kΩ pot dropped into the wire from it to 1A, as the shelf drops one. */
function withTempo(circuit = sequencer()): Circuit {
  const feedback = feedbackOf(circuit);
  const knob = pot('', 500e3, 0.5, 300, 560);
  // The resistor's first leg is the one wired to 1A
  return spliceIntoWire(setOhms(circuit, feedback, 47e3), knob, wiresOn(circuit, feedback, 0)[0].id);
}
/** A switch dropped into the wire from Q4 to RST, and (unless told not to) 100 kΩ from RST to ground. */
function withShort(circuit = sequencer(), options: { pullDown?: boolean; closed?: boolean } = {}): Circuit {
  const counter = counterOf(circuit);
  const wire = circuit.getConnections().find((c) => wiresOn(circuit, counter, CD4017.RST).includes(c) && wiresOn(circuit, counter, CD4017.Q[4]).includes(c))!;
  const short = place('switch', 840, 540, { parameters: { closed: options.closed === false ? 0 : 1 } });
  let next = spliceIntoWire(circuit, short, wire.id);
  if (options.pullDown === false) return next;
  const pullDown = resistor(100e3, 580, 500, 90);
  const pullDownGround = ground(580, 600);
  next = add(next, [pullDown, pullDownGround], [connect(pullDown, 0, counter, CD4017.RST), connect(pullDown, 1, pullDownGround, 0)]);
  return next;
}
/** The loop made eight steps long: whatever ran from Q4 towards RST now runs from Q8. */
function eightSteps(circuit: Circuit): Circuit {
  const counter = counterOf(circuit);
  // The wire that leaves Q4 for RST or for the switch, not the one that feeds a diode
  const wire = wiresOn(circuit, counter, CD4017.Q[4]).find((c) => {
    const other = circuit.getComponent(c.from.componentId === counter.id && c.from.pinId === counter.pins[CD4017.Q[4]].id ? c.to.componentId : c.from.componentId)!;
    return other.type === 'switch' || other.id === counter.id;
  })!;
  const far = wire.from.componentId === counter.id && wire.from.pinId === counter.pins[CD4017.Q[4]].id ? wire.to : wire.from;
  const target = circuit.getComponent(far.componentId)!;
  return circuit.removeConnection(wire.id)
    .addConnection(connect(counter, CD4017.Q[8], target, target.pins.findIndex((pin) => pin.id === far.pinId)));
}
/** The clock's 470 kΩ changed for another value. */
const withClock = (circuit: Circuit, ohms: number) => setOhms(circuit, feedbackOf(circuit), ohms);
/** What passes the check: eight steps, 330 kΩ on the clock, and an LED fed from Q0 and Q4 through diodes. */
const checked = () => withShared(withClock(eightSteps(sequencer()), 330e3), 0, 4);

// --- Reading them ---

const closed = (circuit: Circuit): Change[] => all(circuit, 'switch').map((part) => ({ componentId: part.id, parameter: 'closed', value: 1 }));
const open = (circuit: Circuit): Change[] => all(circuit, 'switch').map((part) => ({ componentId: part.id, parameter: 'closed', value: 0 }));
const turned = (circuit: Circuit, position: number): Change[] => all(circuit, 'potentiometer').map((part) => ({ componentId: part.id, parameter: 'position', value: position }));

/** What is lit on each step, read slowly. */
const lights = (circuit: Circuit, set: Change[] = closed(circuit), seconds = 5): Sequence =>
  readSequence(new Work(circuit), { seconds, sampleRate: 1000, set })!;
/** The notes as the app plays them. */
const playedNotes = (circuit: Circuit, set: Change[] = closed(circuit), seconds = 2.2): Sequence =>
  readSequence(new Work(circuit), { seconds, sampleRate: 48000, set })!;
/** The pitch on the step where an output is high. */
const note = (sequence: Sequence, count: number) => sequence.steps.find((s) => s.count === count && s.hertz !== null)!.hertz!;
/** The ids of the LEDs lit on each count that was seen, as one list per count. */
const litOn = (circuit: Circuit, sequence: Sequence, count: number): string[][] =>
  sequence.steps.filter((s) => s.count === count).map((s) => all(circuit, 'led').filter((led) => s.amps.get(led.id)! > 1e-4).map((led) => led.id));
/** The class's own sequencer as the app plays it: read once, since nothing about it changes. */
let asBuilt: Sequence | undefined;
const sequencerNotes = (): Sequence => (asBuilt ??= playedNotes(sequencer()));
/** The tone by itself, as the app plays it. */
const toneOf = (circuit: Circuit) => new Work(circuit).bench({ seconds: 0.5 }).sound.hertz!;

describe('class 10, steps: what it says', () => {
  it('has the parts of a class, each with something in it', () => {
    expect(lesson.number).toBe(10);
    expect(lesson.id).toBe('steps');
    expect(lesson.unit).toBe('Logic and rhythm');
    for (const list of [lesson.build, lesson.why, lesson.tries, lesson.keep, lesson.words]) expect(list.length).toBeGreaterThan(0);
    const ids = [...lesson.build, ...lesson.keep].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options[experiment.answer]).toBeDefined();
    }
    const text = JSON.stringify(lesson, (_key, value) => (typeof value === 'function' ? undefined : value));
    expect(text).not.toMatch(/[—–]/);
  });

  it('starts from class 9\'s tone: a 555 running free on 10 kΩ, 47 kΩ and 10 nF, with an Audio Out', () => {
    const circuit = start();
    const voice = voiceOf(circuit);
    const work = new Work(circuit);
    expect(all(circuit, 'audio-output')).toHaveLength(1);
    expect(work.joined(voice, NE555.OUT, only(circuit, 'audio-output'), 0)).toBe(true);
    expect(work.joined(voice, NE555.RESET, only(circuit, 'power'), 0)).toBe(true);
    expect(work.joined(voice, NE555.THRES, voice, NE555.TRIG)).toBe(true);
    expect(resistors(circuit, 10e3)).toHaveLength(1);
    expect(resistors(circuit, 47e3)).toHaveLength(1);
    expect(Number(only(circuit, 'capacitor').parameters.capacitance)).toBe(10e-9);
    // A high whistle, somewhere about 1.3 to 1.4 kHz: the class quotes no figure for it
    expect(toneOf(circuit)).toBeGreaterThan(1300);
    expect(toneOf(circuit)).toBeLessThan(1400);
    expect(done(work)).toEqual([]);
    expect(kept(work)).toEqual([]);
  });

  it('retuned, the tone is 255 Hz, as class 9\'s formula says', () => {
    const base = start();
    const retuned = setFarads(setOhms(setOhms(base, resistors(base, 47e3)[0], 4.7e3), resistors(base, 10e3)[0], 47e3), only(base, 'capacitor'), 100e-9);
    expect(toneOf(retuned).toFixed(0)).toBe('255');
    expect((1.44 / ((47e3 + 2 * 4.7e3) * 100e-9)).toFixed(0)).toBe('255');
    // Beside the chaser it is the same tone: nothing joins the two but the supply
    expect(toneOf(tenChaser()).toFixed(0)).toBe('255');
    expect(step(lesson.build, 'retune').how).toContain('a low 255 Hz');
    expect(step(lesson.build, 'retune').how).toContain('1.44 ÷ ((47 kΩ + 2 × 4.7 kΩ) × 100 nF) = 255 Hz');
    expect(why('Why the tone was retuned')).toContain('the 255 Hz the tone had alone');
  });

  it('the clock ticks 2.8 times a second', () => {
    for (const circuit of [tenChaser(), fourChaser(), sequencer()]) expect(lights(circuit).rate.toFixed(1)).toBe('2.8');
    const circuit = tenChaser();
    const chip = only(circuit, 'cd40106');
    const run = new Work(circuit).bench({ seconds: 3, sampleRate: 8000, watch: [[chip, CD40106.Y[0]]] });
    expect(run.volts(chip.id, chip.pins[CD40106.Y[0]].id).hertz!.toFixed(1)).toBe('2.8');
    expect(step(lesson.build, 'clock').how).toContain('2.8 Hz');
    expect(step(lesson.build, 'chase').text).toContain('2.8 steps a second');
    expect(why('A sequence')).toContain('2.8 steps a second');
  });

  it('ten steps: one light at a time on the first four, then six steps of darkness', () => {
    const circuit = tenChaser();
    const sequence = lights(circuit);
    expect(sequence.loop).toBe(10);
    for (let q = 0; q < 4; q++) {
      const turns = litOn(circuit, sequence, q);
      expect(turns.length).toBeGreaterThan(0);
      for (const lit of turns) expect(lit).toEqual([ledOf(circuit, q).id]);
    }
    for (let q = 4; q < 10; q++) {
      const turns = litOn(circuit, sequence, q);
      expect(turns.length).toBeGreaterThan(0);
      for (const lit of turns) expect(lit).toEqual([]);
    }
    // Each step follows the one before
    const counts = sequence.steps.map((s) => s.count!);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBe((counts[i - 1] + 1) % 10);
    expect(step(lesson.build, 'chase').text).toContain('six steps of darkness');
    expect(why('One of ten')).toContain('Q0 to Q9');
  });

  it('INH and RST left open, the chip still counts in the app', () => {
    const circuit = tenChaser();
    const counter = counterOf(circuit);
    let bare = circuit;
    for (const wire of [...wiresOn(circuit, counter, CD4017.INH), ...wiresOn(circuit, counter, CD4017.RST)]) bare = bare.removeConnection(wire.id);
    expect(lights(bare).loop).toBe(10);
    expect(step(lesson.build, 'counter').how).toContain('one left open reads low and the chip still counts');
    // Lights that chase show the counter to be working, however its spare inputs were left
    expect(done(new Work(bare))).toEqual(['retune', 'clock', 'counter', 'lights']);
    // ...but until there are lights to show it, the step wants them wired as it says
    let dark = bare;
    for (const led of all(bare, 'led')) dark = dark.removeComponent(led.id);
    expect(done(new Work(dark))).toEqual(['retune', 'clock']);
    let wired = circuit;
    for (const led of all(circuit, 'led')) wired = wired.removeComponent(led.id);
    expect(done(new Work(wired))).toEqual(['retune', 'clock', 'counter']);
  });

  it('RST on Q4 makes it four steps, and Q4 is high for too short a time to see', () => {
    const circuit = fourChaser();
    const sequence = lights(circuit);
    expect(sequence.loop).toBe(4);
    for (const s of sequence.steps) expect(all(circuit, 'led').filter((led) => s.amps.get(led.id)! > 1e-4)).toHaveLength(1);
    expect(sequence.tops[4]).toBeLessThan(0.5);
    expect(sequence.tops[0]).toBeGreaterThan(7);
    expect(step(lesson.build, 'loop').text).toContain('four steps');
    expect(why('Reset')).toContain('too short a time to see');
  });

  it('the loop does not begin on the first light', () => {
    for (const circuit of [tenChaser(), fourChaser(), sequencer()]) expect(lights(circuit).steps[0].count).not.toBe(0);
    expect(why('Where it starts')).toContain('does not begin on the first light');
  });

  it('one resistor from Q0 to CTRL: 208 Hz on its step, 552 Hz on the other three', () => {
    const sequence = playedNotes(withNote(fourChaser(), 0, 4700));
    expect(note(sequence, 0).toFixed(0)).toBe('208');
    for (const q of [1, 2, 3]) expect(note(sequence, q).toFixed(0)).toBe('552');
    const how = step(lesson.build, 'first-note').how;
    expect(how).toContain('the tone is 208 Hz');
    expect(how).toContain('the tone is 552 Hz');
  });

  it('four resistors: 466, 642, 559 and 712 Hz, from 4.11, 3.14, 3.56 and 2.85 V on CTRL', () => {
    const circuit = sequencer();
    const sequence = playedNotes(circuit);
    expect([0, 1, 2, 3].map((q) => note(sequence, q).toFixed(0))).toEqual(['466', '642', '559', '712']);
    expect([0, 1, 2, 3].map((q) => ohmsOf(noteOf(circuit, q)))).toEqual([4.7e3, 10e3, 6.8e3, 15e3]);

    // CTRL on each step: its level while each output is high
    const voice = voiceOf(circuit), counter = counterOf(circuit);
    const run = new Work(circuit).bench({ seconds: 2.2, watch: [[voice, NE555.CTRL], ...[0, 1, 2, 3].map((q) => [counter, CD4017.Q[q]] as const)] });
    const ctrl = run.trace(voice.id, voice.pins[NE555.CTRL].id)!;
    const level = (q: number) => {
      const output = run.trace(counter.id, counter.pins[CD4017.Q[q]].id)!;
      let sum = 0, n = 0;
      for (let i = 0; i < ctrl.length; i++) if (output[i] > 5) { sum += ctrl[i]; n++; }
      return sum / n;
    };
    expect([0, 1, 2, 3].map((q) => level(q).toFixed(2))).toEqual(['4.11', '3.14', '3.56', '2.85']);
    // By itself CTRL sits at 6 V
    const alone = fourChaser();
    const quiet = new Work(alone).bench({ watch: [[voiceOf(alone), NE555.CTRL]] });
    expect(quiet.volts(voiceOf(alone).id, voiceOf(alone).pins[NE555.CTRL].id).mean.toFixed(2)).toBe('6.00');

    expect(step(lesson.build, 'notes').how).toContain('466, 642, 559 and 712 Hz');
    expect(step(lesson.build, 'stair').how).toContain('4.11, 3.14, 3.56 and 2.85 V');
    const voltage = why('A voltage for every step');
    for (const quoted of ['4.11 V through the 4.7 kΩ', '2.85 V through the 15 kΩ', '466 Hz against 712 Hz']) expect(voltage).toContain(quoted);
    expect(why('Why the tone was retuned')).toContain('By itself CTRL sits at 6 V');
  });

  it('a run slow enough to be cheap still tells the notes apart', () => {
    const circuit = sequencer();
    const fast = playedNotes(circuit);
    const cheap = readSequence(new Work(circuit), { seconds: 2.2, sampleRate: 8000, set: [] })!;
    for (const q of [0, 1, 2, 3]) expect(Math.abs(note(cheap, q) / note(fast, q) - 1)).toBeLessThan(0.1);
    expect(cheap.loop).toBe(4);
    // A run at a thousand samples a second reads lights and not notes
    expect(lights(circuit).steps.every((s) => s.hertz === null)).toBe(true);
    // Without a counter, or with a clock that does not tick, there is no sequence
    expect(readSequence(new Work(start()), { seconds: 1, sampleRate: 1000 })).toBeNull();
    const ticking = tenChaser();
    const stopped = ticking.removeComponent(feedbackOf(ticking).id);
    expect(readSequence(new Work(stopped), { seconds: 1, sampleRate: 1000 })).toBeNull();
    expect(readSequence(empty(), { seconds: 1, sampleRate: 1000 })).toBeNull();
  });
});

describe('class 10, steps: the experiments', () => {
  it('22 kΩ on the second step lifts its note from 642 to 714 Hz, and the other three fall', () => {
    const circuit = composed();
    const sequence = playedNotes(circuit);
    expect(note(sequence, 1).toFixed(0)).toBe('714');
    const before = sequencerNotes();
    expect(note(before, 1).toFixed(0)).toBe('642');
    for (const q of [0, 2, 3]) expect(note(sequence, q)).toBeLessThan(note(before, q) * 0.97);
    const experiment = tryOut('compose');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^714 Hz, up from 642 Hz\. .* moved too, to 426 Hz, 515 Hz and 66[45] Hz:/);
    expect(experiment.made(new Work(sequencer()))).toBe(false);
    // 22 kΩ on another step is not the change, nor is a 22 kΩ lying loose
    const base = sequencer();
    expect(experiment.made(new Work(setOhms(base, noteOf(base, 2), 22e3)))).toBe(false);
    expect(experiment.made(new Work(sequencer().addComponent(resistor(22e3, 0, 0))))).toBe(false);
  });

  it('with its light off, Q0 reaches 8.75 V where it reached 7.33 V, and the first note falls from 466 to 415 Hz', () => {
    const circuit = lightOff();
    const sequence = playedNotes(circuit);
    expect(note(sequence, 0).toFixed(0)).toBe('415');
    expect(sequence.tops[0].toFixed(2)).toBe('8.75');
    expect(sequencerNotes().tops[0].toFixed(2)).toBe('7.33');
    // The other three notes stay where they were
    expect([1, 2, 3].map((q) => note(sequence, q).toFixed(0))).toEqual(['642', '559', '712']);
    const experiment = tryOut('light-off');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^415 Hz, down from 466 Hz\. .* at 7\.33 V while it was high\. With the LED gone Q0 reaches 8\.75 V,/);
    expect(experiment.made(new Work(sequencer()))).toBe(false);
    // The second light taken off is not the first
    const base = sequencer();
    const limit = onPin(base, resistors(base, 1000), counterOf(base), CD4017.Q[1])[0];
    expect(experiment.made(new Work(base.removeConnection(wireBetween(base, counterOf(base), limit).id)))).toBe(false);
    // Nor is the chaser, which has no notes
    expect(experiment.made(new Work(fourChaser()))).toBe(false);
  });

  it('an LED fed from Q0 and Q2 through diodes lights on steps one and three, at 3.83 mA, and both notes go up', () => {
    const circuit = withShared(sequencer(), 0, 2);
    const sequence = lights(circuit);
    const shared = sharedLed(circuit);
    for (const q of [0, 2]) for (const lit of litOn(circuit, sequence, q)) expect(lit).toContain(shared.id);
    for (const q of [1, 3]) for (const lit of litOn(circuit, sequence, q)) expect(lit).not.toContain(shared.id);
    expect(mA(sequence.steps.find((s) => s.count === 0)!.amps.get(shared.id)!).toFixed(2)).toBe('3.83');
    // The lights on Q0 and Q2 themselves are still lit, a little less than before
    expect(mA(sequence.steps.find((s) => s.count === 0)!.amps.get(ledOf(circuit, 0).id)!)).toBeGreaterThan(4);
    const played = playedNotes(circuit), before = sequencerNotes();
    for (const q of [0, 2]) expect(note(played, q)).toBeGreaterThan(note(before, q) * 1.03);
    const experiment = tryOut('both');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^Steps one and three, at 3\.83 mA\. .* both notes went up/);
    expect(experiment.made(new Work(sequencer()))).toBe(false);
    // On steps one and two is not it, nor are the parts lying loose
    expect(experiment.made(new Work(withShared(sequencer(), 0, 1)))).toBe(false);
    expect(experiment.made(new Work(add(sequencer(), [place('1n914', 0, 0), place('1n914', 100, 0), place('led', 200, 0)], [])))).toBe(false);
  });

  it('two outputs wired straight together fight: the app lets it pass', () => {
    const base = sequencer();
    const fight = base.addConnection(connect(counterOf(base), CD4017.Q[0], counterOf(base), CD4017.Q[2]));
    const run = new Work(fight).bench({ seconds: 1, sampleRate: 8000 });
    for (const part of fight.getComponents()) expect(run.strain(part.id)).toBeLessThan(1);
    // Neither output gets anywhere near the supply: each holds the other at about half
    const sequence = lights(fight);
    expect(sequence.tops[0]).toBeGreaterThan(3);
    expect(sequence.tops[0]).toBeLessThan(5);
    expect(tryOut('both').result(new Work(withShared(sequencer(), 0, 2)))).toContain('The app lets that pass');
  });

  it('47 kΩ and a 500 kΩ pot on the clock: from 2.4 to 27 steps a second', () => {
    const circuit = withTempo();
    expect(all(circuit, 'potentiometer')).toHaveLength(1);
    const rate = (position: number) => lights(circuit, turned(circuit, position), 2).rate;
    const ends = [rate(0), rate(1)].sort((a, b) => a - b);
    expect(ends[0].toFixed(1)).toBe('2.4');
    expect(ends[1].toFixed(0)).toBe('27');
    // Dropped into the wire, a pot is used by leg 1 and its middle leg: turning it up puts resistance in
    expect(rate(0.9)).toBeLessThan(rate(0.1));
    const experiment = tryOut('tempo');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^27 steps a second at one end and 2\.4 at the other\./);
    expect(experiment.made(new Work(sequencer()))).toBe(false);
    // A pot lying loose changes nothing, and nor does one that is not in the clock
    expect(experiment.made(new Work(sequencer().addComponent(place('potentiometer', 0, 0))))).toBe(false);
    const aside = pot('', 10e3, 0.5, 100, 600);
    const base = sequencer();
    const across = add(base, [aside], [connect(only(base, 'power'), 0, aside, POT.END1), connect(aside, POT.END3, only(base, 'power'), 1)]);
    expect(experiment.made(new Work(across))).toBe(false);
  });

  it('a switch in the wire to RST, with a pull-down: four steps closed, ten open, six of them at the top note', () => {
    const circuit = withShort();
    expect(lights(circuit, closed(circuit)).loop).toBe(4);
    expect(lights(circuit, open(circuit)).loop).toBe(10);
    const sequence = playedNotes(circuit, open(circuit));
    const top = sequence.steps.filter((s) => s.count! > 3 && s.hertz !== null).map((s) => s.hertz!);
    expect(top.length).toBeGreaterThanOrEqual(4);
    for (const pitch of top) expect(Math.round(pitch / 2) * 2).toBe(894); // 893.5 Hz, give or take a tenth
    const experiment = tryOut('short');
    expect(experiment.made(new Work(circuit))).toBe(true);
    // ...whichever way the switch stands
    expect(experiment.made(new Work(withShort(sequencer(), { closed: false })))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^Ten steps: the four notes, then six steps of 89[34] Hz\./);
    expect(experiment.made(new Work(sequencer()))).toBe(false);
    expect(experiment.made(new Work(sequencer().addComponent(place('switch', 0, 0))))).toBe(false);
  });

  it('without the pull-down the open switch changes nothing in the app', () => {
    const circuit = withShort(sequencer(), { pullDown: false });
    expect(lights(circuit, open(circuit)).loop).toBe(4);
    expect(lights(circuit, closed(circuit)).loop).toBe(4);
    expect(tryOut('short').made(new Work(circuit))).toBe(false);
    expect(tryOut('short').result(new Work(withShort()))).toContain('Without it the loop stays at four steps in the app');
  });

  it('no experiment is made on an empty canvas, or on the tone the class starts from', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.made(empty())).toBe(false);
      expect(experiment.made(new Work(start()))).toBe(false);
      expect(experiment.made(new Work(fourChaser()))).toBe(false);
    }
  });
});

describe('class 10, steps: the check', () => {
  it('reads the sequencer as built, and is not passed by it', () => {
    const work = new Work(sequencer());
    expect(lesson.check.reading(work)).toBe('Your loop: 4 steps, at 2.8 steps a second. No LED lights on steps 1 and 5 only');
    expect(lesson.check.passed(work)).toBe(false);
    expect(lesson.check.reading(empty())).toBeNull();
    expect(lesson.check.passed(empty())).toBe(false);
    expect(lesson.check.reading(new Work(start()))).toBeNull();
  });

  it('is passed the way the hint gives: RST on Q8, 330 kΩ on the clock, an LED fed from Q0 and Q4 through diodes', () => {
    const circuit = checked();
    const sequence = lights(circuit);
    expect(sequence.loop).toBe(8);
    expect(sequence.rate.toFixed(1)).toBe('3.9');
    const shared = sharedLed(circuit);
    for (let q = 0; q < 8; q++) {
      for (const lit of litOn(circuit, sequence, q)) expect(lit.includes(shared.id)).toBe(q === 0 || q === 4);
    }
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    expect(lesson.check.reading(new Work(circuit))).toBe('Your loop: 8 steps, at 3.9 steps a second. One LED lights on steps 1 and 5 only');
    expect(lesson.check.hint).toMatch(/^Calculated, not measured/);
    expect(lesson.check.hint).toContain('1.3 ÷ 4 = 325 kΩ');
    expect((1.3 / 4 / 1e-6 / 1e3).toFixed(0)).toBe('325');
  });

  it('is passed with the switch and the pot in, as the experiments leave them', () => {
    // TEMPO half way, the switch (open or closed) moved to Q8, and the shared light
    for (const isClosed of [true, false]) {
      const circuit = withShared(eightSteps(withShort(withTempo(), { closed: isClosed })), 0, 4);
      expect(lesson.check.passed(new Work(circuit))).toBe(true);
    }
    // ...and from what the class keeps
    expect(lesson.check.passed(new Work(withShared(eightSteps(keptCircuit()), 0, 4)))).toBe(true);
  });

  it('is not passed by a loop of the wrong length, a clock at the wrong speed, or a light on the wrong steps', () => {
    const tooSlow = withShared(eightSteps(sequencer()), 0, 4);
    expect(lesson.check.passed(new Work(tooSlow))).toBe(false);
    expect(lesson.check.reading(new Work(tooSlow))).toBe('Your loop: 8 steps, at 2.8 steps a second. One LED lights on steps 1 and 5 only');

    const tooFast = withClock(tooSlow, 220e3);
    expect(lesson.check.passed(new Work(tooFast))).toBe(false);
    expect(lesson.check.reading(new Work(tooFast))).toMatch(/^Your loop: 8 steps, at 5\.\d steps a second\./);

    const noLight = withClock(eightSteps(sequencer()), 330e3);
    expect(lesson.check.passed(new Work(noLight))).toBe(false);
    expect(lesson.check.reading(new Work(noLight))).toBe('Your loop: 8 steps, at 3.9 steps a second. No LED lights on steps 1 and 5 only');

    const wrongSteps = withShared(noLight, 0, 2);
    expect(lesson.check.passed(new Work(wrongSteps))).toBe(false);

    const fourLong = withShared(withClock(sequencer(), 330e3), 0, 4);
    expect(lesson.check.passed(new Work(fourLong))).toBe(false);
    expect(lesson.check.reading(new Work(fourLong))).toMatch(/^Your loop: 4 steps, at 3\.9 steps a second\./);

    // Ten steps, with the light on the first and fifth of them
    const tenLong = withShared(withClock(tenChaser(), 330e3), 0, 4);
    expect(lesson.check.passed(new Work(tenLong))).toBe(false);
    expect(lesson.check.reading(new Work(tenLong))).toBe('Your loop: 10 steps, at 3.9 steps a second. One LED lights on steps 1 and 5 only');
  });

  it('says so when it cannot find the loop', () => {
    // Nothing on Q0: the app cannot see the count come round
    const base = tenChaser();
    const limit = onPin(base, resistors(base, 1000), counterOf(base), CD4017.Q[0])[0];
    const blind = base.removeConnection(wireBetween(base, counterOf(base), limit).id);
    expect(lesson.check.reading(new Work(blind))).toBe('Your clock: 2.8 steps a second. The app could not find where the loop starts: it looks for Q0 coming round');
    expect(lesson.check.passed(new Work(blind))).toBe(false);
  });
});

describe('class 10, steps: the steps', () => {
  it('none are done on an empty canvas', () => {
    expect(done(empty())).toEqual([]);
    expect(kept(empty())).toEqual([]);
    expect(done(new Work(new Circuit('empty'), playing))).toEqual([]);
  });

  it('the tone is retuned by all three parts, not by one or two', () => {
    const base = start();
    const one = setOhms(base, resistors(base, 10e3)[0], 47e3);
    expect(done(new Work(one))).toEqual([]);
    const two = setOhms(setOhms(base, resistors(base, 47e3)[0], 4.7e3), resistors(base, 10e3)[0], 47e3);
    expect(done(new Work(two))).toEqual([]);
    const three = setFarads(two, only(base, 'capacitor'), 100e-9);
    expect(done(new Work(three))).toEqual(['retune']);
    // The right values lying loose are not the tone
    const loose = add(base, [resistor(47e3, 0, 0), resistor(4.7e3, 100, 0)], []);
    expect(done(new Work(loose))).toEqual([]);
  });

  it('the clock ticks, the counter is wired, the lights chase', () => {
    const circuit = tenChaser();
    expect(done(new Work(circuit))).toEqual(['retune', 'clock', 'counter', 'lights']);
    expect(done(new Work(circuit, playing))).toEqual(['retune', 'clock', 'counter', 'lights', 'chase']);

    // A CD40106 and a CD4017 that are only lying there are neither
    const loose = add(start(), [place('cd40106', 300, 300), place('cd4017', 600, 300)], []);
    expect(done(new Work(loose, playing))).toEqual([]);

    // The clock by itself, without its capacitor, does not tick
    const counter = counterOf(circuit);
    let clockOnly = circuit;
    for (const part of [counter, ...all(circuit, 'led')]) clockOnly = clockOnly.removeComponent(part.id);
    expect(done(new Work(clockOnly))).toEqual(['retune', 'clock']);
    const clockCap = all(circuit, 'capacitor').find((c) => Number(c.parameters.capacitance) === 1e-6)!;
    expect(done(new Work(clockOnly.removeComponent(clockCap.id)))).toEqual(['retune']);

    // The counter without its clock is not wired
    const unclocked = circuit.removeConnection(wiresOn(circuit, counter, CD4017.CLK)[0].id);
    expect(done(new Work(unclocked))).toEqual(['retune', 'clock']);

    // Three lights are not four
    const three = circuit.removeComponent(ledOf(circuit, 3).id);
    expect(done(new Work(three))).toEqual(['retune', 'clock', 'counter']);
    // Four LEDs all on one output light together: that is not a chase
    const first = onPin(circuit, resistors(circuit, 1000), counter, CD4017.Q[0])[0];
    let together = circuit;
    for (const q of [1, 2, 3]) {
      const limit = onPin(circuit, resistors(circuit, 1000), counter, CD4017.Q[q])[0];
      together = together.removeConnection(wireBetween(circuit, counter, limit).id).addConnection(connect(first, 0, limit, 0));
    }
    expect(step(lesson.build, 'lights').done(new Work(together))).toBe(false);
  });

  it('RST on Q4 makes the loop', () => {
    expect(step(lesson.build, 'loop').done(new Work(tenChaser()))).toBe(false);
    expect(done(new Work(fourChaser()))).toEqual(['retune', 'clock', 'counter', 'lights', 'loop']);
    // On Q8 it is a loop, but not of four
    expect(step(lesson.build, 'loop').done(new Work(eightSteps(fourChaser())))).toBe(false);
  });

  it('one resistor to CTRL is the first note, four are the tune, and a probe on CTRL shows the stair', () => {
    const one = withNote(fourChaser(), 0, 4700);
    expect(done(new Work(one))).toEqual(['retune', 'clock', 'counter', 'lights', 'loop', 'first-note']);
    const three = withNote(withNote(one, 1, 10e3), 2, 6.8e3);
    expect(step(lesson.build, 'notes').done(new Work(three))).toBe(false);
    const circuit = sequencer();
    expect(done(new Work(circuit))).toEqual(['retune', 'clock', 'counter', 'lights', 'loop', 'first-note', 'notes']);
    expect(done(new Work(circuit, playing))).toEqual(['retune', 'clock', 'counter', 'lights', 'chase', 'loop', 'first-note', 'notes']);

    const voice = voiceOf(circuit), counter = counterOf(circuit);
    const probe = (part: Component, pin: number): Situation => ({ ...playing, probes: [{ componentId: part.id, pinId: part.pins[pin].id }] });
    expect(step(lesson.build, 'stair').done(new Work(circuit, probe(voice, NE555.CTRL)))).toBe(true);
    // A probe at the far end of one of the four resistors is on another net
    expect(step(lesson.build, 'stair').done(new Work(circuit, probe(counter, CD4017.Q[0])))).toBe(false);
    expect(step(lesson.build, 'stair').done(new Work(circuit, { ...probe(voice, NE555.CTRL), playing: false }))).toBe(false);

    // A resistor from Q0 to somewhere else is not a note, and nor are four resistors of one value from one output
    const base = fourChaser();
    const stray = resistor(4700, 900, 120);
    expect(step(lesson.build, 'first-note').done(new Work(add(base, [stray], [connect(counterOf(base), CD4017.Q[0], stray, 0)])))).toBe(false);
    // Four equal resistors play one note four times
    let flat = fourChaser();
    for (const q of [0, 1, 2, 3]) flat = withNote(flat, q, 10e3);
    expect(step(lesson.build, 'notes').done(new Work(flat))).toBe(false);
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['chase', 'loop']);
    const reset = (circuit: Circuit) => new Work(circuit).grounded(counterOf(circuit), CD4017.RST);
    expect(reset(classStage(lesson, []))).toBe(true);
    expect(reset(classStage(lesson, ['retune', 'clock', 'counter', 'lights']))).toBe(true);
    expect(reset(classStage(lesson, ['retune', 'clock', 'counter', 'lights', 'chase']))).toBe(false);
    const four = fourChaser();
    expect(onPin(four, all(four, 'resistor'), voiceOf(four), NE555.CTRL)).toHaveLength(0);
    const last = classStage(lesson, ['retune', 'clock', 'counter', 'lights', 'chase', 'loop']);
    expect(onPin(last, all(last, 'resistor'), voiceOf(last), NE555.CTRL)).toHaveLength(4);
  });

  it('keeping it: the loop back on a switch named SHORT, the pot named TEMPO, a look at the cover, and a save', () => {
    // After the check: the switch on Q8, neither control named
    const afterCheck = withShared(eightSteps(withShort(withTempo())), 0, 4);
    expect(kept(new Work(afterCheck))).toEqual([]);
    const name = (circuit: Circuit, type: string, label: string) => circuit.updateComponent(only(circuit, type).id, { label });
    // A name on the switch is not enough while it still makes the loop eight
    expect(kept(new Work(name(afterCheck, 'switch', 'SHORT')))).toEqual([]);
    const back = withShared(withShort(withTempo()), 0, 4);
    expect(kept(new Work(back))).toEqual([]);
    const short = name(back, 'switch', 'short');
    expect(kept(new Work(short))).toEqual(['name']);
    const both = name(short, 'potentiometer', 'Tempo');
    expect(kept(new Work(both))).toEqual(['name', 'tempo']);
    expect(kept(new Work(both, { ...playing, view: 'cover' }))).toEqual(['name', 'tempo', 'cover']);
    expect(kept(new Work(both, { ...playing, saved: true }))).toEqual(['name', 'tempo', 'save']);
    // Saving what is not the sequencer yet does not count
    expect(kept(new Work(short, { ...playing, saved: true }))).toEqual(['name']);
    expect(kept(new Work(sequencer(), { ...playing, saved: true }))).toEqual([]);
    // A pot named TEMPO that is not in the clock does not count
    const base = name(withShort(), 'switch', 'SHORT');
    expect(kept(new Work(base.addComponent(pot('TEMPO', 500e3, 0.5, 0, 0))))).toEqual(['name']);
  });

  it('what it keeps: SHORT makes the loop four steps or ten, and TEMPO takes it from 2.4 to 27 steps a second', () => {
    const circuit = keptCircuit();
    expect(kept(new Work(circuit))).toEqual(['name', 'tempo']);
    expect(kept(new Work(circuit, { ...playing, view: 'cover', saved: true }))).toEqual(['name', 'tempo', 'cover', 'save']);
    expect(only(circuit, 'switch').label).toBe('SHORT');
    expect(only(circuit, 'potentiometer').label).toBe('TEMPO');
    expect(Number(only(circuit, 'switch').parameters.closed)).toBe(1);

    // SHORT
    expect(lights(circuit, []).loop).toBe(4);
    expect(lights(circuit, open(circuit)).loop).toBe(10);
    // TEMPO: as it stands, and at each end. Turning it up makes the steps come faster
    expect(lights(circuit, []).rate.toFixed(1)).toBe('4.4');
    const rate = (position: number) => lights(circuit, turned(circuit, position), 2).rate;
    expect(rate(0).toFixed(1)).toBe('2.4');
    expect(rate(1).toFixed(0)).toBe('27');
    expect(rate(0.9)).toBeGreaterThan(rate(0.1));
    // The same four notes and the same four lights as the class built
    const sequence = playedNotes(circuit);
    expect([0, 1, 2, 3].map((q) => note(sequence, q).toFixed(0))).toEqual(['466', '642', '559', '712']);
    for (let q = 0; q < 4; q++) for (const lit of litOn(circuit, lights(circuit), q)) expect(lit).toEqual([ledOf(circuit, q).id]);
    // Every step of the build is done on it too
    expect(done(new Work(circuit))).toEqual(['retune', 'clock', 'counter', 'lights', 'loop', 'first-note', 'notes']);
  });

  it('the Step Sequencer example is this circuit with one light', () => {
    const example = built(exampleCircuits.find((e) => e.name === 'Step Sequencer')!.build());
    const mine = keptCircuit();
    expect([0, 1, 2, 3].map((q) => ohmsOf(noteOf(example, q)))).toEqual([0, 1, 2, 3].map((q) => ohmsOf(noteOf(mine, q))));
    for (const type of ['switch', 'potentiometer', 'cd40106', 'cd4017', 'ne555', 'audio-output']) expect(all(example, type)).toHaveLength(all(mine, type).length);
    expect(only(example, 'switch').label).toBe('SHORT');
    expect(only(example, 'potentiometer').label).toBe('TEMPO');
    expect(Number(only(example, 'potentiometer').parameters.maxResistance)).toBe(Number(only(mine, 'potentiometer').parameters.maxResistance));
    expect(all(example, 'led')).toHaveLength(1);
    expect(all(mine, 'led')).toHaveLength(4);
    expect(step(lesson.keep, 'save').how).toContain('it is this circuit with one light');
  });
});
