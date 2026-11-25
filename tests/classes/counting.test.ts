/**
 * Class 8 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { counting as lesson, countingKept } from '@/classes/counting';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { capacitor, connect, ground, place, resistor } from '@/examples/circuits';
import { dutyCycle, harmonics, measureSignal, risings } from '@/simulation/measure/signal';
import { spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import type { Component, Connection } from '@/types/circuit';
import type { Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

// Pins, by their place among a part's pins
const CLK = 0, RST = 1, VDD = 14, VSS = 15;
const Q = (n: number) => n + 1; // Q(1) is Q1
const Y = (n: number) => n + 5; // Y(1) is 1Y
const A = (n: number) => n - 1; // A(1) is 1A

const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const named = (circuit: Circuit, name: string) => circuit.getComponents().find((c) => c.label === name)!;
const add = (circuit: Circuit, parts: Component[], wires: Connection[]) => {
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

/** The three circuits of the class: what it starts from, the counter with its four lights, the octave stack. */
const start = () => classStart(lesson);
const lights = () => classStage(lesson, []);
const stack = () => classCircuit(lesson);
const keptCircuit = () => {
  const { components, connections } = countingKept();
  return add(new Circuit('kept'), components, connections);
};

/** The oscillator's capacitor changed for another: the one change that takes the class from a count to a note and back. */
const farads = (circuit: Circuit, value: number) => {
  const timing = only(circuit, 'capacitor');
  return circuit.updateComponent(timing.id, { parameters: { ...timing.parameters, capacitance: value, value: formatValue(value, 'capacitance') } });
};
/** The resistor of one value changed for another. */
const ohms = (circuit: Circuit, from: number, to: number) => {
  const part = all(circuit, 'resistor').find((r) => r.parameters.resistance === from)!;
  return circuit.updateComponent(part.id, { parameters: { ...part.parameters, resistance: to, value: formatValue(to, 'resistance') } });
};
/** The wire from one part's pin to another part. */
const wire = (circuit: Circuit, from: Component, pin: number, to: Component) => {
  const found = circuit.getConnections().find((c) =>
    (c.from.componentId === from.id && c.from.pinId === from.pins[pin].id && c.to.componentId === to.id)
    || (c.to.componentId === from.id && c.to.pinId === from.pins[pin].id && c.from.componentId === to.id));
  if (!found) throw new Error('no such wire');
  return found;
};
/** A 1 kΩ, an LED and a ground hung on a pin: a light. */
const light = (circuit: Circuit, on: Component, pin: number, x = 1100): Circuit => {
  const limit = resistor(1000, x, 900, 90), led = place('led', x, 1000, { rotation: 90 }), ledGround = ground(x, 1080);
  return add(circuit, [limit, led, ledGround], [connect(on, pin, limit, 0), connect(limit, 1, led, 0), connect(led, 1, ledGround, 0)]);
};
/** The resistor of a given value on a counter output (the 1 kΩ of its light, the 100 kΩ of the mix). */
const resistorOn = (circuit: Circuit, q: number, value: number): Component => {
  const work = new Work(circuit), counter = only(circuit, 'cd4040');
  return all(circuit, 'resistor').find((r) => r.parameters.resistance === value && work.joined(r, 0, counter, Q(q)))!;
};
/** The LED of the light on a counter output. */
const ledOn = (circuit: Circuit, q: number): Component => {
  const work = new Work(circuit), limit = resistorOn(circuit, q, 1000);
  return all(circuit, 'led').find((led) => work.joined(led, 0, limit, 1))!;
};
/** A light moved from one counter output to another. */
const moveLight = (circuit: Circuit, from: number, to: number): Circuit => {
  const counter = only(circuit, 'cd4040'), limit = resistorOn(circuit, from, 1000);
  return circuit.removeConnection(wire(circuit, counter, Q(from), limit).id).addConnection(connect(counter, Q(to), limit, 0));
};
/** RST taken off ground and put on something else (or, with nothing given, left with no wire). */
const resetTo = (circuit: Circuit, to?: [Component, number]): Circuit => {
  const counter = only(circuit, 'cd4040');
  const grounded = circuit.getConnections().find((c) => c.from.componentId === counter.id && c.from.pinId === counter.pins[RST].id)!;
  const free = circuit.removeConnection(grounded.id);
  return to ? free.addConnection(connect(counter, RST, to[0], to[1])) : free;
};
/** A switch dropped onto the wire between a counter output's 100 kΩ and the shared point. */
const switchOn = (circuit: Circuit, q: number, name?: string): Circuit => {
  const share = resistorOn(circuit, q, 100e3);
  return spliceIntoWire(circuit, place('switch', 1300, 300, { label: name }), wire(circuit, share, 1, named(circuit, 'SOUND')).id);
};
/** A fourth 100 kΩ, from Q1 to the shared point. */
const fourth = (circuit: Circuit, wired = true): Circuit => {
  const share = resistor(100e3, 1520, 300, 90);
  return add(circuit, [share], wired ? [connect(only(circuit, 'cd4040'), Q(1), share, 0), connect(share, 1, named(circuit, 'SOUND'), 0)] : []);
};
/** The Audio Out's switch taken off the oscillator and put on a counter output. */
const listenTo = (circuit: Circuit, q: number): Circuit => {
  const sound = named(circuit, 'SOUND');
  return circuit.removeConnection(wire(circuit, only(circuit, 'cd40106'), Y(1), sound).id)
    .addConnection(connect(only(circuit, 'cd4040'), Q(q), sound, 0));
};

