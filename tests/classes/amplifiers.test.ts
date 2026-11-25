/**
 * Class 12 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { amplifiers as lesson, amplifiersKept } from '@/classes/amplifiers';
import { moreVoicesKept } from '@/classes/moreVoices';
import { classCircuit, classStage, classStart } from '@/classes';
import { GROUND, Work, type PinOf, type Situation } from '@/classes/Work';
import { CD40106, LM386, LM741, spans } from '@/classes/kit';
import { capacitor, connect, place, resistor } from '@/examples/circuits';
import { harmonics, measureSignal, type SignalReading } from '@/simulation/measure/signal';
import { removeFromCircuit } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import type { Component } from '@/types/circuit';
import type { Built, Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const make = (built: Built): Circuit => {
  let circuit = new Circuit('made');
  for (const c of built.components) circuit = circuit.addComponent(c);
  for (const c of built.connections) circuit = circuit.addConnection(c);
  return circuit;
};
const ohms = (circuit: Circuit, part: Component, value: number) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, resistance: value, value: formatValue(value, 'resistance') } });
const flip = (circuit: Circuit, name: string, closed: 0 | 1) => {
  const key = all(circuit, 'switch').find((s) => s.label === name)!;
  return circuit.updateComponent(key.id, { parameters: { ...key.parameters, closed } });
};
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);
const kept = (work: Work) => lesson.keep.filter((s) => s.done(work)).map((s) => s.id);
const empty = () => new Circuit('empty');
const tall = (signal: SignalReading) => signal.max - signal.min;

// --- The circuits of the class ---

const AMPLIFIER = ['opamp', 'half', 'feedback', 'rest', 'input', 'hear', 'look'];
/** The chord as class 6 kept it. */
const chord = () => classStart(lesson);
/** SOUND: the chord's three 10 kΩ meet on its first pin, and what it lets through leaves by its second. */
const soundOf = (circuit: Circuit): Component => all(circuit, 'switch').find((s) => s.label === 'SOUND')!;
const MEET = 0, THROUGH = 1;
/** The chord, mixed by its three 10 kΩ, through the op-amp as an amplifier. */
const amplifier = () => classStage(lesson, []);
/** The op-amp as the mixer. */
const mixer = () => classStage(lesson, AMPLIFIER);
/** The whole build: the mixer, the LM386 and the speaker. */
const built = () => classCircuit(lesson);
/** What the class keeps. */
const keptCircuit = () => make(amplifiersKept());

// --- Finding the parts a learner would change ---

/** The feedback resistor: from the op-amp's output back to its − input. */
function feedbackOf(circuit: Circuit): Component {
  const work = new Work(circuit), amp = only(circuit, 'lm741');
  return all(circuit, 'resistor').find((r) => spans(work, r, work.net(amp, LM741.OUT), work.net(amp, LM741.IN_MINUS)))!;
}
/** The divider in front of the LM386: [upper, lower]. */
function dividerOf(circuit: Circuit): [Component, Component] {
  const work = new Work(circuit), power = only(circuit, 'lm386');
  const point = work.net(power, LM386.IN_PLUS);
  const on = all(circuit, 'resistor').filter((r) => work.net(r, 0) === point || work.net(r, 1) === point);
  return [on.find((r) => !spans(work, r, point, GROUND))!, on.find((r) => spans(work, r, point, GROUND))!];
}
/** The resistors each voice comes through, on the way to being mixed: 10 kΩ in the chord, 100 kΩ in the mixer. */
const mixResistors = (circuit: Circuit, value: number) => all(circuit, 'resistor').filter((r) => r.parameters.resistance === value);
/** The capacitor of a given size. */
const capacitorOf = (circuit: Circuit, farads: number) => all(circuit, 'capacitor').filter((c) => c.parameters.capacitance === farads);

const withFeedback = (circuit: Circuit, value: number) => ohms(circuit, feedbackOf(circuit), value);
const withDivider = (circuit: Circuit, upper: number, lower: number) => {
  const [a, b] = dividerOf(circuit);
  return ohms(ohms(circuit, a, upper), b, lower);
};
/** The build with the values that pass the check. */
const tuned = (feedback = 18e3, upper = 47e3, lower = 1e3) => withDivider(withFeedback(built(), feedback), upper, lower);

// --- Measuring ---

const RATE = 48000;
/** How the switches are put for a run: every one closed (1) or open (0), as they stand (null), or every one closed but those named. */
type Switches = 0 | 1 | null | string[];
/** A long look at a circuit with every switch closed (or as given): what it settles to, read over its last 0.4 s. */
function settle(circuit: Circuit, pins: PinOf[], switchesClosed: Switches = 1, seconds = 1.2) {
  const set = switchesClosed === null ? [] : all(circuit, 'switch').map((s) => ({
    componentId: s.id, parameter: 'closed', value: Array.isArray(switchesClosed) ? Number(!switchesClosed.includes(s.label ?? '')) : switchesClosed,
  }));
  const run = new Work(circuit).bench({ watch: pins, set, seconds });
  const from = Math.round((seconds - 0.4) * RATE);
  const trace = (part: Component, pin: number) => run.trace(part.id, part.pins[pin].id)!.subarray(from);
  return {
    run,
    trace,
    volts: (part: Component, pin: number) => measureSignal(trace(part, pin), RATE),
    sound: measureSignal(run.soundTrace.subarray(from), RATE),
  };
}
/** How tall each voice is in a trace: the size of the tone at its frequency, taken back to the height of a square wave. */
function voiceHeights(circuit: Circuit, part: Component, pin: number, switchesClosed: Switches = 1): number[] {
  const chip = only(circuit, 'cd40106');
  const outputs: PinOf[] = [0, 1, 2].map((v): PinOf => [chip, CD40106.Y[v]]);
  const seen = settle(circuit, [[part, pin], ...outputs], switchesClosed);
  return outputs.map(([c, y]) => harmonics(seen.trace(part, pin), RATE, seen.volts(c, y).hertz!, 1)[0] / (2 / Math.PI));
}
/** The level of the speaker: how far it is pushed either way, as a part of the 9 V supply. */
function levelOf(circuit: Circuit, switchesClosed: Switches = 1): number {
  const speaker = only(circuit, 'speaker');
  const seen = settle(circuit, [[speaker, 0], [speaker, 1]], switchesClosed);
  const a = seen.trace(speaker, 0), b = seen.trace(speaker, 1);
  let peak = 0;
  for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i] - b[i]));
  return peak / 9;
}

const text = () => [
  lesson.promise, lesson.startsFrom,
  ...[...lesson.build, ...lesson.keep].flatMap((s) => [s.text, s.how ?? '']),
  ...lesson.why.flatMap((p) => [p.title, p.text]),
  ...lesson.tries.flatMap((t) => [t.title, t.question, ...t.options, t.change]),
  lesson.check.goal, lesson.check.hint,
  ...lesson.words.flatMap((w) => [w.word, w.meaning]),
];
const why = (title: string) => lesson.why.find((p) => p.title === title)!.text;