/** How often a recorded square wave repeats, from its first whole cycle to its last. */
const hertzOf = (trace: ArrayLike<number>, sampleRate: number, level: number) => {
  const edges = risings(trace, level, level * 0.8);
  return ((edges.length - 2) / (edges[edges.length - 1] - edges[1])) * sampleRate;
};
/** A run with the counter's clock, its first four outputs and every LED recorded. */
const watched = (circuit: Circuit, seconds: number, sampleRate = 48000) => {
  const counter = only(circuit, 'cd4040');
  const run = new Work(circuit).bench({
    seconds, sampleRate, watch: [CLK, Q(1), Q(2), Q(3), Q(4)].map((pin): [Component, number] => [counter, pin]),
    watchAmps: all(circuit, 'led').map((led) => led.id),
  });
  const pin = (index: number) => run.trace(counter.id, counter.pins[index].id)!;
  return { run, pin, hertz: (index: number) => hertzOf(pin(index), sampleRate, 4.5) };
};
/** The numbers the four lights show, one after another: Q1's light is worth 1, Q2's 2, Q3's 4 and Q4's 8. */
const countsShown = (circuit: Circuit, seconds: number) => {
  const sampleRate = 2000;
  const { run } = watched(circuit, seconds, sampleRate);
  const traces = [1, 2, 3, 4].map((q) => run.ampsTrace(ledOn(circuit, q).id)!);
  const shown: Array<{ count: number; at: number }> = [];
  for (let i = 0; i < traces[0].length; i++) {
    const count = traces.reduce((sum, trace, bit) => sum + (trace[i] > 1e-3 ? 2 ** bit : 0), 0);
    if (shown.length === 0 || shown[shown.length - 1].count !== count) shown.push({ count, at: i / sampleRate });
  }
  return shown;
};
/** How large the tone at each of `count` frequencies is in what a circuit plays, the first being `hertz` and each next one twice the last. */
const tones = (circuit: Circuit, hertz: number, count: number, set: Array<{ componentId: string; parameter: string; value: number }> = []) => {
  const run = new Work(circuit).bench({ seconds: 0.2, set });
  const sizes = harmonics(run.soundTrace, run.sampleRate, hertz, 2 ** (count - 1));
  return Array.from({ length: count }, (_, i) => sizes[2 ** i - 1]);
};