describe('class 12, amplifiers: what it says', () => {
  it('has the parts of a class, each the size the course asks for, and no dashes', () => {
    expect(lesson.number).toBe(12);
    expect(lesson.id).toBe('amplifiers');
    expect(lesson.unit).toBe('Bigger sound');
    expect(lesson.build.length).toBeGreaterThanOrEqual(8);
    expect(lesson.build.length).toBeLessThanOrEqual(14);
    expect(lesson.why.length).toBeGreaterThanOrEqual(4);
    expect(lesson.why.length).toBeLessThanOrEqual(6);
    expect(lesson.tries.length).toBeGreaterThanOrEqual(4);
    expect(lesson.tries.length).toBeLessThanOrEqual(6);
    expect(lesson.words.length).toBeGreaterThanOrEqual(5);
    expect(lesson.words.length).toBeLessThanOrEqual(10);
    const ids = [...lesson.build, ...lesson.keep].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of lesson.build) expect(s.how).toBeTruthy();
    for (const line of text()) expect(line).not.toMatch(/[–—]/);
  });

  it('starts from what class 6 keeps: three voices through 10 kΩ each to SOUND and the Audio Out, FIFTH on the third', () => {
    const circuit = chord();
    // It is that class's own circuit, part for part and wire for wire
    const theirs = moreVoicesKept();
    const laidOut = (parts: Component[]) => parts.map((c) => `${c.type} ${c.label ?? ''} ${c.parameters.value ?? ''} at ${c.position.x},${c.position.y}`).sort();
    expect(laidOut(circuit.getComponents())).toEqual(laidOut(theirs.components));
    expect(circuit.getConnections()).toHaveLength(theirs.connections.length);
    expect(lesson.startsFrom).toContain('class 6');
    for (const name of ['SOUND', 'FIFTH']) expect(lesson.startsFrom).toContain(name);

    const chip = only(circuit, 'cd40106');
    const seen = settle(circuit, [0, 1, 2].map((v): PinOf => [chip, CD40106.Y[v]]));
    const hertz = [0, 1, 2].map((v) => seen.volts(chip, CD40106.Y[v]).hertz!);
    expect(hertz[0]).toBeGreaterThan(400);
    expect(hertz[1] / hertz[0]).toBeCloseTo(0.5, 1);    // an octave below
    expect(hertz[2] / hertz[0]).toBeCloseTo(0.75, 1);   // and the fifth between the two
    expect(mixResistors(circuit, 10e3)).toHaveLength(3);
    const work = new Work(circuit);
    for (const r of mixResistors(circuit, 10e3)) expect(work.joined(r, 1, soundOf(circuit), MEET)).toBe(true);
    expect(work.joined(soundOf(circuit), THROUGH, only(circuit, 'audio-output'), 0)).toBe(true);
    expect(all(circuit, 'switch').map((s) => `${s.label} ${s.parameters.closed}`).sort()).toEqual(['FIFTH 1', 'SOUND 1']);
    // FIFTH is on the third voice
    const fifth = all(circuit, 'switch').find((s) => s.label === 'FIFTH')!;
    expect(work.joined(fifth, 0, chip, CD40106.Y[2])).toBe(true);
    expect(tall(seen.sound)).toBeGreaterThan(0.8);
    expect(all(circuit, 'lm741')).toHaveLength(0);
  });

  it('builds on that chord where it lies: nothing of it moves but the Audio Out, and the new parts are clear of it to the right', () => {
    const place = (c: Component) => `${c.type} ${c.label ?? ''} at ${c.position.x},${c.position.y}`;
    const theirs = moreVoicesKept().components.filter((c) => c.type !== 'audio-output');
    const right = Math.max(...theirs.map((c) => c.position.x));
    for (const circuit of [amplifier(), mixer(), built(), keptCircuit()]) {
      const mine = circuit.getComponents();
      const places = mine.map(place);
      for (const part of theirs) expect(places, place(part)).toContain(place(part));
      // What is new: everything but the chord, and the Audio Out where it has one
      const added = mine.filter((c) => !theirs.some((t) => place(t) === place(c)));
      expect(added.length).toBe(mine.length - theirs.length);
      for (const part of added) expect(part.position.x, place(part)).toBeGreaterThanOrEqual(right + 100);
      // The chord's own values are as they were, but for the three resistors the mixer step changes
      const changed = theirs.filter((t) => mine.find((c) => place(c) === place(t))!.parameters.value !== t.parameters.value);
      expect(changed.every((c) => c.type === 'resistor' && c.parameters.resistance === 10e3)).toBe(true);
      expect([0, 3]).toContain(changed.length);
    }
    // The step that moves the Audio Out says so
    expect(step(lesson.build, 'hear').text).toContain('Move the Audio Out');
    expect(step(lesson.build, 'hear').how).toContain('Drag the Audio Out over to the right of the op-amp');
    expect(step(lesson.build, 'hear').how).toContain('Nothing else of the chord has to move');
  });

  it('with nothing coming in, the + input, the − input and OUT all rest at 4.5 V', () => {
    // The amplifier before the chord is wired to it: its capacitor not there yet
    const whole = amplifier();
    const circuit = whole.removeComponent(capacitorOf(whole, 1e-6)[0].id);
    const amp = only(circuit, 'lm741');
    const seen = settle(circuit, [[amp, LM741.IN_PLUS], [amp, LM741.IN_MINUS], [amp, LM741.OUT]], 1, 0.5);
    for (const pin of [LM741.IN_PLUS, LM741.IN_MINUS, LM741.OUT]) {
      expect(seen.volts(amp, pin).mean).toBeCloseTo(4.5, 2);
      expect(tall(seen.volts(amp, pin))).toBeLessThan(0.01);
    }
    expect(step(lesson.build, 'half').how).toContain('half the supply: 4.5 V');
    expect(step(lesson.build, 'rest').text).toContain('reads 4.5 V');
    expect(why('Half the supply')).toContain('hold the + input at 4.5 V');
    // ...and the chord still plays through its own resistors
    expect(tall(seen.sound)).toBeLessThan(0.01); // the Audio Out of this stage is on OUT: nothing there yet
  });

  it('the amplifier: 8.65 V tall goes in (0.17 V to 8.82 V), 1.9 V tall comes out (3.54 V to 5.44 V), upside down: a gain of 0.22', () => {
    const circuit = amplifier();
    const amp = only(circuit, 'lm741'), meet = soundOf(circuit);
    // What goes in is read where the step says to probe: on the wire from SOUND to the capacitor
    expect(new Work(circuit).joined(meet, THROUGH, capacitorOf(circuit, 1e-6)[0], 0)).toBe(true);
    const seen = settle(circuit, [[meet, THROUGH], [amp, LM741.OUT], [amp, LM741.IN_MINUS]]);
    const into = seen.volts(meet, THROUGH), out = seen.volts(amp, LM741.OUT);
    expect(Math.abs(into.min - 0.17)).toBeLessThan(0.01);
    expect(Math.abs(into.max - 8.82)).toBeLessThan(0.01);
    expect(Math.abs(tall(into) - 8.65)).toBeLessThan(0.01);
    expect((8.82 - 0.17).toFixed(2)).toBe('8.65');
    expect(Math.abs(out.min - 3.54)).toBeLessThan(0.01);
    expect(Math.abs(out.max - 5.44)).toBeLessThan(0.01);
    expect(tall(out).toFixed(1)).toBe('1.9');
    expect((tall(out) / tall(into)).toFixed(2)).toBe('0.22');
    expect((22 / 100).toFixed(2)).toBe('0.22');
    expect(out.mean).toBeCloseTo(4.5, 1);
    // The − input does not move
    expect(seen.volts(amp, LM741.IN_MINUS).mean).toBeCloseTo(4.5, 1);
    // Upside down: when the chord is up, OUT is down
    const a = seen.trace(meet, THROUGH), b = seen.trace(amp, LM741.OUT);
    let together = 0, sizeA = 0, sizeB = 0;
    for (let i = 0; i < a.length; i++) {
      together += (a[i] - into.mean) * (b[i] - out.mean);
      sizeA += (a[i] - into.mean) ** 2;
      sizeB += (b[i] - out.mean) ** 2;
    }
    expect(together / Math.sqrt(sizeA * sizeB)).toBeLessThan(-0.98);

    // Heard through the op-amp it is a good deal quieter than the chord was: about a fifth
    const start = chord();
    const was = settle(start, [[soundOf(start), THROUGH]]).sound;
    expect(tall(seen.sound) / tall(was)).toBeGreaterThan(0.15);
    expect(tall(seen.sound) / tall(was)).toBeLessThan(0.3);
    expect(step(lesson.build, 'hear').how).toContain('a good deal quieter');

    const look = step(lesson.build, 'look').how!;
    for (const quoted of ['between 0.17 V and 8.82 V', 'that is 8.65 V', '8.65 V tall', 'between 3.54 V and 5.44 V', '1.9 V tall and upside down']) expect(look).toContain(quoted);
    expect(step(lesson.build, 'look').text).toContain('the wire from SOUND to the capacitor');
    for (const quoted of ['22 ÷ 100 = 0.22', '8.65 V go in and 1.9 V come out']) expect(why('Gain')).toContain(quoted);
  });

  it('the mixer: each voice 9 V × 0.22, just under 6 V in all (1.51 V to 7.45 V), three times what it was, and the meeting point hardly moves', () => {
    const circuit = mixer();
    const amp = only(circuit, 'lm741'), meet = soundOf(circuit);
    expect(mixResistors(circuit, 100e3)).toHaveLength(5); // the three of the chord and the two of the half supply
    const out = settle(circuit, [[amp, LM741.OUT]]).volts(amp, LM741.OUT);
    expect(Math.abs(out.min - 1.51)).toBeLessThan(0.01);
    expect(Math.abs(out.max - 7.45)).toBeLessThan(0.01);
    expect(tall(out)).toBeGreaterThan(5.9);
    expect(tall(out)).toBeLessThan(6);
    const first = amplifier(), firstAmp = only(first, 'lm741');
    const ratio = tall(out) / tall(settle(first, [[firstAmp, LM741.OUT]]).volts(firstAmp, LM741.OUT));
    expect(ratio).toBeGreaterThan(2.9);
    expect(ratio).toBeLessThan(3.3);
    for (const height of voiceHeights(circuit, amp, LM741.OUT)) expect(height / (9 * 0.22)).toBeCloseTo(1, 1);
    expect(3 * 9 * 0.22).toBeGreaterThan(5.9);
    expect(3 * 9 * 0.22).toBeLessThan(6);
    // In the chord each voice was 3 V of the meeting point; here it is next to nothing of it
    const start = chord();
    for (const height of voiceHeights(start, soundOf(start), MEET)) expect(height).toBeCloseTo(3, 0);
    for (const height of voiceHeights(circuit, meet, MEET)) expect(height).toBeLessThan(0.15);

    const how = step(lesson.build, 'mix').how!;
    for (const quoted of ['between 1.51 V and 7.45 V', 'just under 6 V tall', 'three times what it was']) expect(how).toContain(quoted);
    for (const quoted of ['each 9 V × 0.22, just under 6 V in all', 'hardly moves']) expect(why('A mixer')).toContain(quoted);
  });

  it('the LM386 is given a hundredth, 0.06 V, and puts out about 1 V resting on 4.5 V: 20 times by itself, a little under with a speaker', () => {
    const circuit = built();
    const amp = only(circuit, 'lm741'), power = only(circuit, 'lm386'), speaker = only(circuit, 'speaker');
    const seen = settle(circuit, [[amp, LM741.OUT], [power, LM386.IN_PLUS], [power, LM386.OUT], [speaker, 0]]);
    const given = seen.volts(power, LM386.IN_PLUS), out = seen.volts(power, LM386.OUT);
    expect(tall(given).toFixed(2)).toBe('0.06');
    expect(tall(given) / tall(seen.volts(amp, LM741.OUT))).toBeCloseTo(0.01, 3);
    expect(Math.abs(given.mean)).toBeLessThan(0.002);     // its input rests at 0 V
    expect(out.mean).toBeCloseTo(4.5, 1);                 // its output at half the supply
    expect(tall(out).toFixed(0)).toBe('1');
    expect(tall(out) / tall(given)).toBeGreaterThan(17);
    expect(tall(out) / tall(given)).toBeLessThan(19);
    expect(Math.abs(seen.volts(speaker, 0).mean)).toBeLessThan(0.01); // nothing steady across the speaker
    // Without the speaker pulling on it: 20
    const alone = circuit.removeComponent(speaker.id);
    const free = settle(alone, [[power, LM386.IN_PLUS], [power, LM386.OUT]]);
    expect(tall(free.volts(power, LM386.OUT)) / tall(free.volts(power, LM386.IN_PLUS))).toBeCloseTo(20, 0);

    const cut = step(lesson.build, 'cut').how!;
    for (const quoted of ['about a hundredth', '20 times as tall', '0.06 V here']) expect(cut).toContain(quoted);
    for (const quoted of ['a gain of 20', '0.06 V goes in and about 1 V comes out', 'a little under 20 times']) expect(why('The LM386')).toContain(quoted);
    for (const quoted of ['output rests at 4.5 V', 'input must rest at 0 V', '1 µF into the op-amp, 1 µF out of it, and 220 µF to the speaker']) expect(why('Coupling capacitors')).toContain(quoted);
    expect(capacitorOf(circuit, 1e-6)).toHaveLength(2);
    expect(capacitorOf(circuit, 220e-6)).toHaveLength(1);
  });

  it('the speaker is 8 Ω, and without its capacitor the LM386 would push half an amp through it all the time', () => {
    const circuit = built();
    const speaker = only(circuit, 'speaker');
    // Deleted as the Delete key does it: the wire closes, and the LM386 goes straight to the speaker
    const straight = removeFromCircuit(circuit, [capacitorOf(circuit, 220e-6)[0].id]);
    expect(new Work(straight).joined(only(straight, 'lm386'), LM386.OUT, speaker, 0)).toBe(true);
    const run = new Work(straight).bench({ seconds: 0.2 });
    expect(run.amps(speaker.id)).toBeGreaterThan(0.45);
    expect(run.amps(speaker.id)).toBeLessThan(0.55);
    expect(run.across(speaker.id) / run.amps(speaker.id)).toBeCloseTo(8, 3);
    expect(step(lesson.build, 'speaker').how).toContain('half an amp');
    expect(why('Coupling capacitors')).toContain('only 8 Ω');
    expect(step(lesson.build, 'speaker').done(new Work(straight))).toBe(false);
  });

  it('an LM741 has not the strength for a speaker: given one, its output collapses', () => {
    const circuit = mixer();
    const amp = only(circuit, 'lm741');
    const big = capacitor(220e-6, 1400, 200), speaker = place('speaker', 1500, 200), speakerGround = place('ground', 1500, 300);
    const loaded = circuit.addComponent(big).addComponent(speaker).addComponent(speakerGround)
      .addConnection(connect(amp, LM741.OUT, big, 0)).addConnection(connect(big, 1, speaker, 0)).addConnection(connect(speaker, 1, speakerGround, 0));
    const out = settle(loaded, [[amp, LM741.OUT]]).volts(amp, LM741.OUT);
    expect(tall(out)).toBeLessThan(1);  // where it was 6 V
    expect(why('The LM386')).toContain('which the LM741 has not');
    // ...and a speaker that is not on an LM386 is not the speaker of the build
    expect(step(lesson.build, 'speaker').done(new Work(loaded))).toBe(false);
  });

  it('as built it plays through the speaker alone, at a level of about 0.07: not yet the 0.1 of the check', () => {
    const circuit = built();
    expect(all(circuit, 'audio-output')).toHaveLength(0);
    const level = levelOf(circuit);
    expect(level).toBeGreaterThan(0.06);
    expect(level).toBeLessThan(0.09);
    // What the app plays is the speaker: the same size, give or take the ripple at its edges
    const speaker = only(circuit, 'speaker');
    const { sound } = settle(circuit, [[speaker, 0]]);
    expect(Math.max(-sound.min, sound.max) / level).toBeGreaterThan(0.9);
    expect(Math.max(-sound.min, sound.max) / level).toBeLessThan(1.25);
  });
});