describe('class 8, counting: what it says', () => {
  it('starts from the oscillator class 4 kept: 441 Hz, with its SOUND switch', () => {
    const circuit = start();
    expect(lesson.number).toBe(8);
    expect(lesson.id).toBe('counting');
    expect(lesson.unit).toBe('Logic and rhythm');
    expect(all(circuit, 'resistor').map((r) => r.parameters.resistance).sort()).toEqual([2200, 27000]);
    expect(only(circuit, 'capacitor').parameters.capacitance).toBe(100e-9);
    expect(only(circuit, 'switch').label).toBe('SOUND');
    expect(new Work(circuit).run([], 0.5).sound.hertz!.toFixed(0)).toBe('441');
    expect(lesson.startsFrom).toContain('441 Hz');
    expect(step(lesson.build, 'slow').how).toContain('441 Hz');
    expect(done(new Work(circuit))).toEqual([]);
  });

  it('with 10 µF it ticks 4.4 times a second, a hundred times slower, and the lights blink at 2.20, 1.10, 0.55 and 0.28 Hz', () => {
    const circuit = lights();
    const { run, hertz } = watched(circuit, 12, 2000);
    expect(hertz(CLK).toFixed(1)).toBe('4.4');
    expect(441 / hertz(CLK)).toBeCloseTo(100, 0);
    const rates = [1, 2, 3, 4].map((q) => measureSignal(run.ampsTrace(ledOn(circuit, q).id)!, 2000, 1e-4).hertz!.toFixed(2));
    expect(rates).toEqual(['2.20', '1.10', '0.55', '0.28']);
    // What comes out of the Audio Out is still the oscillator: a tick
    expect(run.sound.hertz!.toFixed(1)).toBe('4.4');
    expect(step(lesson.build, 'slow').how).toContain('a hundred times slower');
    expect(step(lesson.build, 'slow').how).toContain('4.4 times a second');
    expect(step(lesson.build, 'play').how).toContain('4.4 times a second');
    expect(step(lesson.build, 'play').how).toContain('half that: 2.20 Hz');
    expect(why('Half, and half again')).toContain('CLK ran at 4.4 Hz and the lights blinked at 2.20, 1.10, 0.55 and 0.28 Hz');
  });

  it('the four lights count in binary from 0 to 15 and start again, 3.6 seconds a round', () => {
    const shown = countsShown(lights(), 9);
    expect(shown.length).toBeGreaterThan(32);
    for (let i = 1; i < shown.length; i++) expect(shown[i].count).toBe((shown[i - 1].count + 1) % 16);
    expect(new Set(shown.map((s) => s.count)).size).toBe(16);
    const zeros = shown.filter((s) => s.count === 0);
    expect((zeros[1].at - zeros[0].at).toFixed(1)).toBe('3.6');
    expect(step(lesson.build, 'four').how).toContain('Q1\'s light is worth 1, Q2\'s 2, Q3\'s 4 and Q4\'s 8');
    expect(step(lesson.build, 'four').how).toContain('from 0 to 15');
    expect(why('Counting')).toContain('count from 0 to 15 and start again: that took 3.6 seconds');
  });

  it('Q1 changes when CLK falls, and never when it rises', () => {
    const { pin } = watched(lights(), 3, 2000);
    const clock = pin(CLK), first = pin(Q(1));
    let falls = 0, changes = 0;
    for (let i = 1; i < clock.length; i++) {
      const fell = clock[i - 1] > 4.5 && clock[i] < 4.5;
      const rose = clock[i - 1] < 4.5 && clock[i] > 4.5;
      const changed = (first[i - 1] > 3.5) !== (first[i] > 3.5);
      if (fell) falls++;
      if (changed) changes++;
      expect(changed).toBe(fell);
      if (rose) expect(changed).toBe(false);
    }
    expect(falls).toBeGreaterThan(10);
    expect(changes).toBe(falls);
    expect(step(lesson.build, 'edge').how).toContain('only at the moment CLK falls from high to low');
    expect(why('The clock and its edge')).toContain('The CD4040 counts falling edges');
  });

  it('RST high holds the count at 0; with no wire on it the app reads it as low and the chip counts', () => {
    const base = lights();
    const held = resetTo(base, [only(base, 'power'), 0]);
    const { run } = watched(held, 4, 2000);
    for (const led of all(held, 'led')) expect(Math.max(...run.ampsTrace(led.id)!)).toBeLessThan(1e-6);
    const shown = countsShown(resetTo(base), 5);
    for (let i = 1; i < shown.length; i++) expect(shown[i].count).toBe((shown[i - 1].count + 1) % 16);
    expect(shown.length).toBeGreaterThan(16);
    expect(why('Reset')).toContain('While it is high every output is low and the count is held at 0');
    expect(why('Reset')).toContain('a RST pin with no wire on it reads low and the chip counts anyway');
  });

  it('with 10 nF, a thousand times smaller, the clock is 4,408 Hz and the outputs 2,204, 1,102, 551 and 276 Hz', () => {
    const circuit = stack();
    const { run, hertz } = watched(circuit, 2);
    expect(hertz(CLK).toFixed(0)).toBe('4408');
    expect([1, 2, 3, 4].map((q) => hertz(Q(q)).toFixed(0))).toEqual(['2204', '1102', '551', '276']);
    // Each exactly half of the one before
    for (const q of [1, 2, 3, 4]) expect(hertz(Q(q)) * 2 ** q / hertz(CLK)).toBeCloseTo(1, 4);
    // A thousand times the slow clock, as near as the two can be read
    expect(hertz(CLK) / watched(lights(), 6, 2000).hertz(CLK) / 1000).toBeCloseTo(1, 2);
    // The lights have not stopped: each is lit half of the time
    for (const led of all(circuit, 'led')) expect(dutyCycle(run.ampsTrace(led.id)!, 1e-4)!).toBeCloseTo(0.5, 3);
    expect(step(lesson.build, 'fast').text).toContain('a thousand times smaller');
    expect(why('Octaves')).toContain('CLK at 4,408 Hz');
    expect(why('Octaves')).toContain('2,204 Hz, 1,102 Hz, 551 Hz and 276 Hz');
    expect(why('Octaves')).toContain('lit exactly half of the time');
  });

  it('before the mix, with the Audio Out still on the oscillator, it plays a shrill note of about 4,400 Hz', () => {
    const circuit = farads(lights(), 10e-9);
    const run = new Work(circuit).run([], 0.5);
    expect(Math.abs(run.sound.hertz! - 4400)).toBeLessThan(44);
    expect(step(lesson.build, 'fast').how).toContain('about 4,400 Hz');
    // On one output at a time it is the same note, an octave lower each time
    const notes = [1, 2, 3, 4].map((q) => new Work(listenTo(circuit, q)).run([], 0.5).sound.hertz!.toFixed(0));
    expect(notes).toEqual(['2204', '1102', '551', '276']);
  });

  it('the mix holds Q2, Q3 and Q4 in equal parts and nothing of Q1 or of the clock', () => {
    // 276 Hz and each octave above it, up to the clock
    const [q4, q3, q2, q1, clock] = tones(stack(), 4408.46 / 16, 5);
    for (const size of [q4, q3, q2]) expect(size).toBeGreaterThan(0.15);
    expect(q3 / q4).toBeCloseTo(1, 1);
    expect(q2 / q4).toBeCloseTo(1, 1);
    expect(q1).toBeLessThan(0.01);
    expect(clock).toBeLessThan(0.01);
  });

  it('is written as a class is: plain punctuation, five to ten words, every new word used', () => {
    const texts = [
      lesson.promise, lesson.startsFrom, lesson.check.goal, lesson.check.hint,
      ...[...lesson.build, ...lesson.keep].flatMap((s) => [s.text, s.how ?? '']),
      ...lesson.why.flatMap((p) => [p.title, p.text]),
      ...lesson.tries.flatMap((t) => [t.title, t.question, t.change, ...t.options]),
      ...lesson.words.flatMap((w) => [w.word, w.meaning]),
    ];
    for (const text of texts) expect(text).not.toMatch(/[—–]/);
    expect(lesson.build.length).toBeGreaterThanOrEqual(8);
    expect(lesson.build.length).toBeLessThanOrEqual(14);
    expect(lesson.words.map((w) => w.word)).toEqual(['Clock', 'Edge', 'Counter', 'Binary', 'Reset', 'Frequency divider', 'Subdivision']);
    const body = texts.join(' ').toLowerCase();
    for (const word of lesson.words) expect(body.split(word.word.toLowerCase()).length).toBeGreaterThan(2);
    expect(new Set([...lesson.build, ...lesson.keep].map((s) => s.id)).size).toBe(lesson.build.length + lesson.keep.length);
  });
});