describe('class 12, amplifiers: the experiments', () => {
  it('opening FIFTH takes one voice out of the mixer and leaves the other two as they were, to within a hundredth', () => {
    const closed = built();
    const open = flip(closed, 'FIFTH', 0);
    const amp = only(closed, 'lm741');
    const before = voiceHeights(closed, amp, LM741.OUT), after = voiceHeights(closed, amp, LM741.OUT, ['FIFTH']);
    expect(after[2]).toBeLessThan(0.02);
    for (const voice of [0, 1]) expect(Math.abs(after[voice] / before[voice] - 1)).toBeLessThan(0.01);
    // In the chord as class 6 kept it, the two that were left got half as large again
    const start = chord(), meet = soundOf(start);
    const was = voiceHeights(start, meet, MEET), then = voiceHeights(start, meet, MEET, ['FIFTH']);
    for (const voice of [0, 1]) expect(then[voice] / was[voice]).toBeCloseTo(1.5, 1);

    const experiment = tryOut('fifth');
    expect(experiment.made(new Work(open))).toBe(true);
    expect(experiment.made(new Work(closed))).toBe(false);
    expect(experiment.result(new Work(open))).toMatch(/^OUT was 5\.9\d V tall and is now (3\.9\d|4\.0\d) V: one voice less/);
    expect(experiment.result(new Work(open))).toContain('to within a hundredth');
    // With FIFTH open the amplifier of the first part of the build is not a mixer with a voice less
    expect(experiment.made(new Work(flip(amplifier(), 'FIFTH', 0)))).toBe(false);
    expect(experiment.made(new Work(flip(mixer(), 'FIFTH', 0)))).toBe(true);
    // SOUND open takes every voice out: that is not one voice less
    expect(experiment.made(new Work(flip(closed, 'SOUND', 0)))).toBe(false);
    expect(experiment.made(new Work(flip(open, 'SOUND', 0)))).toBe(false);
  });

  it('feedback of 10 kΩ: a gain of 0.1, each voice 0.9 V tall and OUT 2.7 V', () => {
    const circuit = withFeedback(built(), 10e3);
    const amp = only(circuit, 'lm741');
    const out = settle(circuit, [[amp, LM741.OUT]]).volts(amp, LM741.OUT);
    expect(tall(out).toFixed(1)).toBe('2.7');
    for (const height of voiceHeights(circuit, amp, LM741.OUT)) expect(height).toBeCloseTo(0.9, 1);
    const experiment = tryOut('gain');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^3\.1\d V to 5\.8\d V: 2\.7\d V tall, where it was just under 6 V/);
    for (const quoted of ['10 ÷ 100 = 0.1', '0.9 V tall', 'the three together 2.7 V']) expect(experiment.result(new Work(circuit))).toContain(quoted);
    expect(experiment.made(new Work(built()))).toBe(false);
    // A 10 kΩ lying loose is not the feedback resistor
    expect(experiment.made(new Work(built().addComponent(resistor(10e3, 1200, 100))))).toBe(false);
    expect(experiment.made(new Work(withFeedback(built(), 47e3)))).toBe(false);
  });

  it('feedback of 47 kΩ asks for 12.7 V and gets 6: OUT is cut flat 1.5 V from either side of the supply', () => {
    const circuit = withFeedback(built(), 47e3);
    const amp = only(circuit, 'lm741');
    const seen = settle(circuit, [[amp, LM741.OUT]]);
    const out = seen.volts(amp, LM741.OUT);
    expect(out.min.toFixed(2)).toBe('1.49');
    expect(out.max.toFixed(2)).toBe('7.51');
    expect((9 - out.max).toFixed(1)).toBe('1.5');
    expect(tall(out).toFixed(0)).toBe('6');
    expect((3 * 9 * 0.47).toFixed(1)).toBe('12.7');
    // Flat: a good part of the time is spent on one limit or the other
    const trace = seen.trace(amp, LM741.OUT);
    let flat = 0;
    for (const v of trace) if (v < 1.5 || v > 7.5) flat++;
    expect(flat / trace.length).toBeGreaterThan(0.2);

    const experiment = tryOut('clip');
    expect(experiment.question).toContain('each 9 V × 0.47, add up to 12.7 V');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^OUT stops at 1\.49 V and at 7\.51 V/);
    for (const quoted of ['closer than 1.5 V to either side', '6 V of room']) expect(experiment.result(new Work(circuit))).toContain(quoted);
    // The 22 kΩ of the build only just fits, and is not it. Nor is the 10 kΩ of the experiment before
    expect(experiment.made(new Work(built()))).toBe(false);
    expect(experiment.made(new Work(withFeedback(built(), 10e3)))).toBe(false);
  });

  it('with no feedback the op-amp is a comparator: OUT is on one limit or the other, by which input is the higher', () => {
    const before = withFeedback(built(), 47e3);
    // Deleted as the Delete key does it: a feedback resistor just goes, the wire does not close
    const circuit = removeFromCircuit(before, [feedbackOf(before).id]);
    const amp = only(circuit, 'lm741');
    expect(new Work(circuit).joined(amp, LM741.OUT, amp, LM741.IN_MINUS)).toBe(false);
    const seen = settle(circuit, [[amp, LM741.OUT], [amp, LM741.IN_MINUS], [amp, LM741.IN_PLUS]]);
    const out = seen.trace(amp, LM741.OUT), minus = seen.trace(amp, LM741.IN_MINUS), plusInput = seen.trace(amp, LM741.IN_PLUS);
    let low = 0, high = 0, agree = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i] < 1.6) { low++; if (minus[i] > plusInput[i]) agree++; }
      if (out[i] > 7.4) { high++; if (plusInput[i] > minus[i]) agree++; }
    }
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
    expect((low + high) / out.length).toBeGreaterThan(0.99);
    expect(agree / (low + high)).toBeGreaterThan(0.99);

    const experiment = tryOut('compare');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^OUT is at 1\.4\d V or at 7\.5\d V, and spends almost no time between the two/);
    expect(experiment.made(new Work(before))).toBe(false);
    expect(experiment.made(new Work(built()))).toBe(false);
    // OUT wired straight to the − input is not "no feedback"
    expect(experiment.made(new Work(circuit.addConnection(connect(amp, LM741.OUT, amp, LM741.IN_MINUS))))).toBe(false);
    // ...and the 22 kΩ put back makes it the mixer again
    const back = resistor(22e3, 1200, 200);
    const mended = circuit.addComponent(back).addConnection(connect(amp, LM741.OUT, back, 1)).addConnection(connect(back, 0, amp, LM741.IN_MINUS));
    expect(step(lesson.build, 'mix').done(new Work(mended))).toBe(true);
  });

  it('given ten times as much, the LM386 clips: about 6.5 V of room, and the speaker is louder but nothing like ten times', () => {
    const circuit = withDivider(built(), 10e3, 1e3);
    const power = only(circuit, 'lm386');
    const seen = settle(circuit, [[power, LM386.IN_PLUS], [power, LM386.OUT]]);
    const given = seen.volts(power, LM386.IN_PLUS), out = seen.volts(power, LM386.OUT);
    expect(tall(given) * 20).toBeGreaterThan(9);
    expect(tall(out)).toBeGreaterThan(6.3);
    expect(tall(out)).toBeLessThan(6.6);
    const ratio = levelOf(circuit) / levelOf(built());
    expect(ratio).toBeGreaterThan(5);
    expect(ratio).toBeLessThan(8);

    const experiment = tryOut('loud');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^The LM386 is given 5\d\d mV and would have to put out 1[01]\.\d V, more than the whole supply\. Its OUT stops at 1\.2\d V and at 7\.7\d V/);
    expect(experiment.result(new Work(circuit))).toMatch(/about 6\.5 V of room\. The speaker's level is 0\.[34]\d\./);
    expect(experiment.made(new Work(built()))).toBe(false);
    expect(experiment.made(new Work(tuned()))).toBe(false);
  });

  it('every experiment asks a question with a right answer among its options, and none is made on an empty canvas or on the chord', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options.length).toBeLessThanOrEqual(4);
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(empty()))).toBe(false);
      expect(experiment.made(new Work(chord()))).toBe(false);
      expect(experiment.made(new Work(flip(chord(), 'FIFTH', 0)))).toBe(false);
      expect(experiment.made(new Work(flip(chord(), 'SOUND', 0)))).toBe(false);
    }
  });
});