describe('class 8, counting: the steps', () => {
  it('none are done on an empty canvas, nor by the oscillator it starts from', () => {
    expect(done(new Work(new Circuit('empty')))).toEqual([]);
    expect(kept(new Work(new Circuit('empty')))).toEqual([]);
    expect(done(new Work(start()))).toEqual([]);
    expect(kept(new Work(start()))).toEqual([]);
  });

  it('are not fooled by parts that are only lying on the canvas', () => {
    const loose = add(farads(start(), 10e-6), [
      place('cd4040', 900, 420), resistor(1000, 1040, 470, 90), place('led', 1040, 570), resistor(100e3, 1100, 470, 90),
      resistor(100e3, 1240, 470, 90), resistor(100e3, 1380, 470, 90), place('switch', 1100, 610, { label: 'BASS' }),
    ], []);
    expect(done(new Work(loose))).toEqual(['slow']);
    expect(kept(new Work(loose))).toEqual([]);
    expect(lesson.tries.filter((t) => t.made(new Work(loose))).map((t) => t.id)).toEqual([]);
    expect(lesson.check.passed(new Work(loose))).toBe(false);
  });

  it('the oscillator is slowed down: 10 µF, not 1 µF', () => {
    expect(done(new Work(farads(start(), 10e-6)))).toEqual(['slow']);
    // 44 Hz is a purr, not a tick
    expect(done(new Work(farads(start(), 1e-6)))).toEqual([]);
  });

  it('the counter is powered, its reset grounded and the clock wired to it, one at a time', () => {
    const slow = farads(start(), 10e-6);
    const chip = only(slow, 'cd40106'), supply = only(slow, 'power');
    const counter = place('cd4040', 900, 420), supplyGround = ground(980, 230), resetGround = ground(800, 420);
    const powered = add(slow, [counter, supplyGround], [connect(supply, 0, counter, VDD), connect(counter, VSS, supplyGround, 0)]);
    expect(done(new Work(powered))).toEqual(['slow', 'counter']);
    // Only one of its two power pins is not enough
    expect(done(new Work(add(slow, [counter], [connect(supply, 0, counter, VDD)])))).toEqual(['slow']);
    const grounded = add(powered, [resetGround], [connect(counter, RST, resetGround, 0)]);
    expect(done(new Work(grounded))).toEqual(['slow', 'counter', 'reset']);
    const clocked = add(grounded, [], [connect(chip, Y(1), counter, CLK)]);
    expect(done(new Work(clocked))).toEqual(['slow', 'counter', 'reset', 'clock']);
    // CLK on the oscillator's input sees a ramp that never gets low enough to count as a tick
    const first = light(clocked, counter, Q(1));
    expect(done(new Work(first))).toEqual(['slow', 'counter', 'reset', 'clock', 'first']);
    expect(done(new Work(first, playing))).toEqual(['slow', 'counter', 'reset', 'clock', 'first', 'play']);
    // A light hung on the oscillator itself blinks as fast as the clock: it is not on the counter
    expect(done(new Work(light(clocked, chip, Y(1))))).toEqual(['slow', 'counter', 'reset', 'clock']);
    // Three lights are not four, and two lights on one output are still one digit
    const three = light(light(first, counter, Q(2), 1200), counter, Q(3), 1300);
    expect(done(new Work(three))).toEqual(['slow', 'counter', 'reset', 'clock', 'first']);
    expect(done(new Work(light(three, counter, Q(3), 1400)))).toEqual(['slow', 'counter', 'reset', 'clock', 'first']);
    expect(done(new Work(light(three, counter, Q(4), 1400)))).toEqual(['slow', 'counter', 'reset', 'clock', 'first', 'four']);
  });

  it('four lights count whichever way round each LED and its resistor are, and on other outputs than the first four', () => {
    // Q2 to Q5, each with the LED first and the resistor to ground
    let circuit = lights();
    const counter = only(circuit, 'cd4040');
    for (const led of all(circuit, 'led')) circuit = circuit.removeComponent(led.id);
    for (const limit of all(circuit, 'resistor').filter((r) => r.parameters.resistance === 1000)) circuit = circuit.removeComponent(limit.id);
    expect(done(new Work(circuit))).toEqual(['slow', 'counter', 'reset', 'clock']);
    [2, 3, 4, 5].forEach((q, i) => {
      const led = place('led', 1000 + i * 100, 900, { rotation: 90 }), limit = resistor(1000, 1000 + i * 100, 1000, 90), ledGround = ground(1000 + i * 100, 1080);
      circuit = add(circuit, [led, limit, ledGround], [connect(counter, Q(q), led, 0), connect(led, 1, limit, 0), connect(limit, 1, ledGround, 0)]);
    });
    expect(done(new Work(circuit))).toEqual(['slow', 'counter', 'reset', 'clock', 'first', 'four']);
  });

  it('the build\'s own counter has every step of its part done, and the scope is put on CLK and Q1', () => {
    const circuit = lights();
    expect(done(new Work(circuit))).toEqual(['slow', 'counter', 'reset', 'clock', 'first', 'four']);
    const counter = only(circuit, 'cd4040'), chip = only(circuit, 'cd40106');
    const probe = (part: Component, pin: number) => ({ componentId: part.id, pinId: part.pins[pin].id });
    // A probe is on a net: the one on CLK may as well be on the oscillator's output
    const elsewhere = [probe(chip, Y(1)), probe(resistorOn(circuit, 1, 1000), 0)];
    expect(step(lesson.build, 'edge').done(new Work(circuit, { ...playing, probes: elsewhere }))).toBe(true);
    expect(step(lesson.build, 'edge').done(new Work(circuit, { ...playing, probes: [probe(counter, CLK), probe(counter, Q(1))] }))).toBe(true);
    expect(step(lesson.build, 'edge').done(new Work(circuit, { ...playing, probes: [probe(counter, CLK)] }))).toBe(false);
    expect(step(lesson.build, 'edge').done(new Work(circuit, { ...playing, probes: [probe(counter, CLK), probe(counter, Q(2))] }))).toBe(false);
    expect(step(lesson.build, 'edge').done(new Work(circuit, { ...playing, playing: false, probes: [probe(counter, CLK), probe(counter, Q(1))] }))).toBe(false);
  });

  it('it is speeded up with 10 nF, listened to on one output, then mixed', () => {
    const fast = farads(lights(), 10e-9);
    expect(done(new Work(fast, playing))).toEqual(['counter', 'reset', 'clock', 'play', 'fast']);
    // 100 nF is the 441 Hz it started with: not yet
    expect(step(lesson.build, 'fast').done(new Work(farads(lights(), 100e-9)))).toBe(false);
    for (const q of [1, 4]) {
      expect(step(lesson.build, 'listen').done(new Work(listenTo(fast, q), playing))).toBe(true);
      expect(step(lesson.build, 'listen').done(new Work(listenTo(fast, q)))).toBe(false); // it is not playing
    }
    expect(step(lesson.build, 'mix').done(new Work(listenTo(fast, 2)))).toBe(false);

    const mixed = stack();
    expect(done(new Work(mixed, playing))).toEqual(['counter', 'reset', 'clock', 'play', 'fast', 'listen', 'mix']);
    expect(step(lesson.build, 'mix').done(new Work(mixed))).toBe(true);
    // Two of the three are not the mix
    expect(step(lesson.build, 'mix').done(new Work(mixed.removeComponent(resistorOn(mixed, 3, 100e3).id)))).toBe(false);
    // SOUND open makes no difference to what has been built
    const sound = named(mixed, 'SOUND');
    const silent = mixed.updateComponent(sound.id, { parameters: { ...sound.parameters, closed: 0 } });
    expect(step(lesson.build, 'mix').done(new Work(silent))).toBe(true);
  });

  it('"Stuck?" gives the counter with its lights until the scope has been looked at, and the stack after', () => {
    const order = lesson.build.map((s) => s.id);
    expect(order).toEqual(['slow', 'counter', 'reset', 'clock', 'first', 'play', 'four', 'edge', 'fast', 'listen', 'mix']);
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['edge']);
    for (const upTo of [0, 4, 7]) {
      const circuit = classStage(lesson, order.slice(0, upTo));
      expect(only(circuit, 'capacitor').parameters.capacitance).toBe(10e-6);
      expect(all(circuit, 'led')).toHaveLength(4);
      expect(all(circuit, 'resistor').filter((r) => r.parameters.resistance === 100e3)).toHaveLength(0);
    }
    for (const upTo of [8, 10, 11]) {
      const circuit = classStage(lesson, order.slice(0, upTo));
      expect(only(circuit, 'capacitor').parameters.capacitance).toBe(10e-9);
      expect(all(circuit, 'led')).toHaveLength(4);
      expect(all(circuit, 'resistor').filter((r) => r.parameters.resistance === 100e3)).toHaveLength(3);
    }
    // The lights stand in a row with Q4's on the left, as the step asks
    const row = [4, 3, 2, 1].map((q) => ledOn(lights(), q).position.x);
    expect(row).toEqual([...row].sort((a, b) => a - b));
  });
});

describe('class 8, counting: the experiments', () => {
  it('a fourth octave: Q1 joins the mix, which then holds 2,204, 1,102, 551 and 276 Hz', () => {
    const circuit = fourth(stack());
    const [q4, q3, q2, q1] = tones(circuit, 4408.46 / 16, 4);
    for (const size of [q4, q3, q2, q1]) expect(size).toBeGreaterThan(0.1);
    const experiment = tryOut('fourth');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^Your mix now holds 2,204 Hz, 1,102 Hz, 551 Hz and 276 Hz\./);
    expect(experiment.made(new Work(stack()))).toBe(false);
    expect(experiment.made(new Work(fourth(stack(), false)))).toBe(false);
  });

  it('a switch in line with Q4\'s resistor: open, the lowest octave is 551 Hz; closed, 276 Hz', () => {
    const circuit = switchOn(stack(), 4);
    const added = all(circuit, 'switch').find((s) => s.label !== 'SOUND')!;
    const at = (closed: number) => tones(circuit, 4408.46 / 16, 3, [{ componentId: added.id, parameter: 'closed', value: closed }]);
    expect(at(1)[0]).toBeGreaterThan(0.15);
    expect(at(0)[0]).toBeLessThan(0.01);
    expect(at(0)[1]).toBeGreaterThan(0.15);
    expect(at(0)[2]).toBeGreaterThan(0.15);
    const experiment = tryOut('bass');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^Open, the lowest octave in the mix is 551 Hz\. Closed, it is 276 Hz\./);
    // It is made whichever way the switch stands
    const closed = circuit.updateComponent(added.id, { parameters: { ...added.parameters, closed: 1 } });
    expect(experiment.made(new Work(closed))).toBe(true);
    // SOUND takes everything out, and a switch on Q2 takes out the top: neither is the bass
    expect(experiment.made(new Work(stack()))).toBe(false);
    expect(experiment.made(new Work(switchOn(stack(), 2)))).toBe(false);
  });

  it('47 kΩ for the 27 kΩ: the clock drops to 2,627 Hz and the octaves go with it, still exactly an octave apart', () => {
    const circuit = ohms(stack(), 27000, 47000);
    const { hertz } = watched(circuit, 1);
    expect(hertz(CLK).toFixed(0)).toBe('2627');
    expect([2, 3, 4].map((q) => hertz(Q(q)).toFixed(0))).toEqual(['657', '328', '164']);
    expect(hertz(Q(2)) / hertz(Q(3))).toBeCloseTo(2, 3);
    expect(hertz(Q(3)) / hertz(Q(4))).toBeCloseTo(2, 3);
    const experiment = tryOut('tune');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^The clock now runs at 2,627 Hz and the mix holds 657 Hz, 328 Hz and 164 Hz:/);
    expect(experiment.made(new Work(stack()))).toBe(false);
    // Slowed right down it is not a retuned note
    expect(experiment.made(new Work(farads(stack(), 10e-6)))).toBe(false);
  });

  it('the mix with 10 µF: a pattern of clicks from the Audio Out, in time with lights at 2.20, 1.10 and 0.55 Hz', () => {
    const circuit = farads(stack(), 10e-6);
    const { run, hertz } = watched(circuit, 8, 2000);
    expect(hertz(CLK).toFixed(2)).toBe('4.41');
    // Something comes out, and it is not the oscillator's own tick
    expect(run.sound.max - run.sound.min).toBeGreaterThan(0.2);
    expect(Math.abs((run.sound.hertz ?? 0) - hertz(CLK))).toBeGreaterThan(1);
    const experiment = tryOut('rhythm');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^The clock ticks at 4\.41 Hz and the lights blink at 2\.20 Hz, 1\.10 Hz and 0\.55 Hz\./);
    expect(experiment.made(new Work(stack()))).toBe(false);
    // The counter and its lights before any mix was wired
    expect(experiment.made(new Work(lights()))).toBe(false);
  });

  it('RST on Q4: the count never gets past 7, and starts again every 1.8 seconds', () => {
    const base = farads(stack(), 10e-6);
    const circuit = resetTo(base, [only(base, 'cd4040'), Q(4)]);
    const shown = countsShown(circuit, 6);
    expect(Math.max(...shown.map((s) => s.count))).toBe(7);
    for (let i = 1; i < shown.length; i++) expect(shown[i].count).toBe((shown[i - 1].count + 1) % 8);
    const zeros = shown.filter((s) => s.count === 0);
    expect((zeros[1].at - zeros[0].at).toFixed(1)).toBe('1.8');
    const experiment = tryOut('seven');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^The count now runs from 0 to 7 and starts again, once every 1\.8 seconds\. One light never comes on\./);
    expect(experiment.options[experiment.answer]).toBe('Never get past 7');
    expect(experiment.made(new Work(base))).toBe(false);
    // RST with no wire on it is not a counter that resets itself, and nor is a light taken off
    expect(experiment.made(new Work(resetTo(base)))).toBe(false);
    expect(experiment.made(new Work(base.removeComponent(ledOn(base, 4).id)))).toBe(false);
    // On Q3 it counts to 3
    const short = resetTo(base, [only(base, 'cd4040'), Q(3)]);
    expect(experiment.made(new Work(short))).toBe(true);
    expect(experiment.result(new Work(short))).toMatch(/^The count now runs from 0 to 3 and starts again/);
  });

  it('every experiment asks a question with a right answer among its options, and none is made before it is tried', () => {
    expect(lesson.tries.map((t) => t.id)).toEqual(['fourth', 'bass', 'tune', 'rhythm', 'seven']);
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(new Circuit('empty')))).toBe(false);
      expect(experiment.made(new Work(start()))).toBe(false);
      expect(experiment.made(new Work(stack()))).toBe(false);
    }
  });
});