describe('class 12, amplifiers: the check', () => {
  const { check } = lesson;

  it('has nothing to read without an op-amp, and says what is missing while the op-amp is half built', () => {
    expect(check.reading(new Work(empty()))).toBeNull();
    expect(check.reading(new Work(chord()))).toBeNull();
    expect(check.passed(new Work(empty()))).toBe(false);
    expect(check.passed(new Work(chord()))).toBe(false);
    const loose = chord().addComponent(place('lm741', 1200, 300));
    expect(check.reading(new Work(loose))).toMatch(/^Your op-amp is not an amplifier yet/);
    expect(check.passed(new Work(loose))).toBe(false);
  });

  it('is not passed by the build as it stands: OUT is at its limits and the speaker too quiet', () => {
    const work = new Work(built());
    expect(check.passed(work)).toBe(false);
    expect(check.reading(work)).toMatch(/^Your mixer: 3 of 3 voices, OUT 1\.5\d V to 7\.4\d V\. Your speaker: level 0\.0[67] \([56]\d\d mV each way\)$/);
  });

  it('is passed the two ways the hint gives: 18 kΩ of feedback, and 47 kΩ over 1 kΩ (just enough) or 33 kΩ over 1 kΩ (room to spare)', () => {
    const enough = tuned(18e3, 47e3, 1e3), spare = tuned(18e3, 33e3, 1e3);
    expect(check.passed(new Work(enough))).toBe(true);
    expect(check.reading(new Work(enough))).toMatch(/^Your mixer: 3 of 3 voices, OUT 2\.0\d V to 6\.9\d V\. Your speaker: level 0\.1[12] \(1\.\d\d V each way\)$/);
    expect(check.passed(new Work(spare))).toBe(true);
    expect(check.reading(new Work(spare))).toMatch(/^Your mixer: 3 of 3 voices, OUT 2\.0\d V to 6\.9\d V\. Your speaker: level 0\.1[67] \(1\.\d\d V each way\)$/);
    expect(levelOf(enough)).toBeGreaterThan(0.11);
    expect(levelOf(enough)).toBeLessThan(0.15);
    expect(levelOf(spare)).toBeGreaterThan(0.16);
    // Half the upper resistor, twice the level, near enough
    const doubled = levelOf(enough) / levelOf(tuned(18e3, 100e3, 1e3));
    expect(doubled).toBeGreaterThan(1.9);
    expect(doubled).toBeLessThan(2.3);
    for (const quoted of ['5.8 ÷ 27 = 0.21', 'under 21 kΩ', '18 kΩ', '47 kΩ over 1 kΩ should be just enough', '33 kΩ over 1 kΩ leaves room to spare', 'Halve the upper resistor and the level doubles']) expect(check.hint).toContain(quoted);
    expect((7.4 - 1.6).toFixed(1)).toBe('5.8');
    expect((5.8 / 27).toFixed(2)).toBe('0.21');
    expect(0.21 * 100e3).toBeCloseTo(21e3);
    expect(check.hint).toMatch(/^Calculated, not measured/);
    expect(check.goal).toContain('between 1.6 V and 7.4 V');
    expect(check.goal).toContain('above 0.1');
    expect((0.1 * 9).toFixed(1)).toBe('0.9');
    expect(check.goal).toContain('more than 0.9 V each way');
  });

  it('wants both: clean but quiet does not pass, nor loud but at the limits', () => {
    expect(check.passed(new Work(tuned(18e3, 100e3, 1e3)))).toBe(false);
    expect(check.passed(new Work(tuned(22e3, 47e3, 1e3)))).toBe(false);
    expect(check.passed(new Work(tuned(47e3, 100e3, 1e3)))).toBe(false);
    // Any gain that keeps clear of the limits will do
    expect(check.passed(new Work(tuned(15e3, 33e3, 1e3)))).toBe(true);
  });

  it('wants the whole chord, mixed by the op-amp: a voice short, or the chord mixed first by its resistors, does not pass', () => {
    // FIFTH's wire to the chip taken off: two voices
    const whole = tuned();
    const chip = only(whole, 'cd40106'), fifth = all(whole, 'switch').find((s) => s.label === 'FIFTH')!;
    const wire = whole.getConnections().find((c) => c.from.componentId === chip.id && c.to.componentId === fifth.id)!;
    const two = whole.removeConnection(wire.id);
    expect(check.passed(new Work(two))).toBe(false);
    expect(check.reading(new Work(two))).toMatch(/^Your mixer: 2 of 3 voices/);
    // FIFTH only open is the switch, not the circuit: it is read with every switch closed
    expect(check.passed(new Work(flip(whole, 'FIFTH', 0)))).toBe(true);
    expect(check.passed(new Work(flip(whole, 'SOUND', 0)))).toBe(true);
    expect(check.reading(new Work(flip(whole, 'SOUND', 0)))).toBe(check.reading(new Work(whole)));
    // The amplifier of the first part of the build mixes nothing itself
    expect(check.passed(new Work(amplifier()))).toBe(false);
    expect(check.reading(new Work(amplifier()))).toMatch(/^Your mixer: 0 of 3 voices, OUT 3\.\d\d V to 5\.\d\d V\. No speaker on an LM386 that the op-amp feeds$/);
  });

  it('reads the speaker by itself: an Audio Out left on the canvas adds nothing to it', () => {
    const circuit = tuned();
    const amp = only(circuit, 'lm741');
    const extra = place('audio-output', 1320, 200);
    const both = circuit.addComponent(extra).addConnection(connect(amp, LM741.OUT, extra, 0));
    expect(check.reading(new Work(both))).toBe(check.reading(new Work(circuit)));
    expect(check.passed(new Work(both))).toBe(true);
    // ...though what the app plays is then the two added together
    const speaker = only(circuit, 'speaker');
    const heard = (c: Circuit) => tall(settle(c, [[speaker, 0]]).sound);
    expect(heard(both)).toBeGreaterThan(heard(circuit) * 1.5);
    // An Audio Out by itself is not a speaker on an LM386
    const quiet = tuned(18e3, 100e3, 1e3);
    expect(check.passed(new Work(quiet.addComponent(extra).addConnection(connect(only(quiet, 'lm741'), LM741.OUT, extra, 0))))).toBe(false);
  });

  it('is passed by what the class keeps, as it stands: SOUND and FIFTH closed, SOFT open', () => {
    const circuit = keptCircuit();
    expect(check.passed(new Work(circuit))).toBe(true);
    expect(check.reading(new Work(circuit))).toMatch(/3 of 3 voices, OUT 2\.0\d V to 6\.9\d V\. Your speaker: level 0\.1[67]/);
    // With SOFT closed it is softer than the check asks, which is what SOFT is for
    expect(levelOf(flip(circuit, 'SOFT', 1), null)).toBeLessThan(0.1);
  });
});