describe('class 8, counting: the check', () => {
  it('has nothing to read without a light, and reads the build\'s own circuits without passing them', () => {
    expect(lesson.check.reading(new Work(new Circuit('empty')))).toBeNull();
    expect(lesson.check.reading(new Work(start()))).toBeNull();
    expect(lesson.check.passed(new Work(new Circuit('empty')))).toBe(false);
    // The stack: all four lights flicker too fast to see
    expect(lesson.check.reading(new Work(stack()))).toBe('No light is blinking slowly enough to see.');
    expect(lesson.check.passed(new Work(stack()))).toBe(false);
    // With the 10 µF back in: one light is near enough once a second, but the clock has no light on it
    for (const circuit of [lights(), farads(stack(), 10e-6)]) {
      expect(lesson.check.reading(new Work(circuit))).toBe('Your lights: 2.20 Hz, 1.10 Hz and 0.55 Hz. None is four times as fast as the 1.10 Hz one.');
      expect(lesson.check.passed(new Work(circuit))).toBe(false);
    }
  });

  it('is passed the slow way the hint gives: 10 µF, and 15 kΩ in place of the 27 kΩ', () => {
    const circuit = ohms(farads(stack(), 10e-6), 27000, 15000);
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    expect(lesson.check.reading(new Work(circuit))).toBe('Your lights: 3.72 Hz, 1.86 Hz, 0.93 Hz and 0.46 Hz. The 3.72 Hz one is four times the 0.93 Hz one.');
    expect(lesson.check.hint).toMatch(/^Calculated, not measured/);
    expect(lesson.check.hint).toContain('15 kΩ in place of the 27 kΩ');
    // With 10 kΩ there, no light is near once a second
    const off = ohms(farads(stack(), 10e-6), 27000, 10000);
    expect(lesson.check.passed(new Work(off))).toBe(false);
    expect(lesson.check.reading(new Work(off))).toMatch(/^Your lights: 5\.\d\d Hz, 2\.\d\d Hz, 1\.3\d Hz and 0\.6\d Hz\. None is between 0\.9 and 1\.1 Hz\.$/);
  });

  it('is passed the fast way the hint gives: the note left as it is, and two lights moved to Q12 and Q10', () => {
    const circuit = moveLight(moveLight(stack(), 1, 12), 2, 10);
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    // 4,408 Hz divided by 4,096
    expect(lesson.check.reading(new Work(circuit))).toBe('Your lights: 4.31 Hz and 1.08 Hz. The 4.31 Hz one is four times the 1.08 Hz one.');
    expect((4408.46 / 4096).toFixed(2)).toBe('1.08');
    expect(lesson.check.hint).toContain('4,408 Hz divided by 4,096 is 1.08 Hz, and that is Q12');
    expect(why('Half, and half again')).toContain('Q12: CLK divided by 4,096');
    // Q12 and Q11 are only two to one
    expect(lesson.check.passed(new Work(moveLight(moveLight(stack(), 1, 12), 2, 11)))).toBe(false);
  });

  it('is passed by a light on the clock itself, behind a buffer, with the one on Q2', () => {
    const base = lights();
    const chip = only(base, 'cd40106');
    const buffered = light(add(base, [], [connect(chip, Y(1), chip, A(2))]), chip, Y(2));
    expect(lesson.check.reading(new Work(buffered))).toBe('Your lights: 4.41 Hz, 2.20 Hz, 1.10 Hz and 0.55 Hz. The 4.41 Hz one is four times the 1.10 Hz one.');
    expect(lesson.check.passed(new Work(buffered))).toBe(true);
  });

  it('is not passed by two oscillators, one near 1 Hz and the other near 4: only a counter is exact', () => {
    // A second oscillator on inverter 2, 30 kΩ and 10 µF, with its light behind inverter 3
    const base = lights();
    const chip = only(base, 'cd40106');
    const feedback = resistor(30000, 400, 800), timing = capacitor(10e-6, 300, 880, 90), timingGround = ground(300, 960);
    const second = light(add(base, [feedback, timing, timingGround], [
      connect(chip, Y(2), feedback, 1), connect(feedback, 0, chip, A(2)), connect(timing, 0, chip, A(2)), connect(timing, 1, timingGround, 0),
      connect(chip, Y(2), chip, A(3)),
    ]), chip, Y(3));
    const reading = lesson.check.reading(new Work(second))!;
    expect(reading).toMatch(/^Your lights: 4\.\d\d Hz, 2\.20 Hz, 1\.10 Hz and 0\.55 Hz\. None is four times as fast as the 1\.10 Hz one\.$/);
    expect(lesson.check.passed(new Work(second))).toBe(false);
  });
});

describe('class 8, counting: keeping it', () => {
  it('the stack is put back, the switch on Q4 named BASS, the cover looked at and the circuit saved', () => {
    // As the check left it: slow
    const slow = switchOn(ohms(farads(stack(), 10e-6), 27000, 15000), 4);
    expect(kept(new Work(slow))).toEqual([]);
    const back = farads(slow, 10e-9);
    expect(kept(new Work(back))).toEqual(['stack']);
    const added = all(back, 'switch').find((s) => s.label !== 'SOUND')!;
    const namedIt = back.updateComponent(added.id, { label: 'bass' });
    expect(kept(new Work(namedIt))).toEqual(['stack', 'name']);
    expect(step(lesson.keep, 'cover').done(new Work(namedIt, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(namedIt, { ...playing, saved: true }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(new Circuit('empty'), { ...playing, saved: true }))).toBe(false);
    expect(step(lesson.keep, 'name').text).toBe('Name the switch in line with Q4\'s 100 kΩ BASS.');
  });

  it('the name has to be on a switch that works the bass: not on SOUND, and not on a switch in Q2\'s resistor', () => {
    const plain = stack();
    const renamed = plain.updateComponent(named(plain, 'SOUND').id, { label: 'BASS' });
    expect(step(lesson.keep, 'name').done(new Work(renamed))).toBe(false);
    expect(step(lesson.keep, 'name').done(new Work(switchOn(stack(), 2, 'BASS')))).toBe(false);
    expect(step(lesson.keep, 'name').done(new Work(switchOn(stack(), 4, 'BASS')))).toBe(true);
    // The switch there but not named
    expect(step(lesson.keep, 'name').done(new Work(switchOn(stack(), 4)))).toBe(false);
  });

  it('what it keeps is the octave stack with BASS in Q4\'s resistor: closed 276 Hz is the lowest octave, open 551 Hz', () => {
    const circuit = keptCircuit();
    expect(kept(new Work(circuit))).toEqual(['stack', 'name']);
    expect(done(new Work(circuit, playing))).toEqual(['counter', 'reset', 'clock', 'play', 'fast', 'listen', 'mix']);
    expect(all(circuit, 'switch').map((s) => s.label).sort()).toEqual(['BASS', 'SOUND']);
    expect(all(circuit, 'led')).toHaveLength(4);
    const bass = named(circuit, 'BASS'), sound = named(circuit, 'SOUND');
    expect(bass.parameters.closed).toBe(1);
    const flipped = (part: Component, closed: number) => [{ componentId: part.id, parameter: 'closed', value: closed }];
    // As it is kept, it plays all three
    for (const size of tones(circuit, 4408.46 / 16, 3)) expect(size).toBeGreaterThan(0.15);
    const [q4, q3, q2] = tones(circuit, 4408.46 / 16, 3, flipped(bass, 0));
    expect(q4).toBeLessThan(0.01);
    expect(q3).toBeGreaterThan(0.15);
    expect(q2).toBeGreaterThan(0.15);
    // The clock is the build's, and SOUND still switches the whole thing off
    expect(watched(circuit, 1).hertz(CLK).toFixed(0)).toBe('4408');
    const level = (closed: number) => {
      const heard = new Work(circuit).bench({ seconds: 0.1, set: flipped(sound, closed) }).sound;
      return heard.max - heard.min;
    };
    expect(level(1)).toBeGreaterThan(0.5);
    expect(level(0)).toBeLessThan(0.005);
    // It passes its own experiment, and a later class can open it and find nothing half-done
    expect(tryOut('bass').made(new Work(circuit))).toBe(true);
  });
});