describe('class 12, amplifiers: the steps', () => {
  it('none are done on an empty canvas, or on the chord it starts from', () => {
    for (const circuit of [empty(), chord()]) {
      expect(done(new Work(circuit, playing))).toEqual([]);
      expect(kept(new Work(circuit))).toEqual([]);
    }
  });

  it('parts that are only lying on the canvas do nothing', () => {
    const loose = chord()
      .addComponent(place('lm741', 1200, 300)).addComponent(place('lm386', 1600, 300)).addComponent(place('speaker', 1800, 300))
      .addComponent(resistor(100e3, 1000, 400)).addComponent(resistor(100e3, 1000, 500)).addComponent(resistor(22e3, 1200, 200))
      .addComponent(capacitor(1e-6, 940, 300)).addComponent(capacitor(220e-6, 1700, 300)).addComponent(place('switch', 1400, 440));
    expect(done(new Work(loose, playing))).toEqual([]);
    expect(kept(new Work(loose))).toEqual([]);
  });

  it('the op-amp is built a step at a time: power, half the supply, feedback, and a look at where it rests', () => {
    const whole = amplifier();
    const amp = only(whole, 'lm741');
    // Before the chord is wired in: the capacitor and its resistor not there yet
    const work0 = new Work(whole);
    const input = all(whole, 'resistor').find((r) => work0.net(r, 1) === work0.net(amp, LM741.IN_MINUS) && !spans(work0, r, work0.net(amp, LM741.OUT), work0.net(amp, LM741.IN_MINUS)))!;
    const bare = whole.removeComponent(capacitorOf(whole, 1e-6)[0].id).removeComponent(input.id);
    expect(done(new Work(bare))).toEqual(['opamp', 'half', 'feedback']);
    // Without the feedback resistor, or with the + input left off the divider, it is not that far
    expect(done(new Work(bare.removeComponent(feedbackOf(bare).id)))).toEqual(['opamp', 'half']);
    const toPlus = bare.getConnections().find((c) => c.to.componentId === amp.id && c.to.pinId === amp.pins[LM741.IN_PLUS].id)!;
    expect(done(new Work(bare.removeConnection(toPlus.id)))).toEqual(['opamp']);
    // An uneven divider is not half the supply
    const lower = all(bare, 'resistor').find((r) => new Work(bare).grounded(r, 1))!;
    expect(done(new Work(ohms(bare, lower, 10e3)))).toEqual(['opamp']);
    // The meter on OUT, while it plays
    const onOut = bare.getConnections().find((c) => c.from.componentId === amp.id && c.from.pinId === amp.pins[LM741.OUT].id)!;
    const onPlus = bare.getConnections().find((c) => c.to.componentId === amp.id && c.to.pinId === amp.pins[LM741.V_PLUS].id)!;
    expect(step(lesson.build, 'rest').done(new Work(bare, { ...playing, wires: [onOut.id] }))).toBe(true);
    expect(step(lesson.build, 'rest').done(new Work(bare, { ...playing, wires: [onPlus.id] }))).toBe(false);
    expect(step(lesson.build, 'rest').done(new Work(bare, { playing: false, saved: false, view: 'schematic', selected: [], wires: [onOut.id] }))).toBe(false);
  });

  it('the chord goes in, the Audio Out moves to OUT, and the two are compared on the scope', () => {
    const circuit = amplifier();
    const amp = only(circuit, 'lm741'), out = only(circuit, 'audio-output');
    expect(done(new Work(circuit))).toEqual(['opamp', 'half', 'feedback', 'input', 'hear']);
    // The Audio Out still on the chord: the chord is in, but it is not heard through the op-amp
    const toOut = circuit.getConnections().find((c) => c.to.componentId === out.id)!;
    const stillOnChord = circuit.removeConnection(toOut.id).addConnection(connect(soundOf(circuit), THROUGH, out, 0));
    expect(done(new Work(stillOnChord))).toEqual(['opamp', 'half', 'feedback', 'input']);
    // The scope on OUT, while it plays
    const probes = [{ componentId: amp.id, pinId: amp.pins[LM741.OUT].id }];
    expect(step(lesson.build, 'look').done(new Work(circuit, { ...playing, probes }))).toBe(true);
    expect(step(lesson.build, 'look').done(new Work(circuit, playing))).toBe(false);
    expect(step(lesson.build, 'look').done(new Work(circuit, { ...playing, probes: [{ componentId: amp.id, pinId: amp.pins[LM741.IN_PLUS].id }] }))).toBe(false);
    expect(step(lesson.build, 'look').done(new Work(circuit, { playing: false, saved: false, view: 'schematic', selected: [], probes }))).toBe(false);
    // The capacitor straight to the − input, the chord still on its 10 kΩ: far too much gain, and not the step
    expect(step(lesson.build, 'mix').done(new Work(circuit))).toBe(false);
  });

  it('the mixer is made as the step says: three 10 kΩ changed to 100 kΩ, and the single 100 kΩ deleted', () => {
    const start = amplifier();
    const amp = only(start, 'lm741');
    const work = new Work(start);
    const single = all(start, 'resistor').find((r) => work.net(r, 1) === work.net(amp, LM741.IN_MINUS) && r.parameters.resistance === 100e3)!;
    // Deleted first: the three voices come in through 10 kΩ each, a gain of 2.2. Not yet the step
    const early = removeFromCircuit(start, [single.id]);
    expect(new Work(early).joined(capacitorOf(early, 1e-6)[0], 1, amp, LM741.IN_MINUS)).toBe(true); // the wire closed
    expect(step(lesson.build, 'mix').done(new Work(early))).toBe(false);
    let made = early;
    for (const r of mixResistors(early, 10e3)) made = ohms(made, r, 100e3);
    expect(step(lesson.build, 'mix').done(new Work(made))).toBe(true);
    expect(done(new Work(made))).toEqual(['opamp', 'half', 'feedback', 'input', 'hear', 'mix']);
    // It is the mixer of the class
    const out = settle(made, [[amp, LM741.OUT]]).volts(amp, LM741.OUT);
    expect(Math.abs(out.min - 1.51)).toBeLessThan(0.01);
    expect(Math.abs(out.max - 7.45)).toBeLessThan(0.01);
    expect(done(new Work(mixer()))).toEqual(['opamp', 'half', 'feedback', 'input', 'hear', 'mix']);
    // The other order: the values changed first, the single 100 kΩ still there. Each voice a third of the gain, and not a mixer
    let late = start;
    for (const r of mixResistors(start, 10e3)) late = ohms(late, r, 100e3);
    expect(step(lesson.build, 'mix').done(new Work(late))).toBe(false);
    // Each voice through a capacitor and a 100 kΩ of its own, in either order, is a mixer too
    const chip = only(start, 'cd40106');
    for (const capacitorFirst of [true, false]) {
      let own = start.removeComponent(single.id).removeComponent(capacitorOf(start, 1e-6)[0].id);
      for (const r of mixResistors(start, 10e3)) own = own.removeComponent(r.id);
      [0, 1, 2].forEach((voice) => {
        const c = capacitor(1e-6, 800, 100 + voice * 100), r = resistor(100e3, 900, 100 + voice * 100);
        const [a, b] = capacitorFirst ? [c, r] : [r, c];
        own = own.addComponent(c).addComponent(r)
          .addConnection(connect(chip, CD40106.Y[voice], a, 0)).addConnection(connect(a, 1, b, 0)).addConnection(connect(b, 1, amp, LM741.IN_MINUS));
      });
      expect(step(lesson.build, 'mix').done(new Work(own))).toBe(true);
      const each = settle(own, [[amp, LM741.OUT]]).volts(amp, LM741.OUT);
      expect(tall(each).toFixed(0)).toBe('6');
    }
  });

  it('the LM386, its divider and the speaker go on, and the Audio Out comes off', () => {
    const whole = built();
    const power = only(whole, 'lm386'), speaker = only(whole, 'speaker'), amp = only(whole, 'lm741');
    expect(done(new Work(whole))).toEqual(['opamp', 'half', 'feedback', 'input', 'hear', 'mix', 'power', 'cut', 'speaker']);
    expect(done(new Work(whole, playing))).toContain('alone');
    // The chip alone
    const [upper] = dividerOf(whole);
    const chipOnly = whole.removeComponent(upper.id).removeComponent(speaker.id);
    expect(done(new Work(chipOnly)).slice(-2)).toEqual(['mix', 'power']);
    // Its − input left off ground
    const toGround = whole.getConnections().find((c) => c.from.componentId === power.id && c.from.pinId === power.pins[LM386.IN_MINUS].id)!;
    expect(step(lesson.build, 'power').done(new Work(whole.removeConnection(toGround.id)))).toBe(false);
    // The divider without the speaker
    const noSpeaker = whole.removeComponent(speaker.id);
    expect(done(new Work(noSpeaker)).slice(-2)).toEqual(['power', 'cut']);
    // Without the capacitor before the divider the LM386's input does not rest at 0 V, and its output not at 4.5 V
    const pass = capacitorOf(whole, 1e-6).find((c) => new Work(whole).joined(c, 0, amp, LM741.OUT))!;
    const direct = removeFromCircuit(whole, [pass.id]);
    const seen = settle(direct, [[power, LM386.IN_PLUS], [power, LM386.OUT]]);
    expect(seen.volts(power, LM386.IN_PLUS).mean).toBeGreaterThan(0.04);
    expect(seen.volts(power, LM386.OUT).mean).toBeGreaterThan(5.2);
    expect(step(lesson.build, 'cut').done(new Work(direct))).toBe(false);
    // The op-amp's whole output, not cut down, is not the step either
    expect(step(lesson.build, 'cut').done(new Work(removeFromCircuit(whole, [upper.id])))).toBe(false);
    // With an Audio Out still wired in, the speaker is not yet alone
    const extra = place('audio-output', 1320, 200);
    const both = whole.addComponent(extra).addConnection(connect(amp, LM741.OUT, extra, 0));
    expect(step(lesson.build, 'alone').done(new Work(both, playing))).toBe(false);
    expect(step(lesson.build, 'alone').done(new Work(whole.addComponent(extra), playing))).toBe(true); // lying loose, it plays nothing
    expect(step(lesson.build, 'alone').done(new Work(whole))).toBe(false);
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['look', 'mix']);
    for (const stage of lesson.stages!) expect(lesson.build.some((s) => s.id === stage.upTo)).toBe(true);
    expect(mixResistors(classStage(lesson, []), 10e3)).toHaveLength(3);
    expect(all(classStage(lesson, []), 'audio-output')).toHaveLength(1);
    expect(mixResistors(classStage(lesson, AMPLIFIER), 10e3)).toHaveLength(0);
    expect(all(classStage(lesson, AMPLIFIER), 'lm386')).toHaveLength(0);
    expect(all(classStage(lesson, [...AMPLIFIER, 'mix']), 'speaker')).toHaveLength(1);
    expect(all(classStage(lesson, [...AMPLIFIER, 'mix']), 'audio-output')).toHaveLength(0);
  });

  it('keeping it: a switch that puts a second 1 kΩ beside the lower resistor, named SOFT, a look at the cover, and a save', () => {
    const circuit = tuned();
    expect(kept(new Work(circuit))).toEqual([]);
    const [, lower] = dividerOf(circuit);
    const key = place('switch', 1400, 440), second = resistor(1e3, 1400, 560, 90), secondGround = place('ground', 1400, 660);
    const soft = circuit.addComponent(key).addComponent(second).addComponent(secondGround)
      .addConnection(connect(lower, 0, key, 0)).addConnection(connect(key, 1, second, 0)).addConnection(connect(second, 1, secondGround, 0));
    expect(kept(new Work(soft))).toEqual(['soft']);
    // The other way round, resistor first and then the switch, is the same thing
    const turned = circuit.addComponent(key).addComponent(second).addComponent(secondGround)
      .addConnection(connect(lower, 0, second, 0)).addConnection(connect(second, 1, key, 0)).addConnection(connect(key, 1, secondGround, 0));
    expect(kept(new Work(turned))).toEqual(['soft']);
    // A switch and a resistor that are not across the lower resistor soften nothing
    const nowhere = circuit.addComponent(key).addComponent(second).addConnection(connect(key, 1, second, 0));
    expect(kept(new Work(nowhere))).toEqual([]);
    // FIFTH is not SOFT
    expect(step(lesson.keep, 'soft').done(new Work(circuit))).toBe(false);

    const named = soft.updateComponent(key.id, { label: 'soft' });
    expect(kept(new Work(named))).toEqual(['soft', 'name']);
    expect(step(lesson.keep, 'cover').done(new Work(named, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(named, { ...playing, saved: true }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(empty(), { ...playing, saved: true }))).toBe(false);
  });

  it('what it keeps is the chord, its mixer and its speaker: SOFT halves the level, FIFTH still takes a voice out, SOUND all of them', () => {
    const circuit = keptCircuit();
    expect(kept(new Work(circuit))).toEqual(['soft', 'name']);
    expect(all(circuit, 'switch').map((s) => s.label).sort()).toEqual(['FIFTH', 'SOFT', 'SOUND']);
    expect(all(circuit, 'audio-output')).toHaveLength(0);
    // Every step of the build is done on it but the ones that are about looking and listening
    expect(done(new Work(circuit))).toEqual(['opamp', 'half', 'feedback', 'input', 'hear', 'mix', 'power', 'cut', 'speaker']);
    const loud = levelOf(circuit, null), soft = levelOf(flip(circuit, 'SOFT', 1), null);
    expect(loud).toBeGreaterThan(0.16);
    expect(loud).toBeLessThan(0.2);
    expect(soft / loud).toBeGreaterThan(0.45);
    expect(soft / loud).toBeLessThan(0.55);
    // FIFTH: one voice less in the op-amp's output, the others as they were
    const amp = only(circuit, 'lm741');
    const withFifth = voiceHeights(circuit, amp, LM741.OUT, ['SOFT']);
    const without = voiceHeights(circuit, amp, LM741.OUT, ['SOFT', 'FIFTH']);
    expect(without[2]).toBeLessThan(0.02);
    for (const voice of [0, 1]) expect(without[voice] / withFifth[voice]).toBeCloseTo(1, 2);
    // SOUND: it stands between the chord and the amplifier. Open, OUT rests at 4.5 V and the speaker is silent
    const off = flip(circuit, 'SOUND', 0);
    const rest = settle(off, [[amp, LM741.OUT]], null).volts(amp, LM741.OUT);
    expect(rest.mean).toBeCloseTo(4.5, 2);
    expect(tall(rest)).toBeLessThan(0.01);
    expect(levelOf(off, null)).toBeLessThan(0.001);
    for (const quoted of ['Leave SOUND closed', 'still turns the whole chord on and off', 'between the chord and the amplifier']) expect(step(lesson.build, 'input').how).toContain(quoted);
    expect(step(lesson.keep, 'name').how).toContain('three switches: SOUND for the whole chord, FIFTH for one note of it, and SOFT for how loud it is');
    // The op-amp stays clear of its limits either way
    const out = settle(circuit, [[amp, LM741.OUT]], null).volts(amp, LM741.OUT);
    expect(out.min).toBeGreaterThan(1.6);
    expect(out.max).toBeLessThan(7.4);
  });

  it('the questions it asks of a circuit are cheap enough to ask at every edit', () => {
    const circuit = keptCircuit();
    const started = performance.now();
    const work = new Work(circuit, playing);
    done(work);
    kept(work);
    lesson.check.passed(work);
    lesson.check.reading(work);
    for (const experiment of lesson.tries) experiment.made(work);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
