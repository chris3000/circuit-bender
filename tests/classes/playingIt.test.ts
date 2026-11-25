/**
 * Class 5 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { playingIt as lesson, playingItKept } from '@/classes/playingIt';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { capacitor, connect, exampleCircuits, ground, place, pot, resistor } from '@/examples/circuits';
import { removeFromCircuit, replacePart, spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import { formatHertz } from '@/utils/readings';
import { replacementsFor } from '@/views/ComponentDrawer/catalog';
import type { Component, ConnectionId } from '@/types/circuit';
import type { Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

type Controls = Array<{ componentId: string; parameter: string; value: number }>;

const definition = (type: string) => ALL_PARTS.find((d) => d.type === type)!;
const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const resistorOf = (circuit: Circuit, ohms: number): Component => {
  const found = all(circuit, 'resistor').filter((r) => Math.abs(Number(r.parameters.resistance) - ohms) < ohms * 0.01);
  if (found.length !== 1) throw new Error(`${found.length} resistors of ${ohms} Ω`);
  return found[0];
};
const withOhms = (circuit: Circuit, part: Component, value: number) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, resistance: value, value: formatValue(value, 'resistance') } });
const withFarads = (circuit: Circuit, value: number, part = only(circuit, 'capacitor')) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, capacitance: value, value: formatValue(value, 'capacitance') } });
const setting = (circuit: Circuit, part: Component, parameters: Component['parameters']) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, ...parameters } });
/** A part swapped for another kind the way a double-click does it. */
const swap = (circuit: Circuit, part: Component, type: string, parameters: Component['parameters'] = {}) =>
  replacePart(circuit, part.id, definition(type), parameters).circuit;
const wireBetween = (circuit: Circuit, a: Component, b: Component): ConnectionId => {
  const wire = circuit.getConnections().find((c) =>
    (c.from.componentId === a.id && c.to.componentId === b.id) || (c.from.componentId === b.id && c.to.componentId === a.id));
  if (!wire) throw new Error('no such wire');
  return wire.id;
};
const circuitOf = (built: { components: Component[]; connections: ReturnType<typeof connect>[] }) => {
  let circuit = new Circuit('built');
  for (const c of built.components) circuit = circuit.addComponent(c);
  for (const c of built.connections) circuit = circuit.addConnection(c);
  return circuit;
};

const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);
const why = (title: string) => lesson.why.find((p) => p.title === title)!.text;
const empty = () => new Circuit('empty');

// The circuits of the class: what it starts from, the three ways of playing in turn, and the last with its volume knob
const BUILD = lesson.build.map((s) => s.id);
const upTo = (id: string) => BUILD.slice(0, BUILD.indexOf(id) + 1);
const start = () => classStart(lesson);
const knob = () => classStage(lesson, upTo('play'));
const skin = () => classStage(lesson, upTo('top'));
const light = () => classStage(lesson, upTo('small'));
const final = () => classCircuit(lesson);
const kept = () => circuitOf(playingItKept());

/** A control of every part of a kind put somewhere. */
const put = (circuit: Circuit, type: string, parameter: string, value: number): Controls =>
  all(circuit, type).map((part) => ({ componentId: part.id, parameter, value }));
const shade = (circuit: Circuit, value: number) => put(circuit, 'ldr', 'light', value);
const touch = (circuit: Circuit, value: number) => put(circuit, 'body-contact', 'touch', value);
const turned = (circuit: Circuit, value: number) => put(circuit, 'potentiometer', 'position', value);

/** The circuit as it stands (or with controls put some way), listened to at inverter 1's output and at the Audio Out. */
function listen(circuit: Circuit, set: Controls = [], seconds = 0.3, sampleRate = 48000) {
  const chip = only(circuit, 'cd40106'), jack = only(circuit, 'audio-output');
  const run = new Work(circuit).bench({ watch: [[chip, 6], [jack, 0]], set, seconds, sampleRate });
  const out = run.volts(chip.id, chip.pins[6].id), wire = run.volts(jack.id, jack.pins[0].id);
  return { hertz: out.hertz, high: out.max, low: out.min, swing: out.max - out.min, level: wire.max - wire.min, run };
}
const hertz = (circuit: Circuit, set: Controls = []) => listen(circuit, set).hertz;
/** A note as the class writes it: "5.03 kHz", "27.5 Hz". */
const written = (circuit: Circuit, set: Controls = []) => formatHertz(hertz(circuit, set)!);
/** A note to the nearest hertz: "441 Hz". */
const whole = (circuit: Circuit, set: Controls = []) => `${hertz(circuit, set)!.toFixed(0)} Hz`;

/** The size of the sound once the output has settled: its largest sample, either way. */
function loudness(circuit: Circuit, set: Controls = []): number {
  const tail = new Work(circuit).bench({ set, seconds: 1 }).soundTrace.slice(-4800);
  return tail.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);
}

/** The resistance of a part between its first two legs, read with 9 V across it and a 10 kΩ in line. */
function ohmsOf(type: string, parameters: Component['parameters'] = {}): number {
  const supply = place('power', 200, 300), supplyGround = ground(200, 400);
  const part = place(type, 340, 200, { parameters });
  const inLine = resistor(10000, 480, 200), end = ground(600, 300);
  const circuit = circuitOf({
    components: [supply, supplyGround, part, inLine, end],
    connections: [connect(supply, 1, supplyGround, 0), connect(supply, 0, part, 0), connect(part, 1, inLine, 0), connect(inLine, 1, end, 0)],
  });
  return 9 / new Work(circuit).run().amps(inLine.id) - 10000;
}

// --- Circuits a learner might have ---

/** The 27 kΩ swapped for a pot of some size: the first move of the build. */
const withPot = (ohms: number) => {
  const circuit = start();
  return swap(circuit, resistorOf(circuit, 27000), 'potentiometer', { maxResistance: ohms, value: formatValue(ohms, 'resistance') });
};
/** A resistor wired beside the photocell: an end on each of its legs. */
function besideCell(circuit: Circuit, ohms: number): Circuit {
  const cell = only(circuit, 'ldr'), extra = resistor(ohms, 360, 500);
  return circuit.addComponent(extra).addConnection(connect(extra, 0, cell, 1)).addConnection(connect(extra, 1, cell, 0));
}
/** The light-played oscillator with other resistors: `inLine` where the 4.7 kΩ is, `beside` across the photocell if given. */
function tuned(circuit: Circuit, inLine: number, beside?: number): Circuit {
  const next = withOhms(circuit, resistorOf(circuit, 4700), inLine);
  return beside ? besideCell(next, beside) : next;
}
/** The knob-played oscillator with body contacts where the pot was: the finger, before the capacitor is changed. */
function fingerFirst(): Circuit {
  const circuit = knob();
  return swap(circuit, only(circuit, 'potentiometer'), 'body-contact');
}
/** The finger-played oscillator with a photocell where the contacts were: the light, before its values are changed. */
function cellFirst(): Circuit {
  const circuit = skin();
  return swap(circuit, only(circuit, 'body-contact'), 'ldr');
}
/** The finished build with its volume knob somewhere else than the top. */
const volumeAt = (position: number, circuit = final()) => setting(circuit, only(circuit, 'potentiometer'), { position });
/** The 4.7 kΩ deleted, as the Delete key does it: the wire closes up behind it. */
const noTop = (circuit = final()) => removeFromCircuit(circuit, [resistorOf(circuit, 4700).id]);
/** A second 47 nF from the chip's input to ground. */
function twoCapacitors(circuit = final()): Circuit {
  const chip = only(circuit, 'cd40106');
  const second = capacitor(47e-9, 160, 340, 90), end = ground(160, 440);
  return circuit.addComponent(second).addComponent(end).addConnection(connect(chip, 0, second, 0)).addConnection(connect(second, 1, end, 0));
}
/** The volume pot's wire to ground taken off. */
function noGround(circuit = final()): Circuit {
  const volume = only(circuit, 'potentiometer');
  const wire = circuit.getConnections().find((c) => [c.from, c.to].some((end) => end.componentId === volume.id && end.pinId === volume.pins[0].id))!;
  return circuit.removeConnection(wire.id);
}
/** A volume pot wired into the light-played oscillator by hand: `signal` and `earth` are the legs that go to SOUND and to ground. */
function volumeAdded(signal: number, earth: number | null, position = 0.5): Circuit {
  const circuit = light();
  const sound = only(circuit, 'switch'), jack = only(circuit, 'audio-output');
  const volume = pot('', 10000, position, 760, 210), end = ground(860, 290);
  let next = circuit.removeConnection(wireBetween(circuit, sound, jack)).addComponent(volume).addComponent(end)
    .addConnection(connect(sound, 1, volume, signal)).addConnection(connect(volume, 1, jack, 0));
  if (earth !== null) next = next.addConnection(connect(volume, earth, end, 0));
  return next;
}

describe('class 5, playing it: what it says', () => {
  it('has the parts of a class, each the size a class should be', () => {
    expect(lesson.id).toBe('playing-it');
    expect(lesson.number).toBe(5);
    expect(lesson.unit).toBe('Sound');
    expect(lesson.title).toBe('Playing it');
    expect(lesson.build.length).toBeGreaterThanOrEqual(8);
    expect(lesson.build.length).toBeLessThanOrEqual(14);
    expect(lesson.why.length).toBeGreaterThanOrEqual(4);
    expect(lesson.why.length).toBeLessThanOrEqual(6);
    expect(lesson.tries.length).toBeGreaterThanOrEqual(4);
    expect(lesson.tries.length).toBeLessThanOrEqual(6);
    expect(lesson.keep.length).toBeGreaterThanOrEqual(3);
    expect(lesson.words.length).toBeGreaterThanOrEqual(5);
    expect(lesson.words.length).toBeLessThanOrEqual(10);
    const ids = [...lesson.build, ...lesson.keep].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of lesson.build) expect(s.how).toBeTruthy();
  });

  it('keeps to plain punctuation: no dashes', () => {
    const text = JSON.stringify(lesson, (_key, value) => (typeof value === 'function' ? undefined : value));
    expect(text).not.toMatch(/[—–]/);
    // ...and neither do the results, which are written when an experiment is made
    const results = [
      tryOut('no-top').result(new Work(noTop())), tryOut('beside').result(new Work(tuned(final(), 4700, 100000))),
      tryOut('octave').result(new Work(twoCapacitors())), tryOut('no-ground').result(new Work(noGround())),
      tryOut('quarter').result(new Work(volumeAt(0.25))),
      lesson.check.reading(new Work(final())),
    ];
    for (const result of results) expect(result).not.toMatch(/[—–]/);
  });

  it('introduces its new words: pitch, kilohertz, variable resistor, range, octave, level, volume', () => {
    expect(lesson.words.map((w) => w.word)).toEqual(['Pitch', 'Kilohertz', 'Variable resistor', 'Range', 'Octave', 'Level', 'Volume']);
    const everything = JSON.stringify(lesson, (_key, value) => (typeof value === 'function' ? undefined : value)).toLowerCase();
    for (const word of ['pitch', 'khz', 'variable resistor', 'range', 'level', 'volume']) expect(everything).toContain(word);
    // The octave is met in an experiment
    expect(tryOut('octave').result(new Work(twoCapacitors()))).toContain('octave');
  });

  it('starts from what class 4 kept: the Simple Oscillator, 441 Hz, with a switch named SOUND', () => {
    const circuit = start();
    const example = exampleCircuits.find((e) => e.name === 'Simple Oscillator')!.build();
    expect(circuit.getComponents().map((c) => `${c.type} ${c.parameters.value ?? ''}`)).toEqual(example.components.map((c) => `${c.type} ${c.parameters.value ?? ''}`));
    expect(circuit.getConnections()).toHaveLength(example.connections.length);
    expect(only(circuit, 'switch').label).toBe('SOUND');
    expect(whole(circuit)).toBe('441 Hz');
    expect(step(lesson.build, 'play').text).toContain('441 Hz');
    for (const quoted of ['27 kΩ', '2.2 kΩ', '100 nF', 'SOUND']) expect(lesson.startsFrom).toContain(quoted);
    expect(Number(resistorOf(circuit, 27000).parameters.resistance)).toBe(27000);
    expect(Number(resistorOf(circuit, 2200).parameters.resistance)).toBe(2200);
    expect(Number(only(circuit, 'capacitor').parameters.capacitance)).toBeCloseTo(100e-9, 12);
    // SOUND open: the oscillator runs on, and nothing is heard
    const open = listen(circuit, put(circuit, 'switch', 'closed', 0));
    expect(open.hertz).not.toBeNull();
    expect(open.level).toBeLessThan(0.05);
  });

  it('the app offers each swap the build asks for: resistor to pot, pot to body contacts, body contacts to photocell', () => {
    const offered = (part: Component) => replacementsFor(part, ALL_PARTS).similar.map((item) => item.definition.type);
    expect(offered(resistorOf(start(), 27000))).toContain('potentiometer');
    expect(offered(only(knob(), 'potentiometer'))).toContain('body-contact');
    expect(offered(only(skin(), 'body-contact'))).toContain('ldr');
    // The pot offered for a 27 kΩ is not a 100 kΩ one, which is why the step says to type the value
    const item = replacementsFor(resistorOf(start(), 27000), ALL_PARTS).similar.find((i) => i.definition.type === 'potentiometer')!;
    expect(item.value).not.toBe(100000);
    expect(step(lesson.build, 'knob').how).toContain('type 100k');
  });

  it('a 100 kΩ pot with the 2.2 kΩ plays from 5.03 kHz down to 127 Hz, and turning it up is lower', () => {
    const circuit = withPot(100000);
    expect(written(circuit, turned(circuit, 0))).toBe('5.03 kHz');
    expect(whole(circuit, turned(circuit, 1))).toBe('127 Hz');
    expect(hertz(circuit, turned(circuit, 0.75))!).toBeLessThan(hertz(circuit, turned(circuit, 0.25))!);
    expect(step(lesson.build, 'turn').text).toContain('from 5.03 kHz down to 127 Hz');
    expect(why('A pot on two legs')).toContain('up was lower');
    expect(why('Range')).toContain('5.03 kHz with 2.2 kΩ');
    // The swap put the wires on leg 1 and the middle leg, and left leg 3 bare
    const knobPart = only(circuit, 'potentiometer');
    const wired = circuit.getConnections().flatMap((c) => [c.from, c.to]).filter((end) => end.componentId === knobPart.id).map((end) => end.pinId);
    expect(wired.sort()).toEqual([knobPart.pins[0].id, knobPart.pins[1].id].sort());
  });

  it('on those two legs the pot is a resistor of almost nothing to 100 kΩ', () => {
    const at = (position: number) => ohmsOf('potentiometer', { maxResistance: 100000, value: '100kΩ', position });
    expect(at(0)).toBeLessThan(200);
    expect(at(1) / 1000).toBeCloseTo(100, 0);
    expect(why('A pot on two legs')).toContain('from almost nothing to 100 kΩ');
  });

  it('with 10 kΩ in line the top note is 1.25 kHz and the bottom hardly moves: 118 Hz', () => {
    const circuit = knob();
    expect(Number(only(circuit, 'potentiometer').parameters.maxResistance)).toBe(100000);
    expect(Number(resistorOf(circuit, 10000).parameters.resistance)).toBe(10000);
    expect(written(circuit, turned(circuit, 0))).toBe('1.25 kHz');
    expect(whole(circuit, turned(circuit, 1))).toBe('118 Hz');
    expect(step(lesson.build, 'top').text).toContain('1.25 kHz');
    expect(step(lesson.build, 'top').text).toContain('118 Hz');
    expect(why('Range')).toContain('1.25 kHz with 10 kΩ');
    // The learner's own route ends at the same circuit
    const mine = withPot(100000);
    const route = withOhms(mine, resistorOf(mine, 2200), 10000);
    expect(hertz(route, turned(route, 0))).toBeCloseTo(hertz(circuit, turned(circuit, 0))!, 3);
  });

  it('a finger: silent until touched, then 57 Hz for a press and 216 Hz pressed hard with 100 nF', () => {
    const circuit = fingerFirst();
    expect(hertz(circuit)).toBeNull();
    expect(hertz(circuit, touch(circuit, 0))).toBeNull();
    // A press on the canvas starts at 60%, and goes up to 100%
    expect(definition('body-contact').control).toMatchObject({ kind: 'hold', parameter: 'touch', held: 0.6 });
    expect(whole(circuit, touch(circuit, 0.6))).toBe('57 Hz');
    expect(whole(circuit, touch(circuit, 1))).toBe('216 Hz');
    const text = step(lesson.build, 'touch').text;
    expect(text).toContain('57 Hz for a press');
    expect(text).toContain('216 Hz pressed as hard as it goes');
  });

  it('a tenth of the capacitance makes every note ten times higher: 570 Hz and 2.16 kHz', () => {
    const circuit = skin();
    expect(Number(only(circuit, 'capacitor').parameters.capacitance)).toBeCloseTo(10e-9, 12);
    expect(Math.round(hertz(circuit, touch(circuit, 0.6))! / 10) * 10).toBe(570);
    expect(written(circuit, touch(circuit, 1))).toBe('2.16 kHz');
    const big = withFarads(circuit, 100e-9);
    for (const press of [0.6, 1]) expect(hertz(circuit, touch(circuit, press))! / hertz(big, touch(big, press))!).toBeCloseTo(10, 1);
    const text = step(lesson.build, 'small').text;
    for (const quoted of ['ten times higher', '570 Hz for a press', '2.16 kHz pressed hard']) expect(text).toContain(quoted);
    expect(why('Which range')).toContain('ten times higher');
  });

  it('a finger is about 2 MΩ for a light touch and 50 kΩ pressed hard; a photocell 1 MΩ in the dark and 1 kΩ in bright light', () => {
    expect(ohmsOf('body-contact', { touch: 0.001 }) / 1e6).toBeCloseTo(2, 1);
    expect(ohmsOf('body-contact', { touch: 1 }) / 1e3).toBeCloseTo(50, 0);
    expect(ohmsOf('body-contact', { touch: 0 })).toBeGreaterThan(1e8);
    expect(ohmsOf('ldr', { light: 0 }) / 1e6).toBeCloseTo(1, 2);
    expect(ohmsOf('ldr', { light: 1 }) / 1e3).toBeCloseTo(1, 2);
    expect(why('Which range')).toContain('about 2 MΩ for a light touch and 50 kΩ pressed hard');
    expect(step(lesson.build, 'range').how).toContain('from 1 MΩ in the dark to 1 kΩ in bright light');
  });

  it('light plays it from 27.5 Hz in the dark, through 755 Hz, to 4.62 kHz in bright light', () => {
    const circuit = light();
    expect(Number(resistorOf(circuit, 4700).parameters.resistance)).toBe(4700);
    expect(Number(only(circuit, 'capacitor').parameters.capacitance)).toBeCloseTo(47e-9, 12);
    expect(written(circuit, shade(circuit, 0))).toBe('27.5 Hz');
    expect(whole(circuit, shade(circuit, 0.5))).toBe('755 Hz');
    expect(written(circuit, shade(circuit, 1))).toBe('4.62 kHz');
    const text = step(lesson.build, 'shade').text;
    for (const quoted of ['27.5 Hz in the dark', '755 Hz at half light', '4.62 kHz in bright light']) expect(text).toContain(quoted);
    // The learner's own route: the contacts swapped for a photocell, then the two values
    const swapped = cellFirst();
    const route = withFarads(withOhms(swapped, resistorOf(swapped, 10000), 4700), 47e-9);
    expect(hertz(route, shade(route, 1))).toBeCloseTo(hertz(circuit, shade(circuit, 1))!, 3);
  });

  it('the volume knob takes all of the swing at the top, half of it half way and none at the bottom, and leaves the pitch alone', () => {
    const circuit = final();
    const at = (position: number) => listen(circuit, turned(circuit, position));
    const top = at(1), half = at(0.5), bottom = at(0);
    expect(top.level / top.swing).toBeGreaterThan(0.99);
    expect(half.level / top.level).toBeCloseTo(0.5, 2);
    expect(bottom.level / top.level).toBeLessThan(0.01);
    for (const reading of [half, bottom]) expect(reading.hertz! / top.hertz!).toBeCloseTo(1, 3);
    for (const quoted of ['all of it at the top, half of it half way, none at the bottom', 'leaves the pitch alone']) expect(why('Volume')).toContain(quoted);
    // What is heard follows: 0.58 at full, 0.29 at half, 0.14 at a quarter, nothing at the bottom
    const sizes = [1, 0.5, 0.25, 0].map((position) => loudness(circuit, turned(circuit, position)));
    expect(sizes[0]).toBeGreaterThan(0.55);
    expect(sizes[0]).toBeLessThan(0.6);
    expect(sizes[1] / sizes[0]).toBeCloseTo(0.5, 2);
    expect(sizes[2] / sizes[0]).toBeCloseTo(0.25, 2);
    expect(sizes[3]).toBeLessThan(0.005);
    // As built it is at the top, with leg 3 on the signal: up is louder
    expect(Number(only(circuit, 'potentiometer').parameters.position)).toBe(1);
    expect(Number(only(circuit, 'potentiometer').parameters.maxResistance)).toBe(10000);
  });

  it('the pot costs a little: 755 Hz at half light becomes 734 Hz, and the output\'s high level sags from 8.97 V to 8.73 V', () => {
    const before = listen(light()), after = listen(final());
    expect(before.hertz!.toFixed(0)).toBe('755');
    expect(after.hertz!.toFixed(0)).toBe('734');
    expect(before.high.toFixed(2)).toBe('8.97');
    expect(after.high.toFixed(2)).toBe('8.73');
    for (const quoted of ['755 Hz at half light became 734 Hz', 'from 8.97 V to 8.73 V']) expect(why('Volume')).toContain(quoted);
  });

  it('SOUND still switches it off, with the volume knob in', () => {
    const circuit = final();
    expect(loudness(circuit)).toBeGreaterThan(0.5);
    expect(loudness(circuit, put(circuit, 'switch', 'closed', 0))).toBeLessThan(0.005);
  });
});

describe('class 5, playing it: the experiments', () => {
  it('with nothing in line the bright end runs away to 21.1 kHz from 4.50 kHz, and the dark end stays', () => {
    const built = final(), circuit = noTop(built);
    const bright = (c: Circuit) => listen(c, shade(c, 1), 0.01, 384000).hertz!;
    expect(formatHertz(bright(circuit))).toBe('21.1 kHz');
    expect(formatHertz(bright(built))).toBe('4.50 kHz');
    expect(written(built, shade(built, 1))).toBe('4.50 kHz');
    expect(hertz(circuit, shade(circuit, 0))! / hertz(built, shade(built, 0))!).toBeCloseTo(1, 1);
    const experiment = tryOut('no-top');
    expect(experiment.made(new Work(circuit))).toBe(true);
    const result = experiment.result(new Work(circuit));
    expect(result).toMatch(/^In bright light it now runs at 21\.1 kHz, where it was 4\.50 kHz\./);
    expect(result).toMatch(/In the dark it is still 26\.\d Hz\./);
    expect(experiment.options[experiment.answer]).toBe('The bright end');
    expect(experiment.made(new Work(final()))).toBe(false);
    expect(experiment.made(new Work(light()))).toBe(false);
    // A second photocell lying loose is not one with nothing in line
    expect(experiment.made(new Work(final().addComponent(place('ldr', 360, 560))))).toBe(false);
    // Without the volume knob it is the same experiment
    expect(experiment.made(new Work(noTop(light())))).toBe(true);
  });

  it('a 4.7 kΩ dropped onto the wire from the photocell to the output puts the range back', () => {
    const bare = noTop();
    const wire = bare.getConnections().find((c) => [c.from, c.to].some((end) => end.componentId === only(bare, 'ldr').id)
      && [c.from, c.to].some((end) => end.componentId === only(bare, 'cd40106').id && end.pinId === only(bare, 'cd40106').pins[6].id))!;
    const mended = spliceIntoWire(bare, resistor(4700, 540, 400), wire.id);
    expect(written(mended, shade(mended, 1))).toBe('4.50 kHz');
    expect(tryOut('no-top').made(new Work(mended))).toBe(false);
  });

  it('100 kΩ beside the photocell lifts the dark end from 26.7 Hz to 280 Hz and leaves the bright end at 4.50 kHz', () => {
    const built = final(), circuit = besideCell(built, 100000);
    expect(written(built, shade(built, 0))).toBe('26.7 Hz');
    expect(written(circuit, shade(circuit, 0))).toBe('280 Hz');
    expect(written(circuit, shade(circuit, 1))).toBe('4.50 kHz');
    const experiment = tryOut('beside');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^280 Hz in the dark, where it was 26\.7 Hz\. In bright light it is 4\.50 kHz, where it was 4\.50 kHz: no change/);
    expect(experiment.options[experiment.answer]).toBe('The dark end');
    expect(experiment.made(new Work(final()))).toBe(false);
    // A 100 kΩ lying loose, or put in line where the 4.7 kΩ is, is not beside the photocell
    expect(experiment.made(new Work(final().addComponent(resistor(100000, 360, 500))))).toBe(false);
    expect(experiment.made(new Work(tuned(final(), 100000)))).toBe(false);
    // Read off the learner's own circuit: with other values the "before" is theirs too
    const mine = tuned(final(), 12000), other = besideCell(mine, 100000);
    expect(written(mine, shade(mine, 1))).toBe('2.02 kHz');
    expect(experiment.result(new Work(other))).toContain(`where it was ${written(mine, shade(mine, 0))}. In bright light it is 2.03 kHz, where it was 2.02 kHz`);
  });

  it('a second 47 nF beside the first halves the note: 734 Hz becomes 367 Hz, an octave down', () => {
    const one = final(), circuit = twoCapacitors(one);
    expect(whole(one)).toBe('734 Hz');
    expect(whole(circuit)).toBe('367 Hz');
    expect(hertz(one)! / hertz(circuit)!).toBeCloseTo(2, 2);
    const experiment = tryOut('octave');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^367 Hz at half light, where one capacitor gave 734 Hz: half\./);
    expect(experiment.options[experiment.answer]).toBe('Half as high');
    expect(experiment.made(new Work(final()))).toBe(false);
    // A capacitor lying loose, or wired to ground at both ends, is not beside the first
    expect(experiment.made(new Work(final().addComponent(capacitor(47e-9, 160, 340, 90))))).toBe(false);
    const both = capacitor(47e-9, 160, 340, 90), end = ground(160, 440);
    expect(experiment.made(new Work(final().addComponent(both).addComponent(end)
      .addConnection(connect(both, 0, end, 0)).addConnection(connect(both, 1, end, 0))))).toBe(false);
  });

  it('turned down to a quarter the note is the same and a quarter of the swing reaches the Audio Out', () => {
    const circuit = volumeAt(0.25);
    const now = listen(circuit), full = listen(final());
    expect(now.hertz! / full.hertz!).toBeCloseTo(1, 3);
    expect(now.level / now.swing).toBeCloseTo(0.25, 2);
    const experiment = tryOut('quarter');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^734 Hz, and 734 Hz with the knob at the top: the same note\. The chip's output swings 8\.70 V, and 2\.17 V of it reaches the Audio Out\./);
    expect(experiment.options[experiment.answer]).toBe('Stay the same');
    // Not at the top, where the build leaves it, nor half way, nor at the bottom
    for (const position of [1, 0.5, 0]) expect(experiment.made(new Work(volumeAt(position)))).toBe(false);
    // A pot wired backwards is at a quarter when it is three quarters of the way up
    expect(experiment.made(new Work(volumeAdded(0, 2, 0.75)))).toBe(true);
    // Before there is a volume knob there is nothing to turn down
    expect(experiment.made(new Work(light()))).toBe(false);
    expect(experiment.made(new Work(knob()))).toBe(false);
  });

  it('with no wire to ground the pot does almost nothing: the Audio Out is 1 MΩ', () => {
    const circuit = noGround();
    for (const position of [0, 0.5, 1]) {
      const reading = listen(circuit, turned(circuit, position));
      expect(reading.level / reading.swing).toBeGreaterThan(0.98);
    }
    // 1 MΩ in line with it halves a steady 9 V: the Audio Out is 1 MΩ to ground
    const supply = place('power', 200, 300), supplyGround = ground(200, 400);
    const inLine = resistor(1e6, 340, 200), jack = place('audio-output', 480, 300);
    const divider = circuitOf({
      components: [supply, supplyGround, inLine, jack],
      connections: [connect(supply, 1, supplyGround, 0), connect(supply, 0, inLine, 0), connect(inLine, 1, jack, 0)],
    });
    expect(new Work(divider).bench({ watch: [[jack, 0]] }).volts(jack.id, jack.pins[0].id).mean).toBeCloseTo(4.5, 2);

    const experiment = tryOut('no-ground');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^8\.90 V of the output's 8\.94 V gets through with the knob half way: nearly all of it\./);
    expect(experiment.result(new Work(circuit))).toContain('The Audio Out is 1 MΩ to ground');
    expect(experiment.options[experiment.answer]).toBe('Make almost no difference');
    expect(experiment.made(new Work(final()))).toBe(false);
    expect(experiment.made(new Work(light()))).toBe(false);
    // A pot lying loose beside the working volume knob, or beside no volume knob at all, is not it
    expect(experiment.made(new Work(light().addComponent(place('potentiometer', 760, 400))))).toBe(false);
    // The pitch pot of the first part of the build is not a volume knob without its ground
    expect(experiment.made(new Work(knob()))).toBe(false);
  });

  it('every experiment asks a question with a right answer among its options, and none is made before it is made', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThanOrEqual(2);
      expect(experiment.options.length).toBeLessThanOrEqual(4);
      expect(experiment.options[experiment.answer]).toBeDefined();
      for (const circuit of [empty(), start(), final()]) expect(experiment.made(new Work(circuit))).toBe(false);
    }
  });
});

describe('class 5, playing it: the check', () => {
  it('reads the oscillator as built, and is not passed by it: too low in the dark, too high in the light', () => {
    for (const circuit of [final(), light()]) expect(lesson.check.passed(new Work(circuit))).toBe(false);
    expect(lesson.check.reading(new Work(final()))).toBe('Your oscillator: 26.7 Hz to 4.50 kHz between dark and bright');
    expect(lesson.check.reading(new Work(light()))).toBe('Your oscillator: 27.5 Hz to 4.62 kHz between dark and bright');
    for (const quoted of ['80 Hz', '2.5 kHz']) expect(lesson.check.goal).toContain(quoted);
  });

  it('is passed with the values the hint works out: 12 kΩ in line and 390 kΩ beside the photocell', () => {
    const circuit = tuned(final(), 12000, 390000);
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    expect(lesson.check.reading(new Work(circuit))).toBe('Your oscillator: 91.7 Hz to 2.02 kHz between dark and bright');
    // Everywhere between dark and bright, not only at the two ends
    const notes = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1].map((value) => hertz(circuit, shade(circuit, value))!);
    for (const value of notes) {
      expect(value).toBeGreaterThanOrEqual(80);
      expect(value).toBeLessThanOrEqual(2500);
    }
    expect([...notes].sort((a, b) => a - b)).toEqual(notes);
    // The hint's own arithmetic
    const hint = lesson.check.hint;
    expect(hint).toMatch(/^Calculated, not measured/);
    expect((1.3 / (2500 * 47e-9) / 1000).toFixed(0)).toBe('11');
    expect((1.3 / (80 * 47e-9) / 1000).toFixed(0)).toBe('346');
    expect((1 / (1 / 1e6 + 1 / 390e3) / 1000).toFixed(0)).toBe('281');
    for (const quoted of ['1.3 ÷ (R × C)', '47 nF', 'at least 11 kΩ', 'try 12 kΩ', 'at most 346 kΩ', '390 kΩ beside 1 MΩ acts as 281 kΩ']) expect(hint).toContain(quoted);
    // It does not matter where the volume knob stands, whether SOUND is open, or whether there is a volume knob at all
    expect(lesson.check.passed(new Work(volumeAt(0, circuit)))).toBe(true);
    expect(lesson.check.passed(new Work(setting(circuit, only(circuit, 'switch'), { closed: 0 })))).toBe(true);
    expect(lesson.check.passed(new Work(tuned(light(), 12000, 390000)))).toBe(true);
  });

  it('is not passed with only one end of the range put right', () => {
    const top = tuned(final(), 12000);
    expect(lesson.check.passed(new Work(top))).toBe(false);
    expect(lesson.check.reading(new Work(top))).toMatch(/^Your oscillator: 26\.\d Hz to 2\.02 kHz/);
    const bottom = tuned(final(), 4700, 390000);
    expect(lesson.check.passed(new Work(bottom))).toBe(false);
    expect(lesson.check.reading(new Work(bottom))).toMatch(/^Your oscillator: 9\d\.\d Hz to 4\.50 kHz/);
  });

  it('is not passed by a range that is right at both ends of some other control: it must be played by light', () => {
    // The knob-played oscillator runs from 118 Hz to 1.25 kHz, inside the range asked for
    expect(lesson.check.passed(new Work(knob()))).toBe(false);
    expect(lesson.check.reading(new Work(knob()))).toBeNull();
    expect(lesson.check.reading(new Work(skin()))).toBeNull();
  });

  it('says so when the oscillator stops, or drops too low to be a note, somewhere on the way', () => {
    // Four 47 nF and no resistor beside: in the dark it ticks a few times a second
    let slow = final();
    for (let i = 0; i < 3; i++) slow = twoCapacitors(slow);
    expect(lesson.check.passed(new Work(slow))).toBe(false);
    expect(lesson.check.reading(new Work(slow))).toMatch(/^Your oscillator: 3\d\.\d Hz to 1\.\d\d kHz between dark and bright, and no note at all in places$/);
  });

  it('has nothing to read on an empty canvas, or before there is a photocell', () => {
    for (const circuit of [empty(), start()]) {
      expect(lesson.check.reading(new Work(circuit))).toBeNull();
      expect(lesson.check.passed(new Work(circuit))).toBe(false);
    }
    // A photocell lying loose plays nothing
    expect(lesson.check.reading(new Work(start().addComponent(place('ldr', 360, 560))))).toBeNull();
  });
});

describe('class 5, playing it: the steps', () => {
  it('none are done on an empty canvas, nor on what the class starts from', () => {
    expect(done(new Work(empty()))).toEqual([]);
    expect(done(new Work(empty(), playing))).toEqual(['play']);
    expect(done(new Work(start()))).toEqual([]);
    expect(done(new Work(start(), playing))).toEqual(['play']);
    for (const circuit of [empty(), start()]) expect(lesson.keep.filter((s) => s.done(new Work(circuit))).map((s) => s.id)).toEqual([]);
  });

  it('the knob: a 100 kΩ pot in the 27 kΩ\'s place, turned, then 10 kΩ in line', () => {
    // The pot the app offers is not yet the one asked for
    expect(done(new Work(withPot(50000)))).toEqual([]);
    const circuit = withPot(100000);
    expect(done(new Work(circuit))).toEqual(['knob']);
    expect(done(new Work(circuit, playing))).toEqual(['play', 'knob']); // it has not been turned
    const turnedUp = setting(circuit, only(circuit, 'potentiometer'), { position: 0.95 });
    expect(done(new Work(turnedUp))).toEqual(['knob']); // it is not playing
    expect(done(new Work(turnedUp, playing))).toEqual(['play', 'knob', 'turn']);
    expect(done(new Work(withOhms(circuit, resistorOf(circuit, 2200), 10000)))).toEqual(['knob', 'top']);
    expect(done(new Work(knob()))).toEqual(['knob', 'top']);
    // A pot lying on the canvas plays nothing
    expect(done(new Work(start().addComponent(pot('', 100000, 0.5, 360, 520))))).toEqual([]);
    // A pot wired by its two end legs is a fixed resistor: it plays nothing either
    const fixed = start();
    const big = resistorOf(fixed, 27000), small = resistorOf(fixed, 2200), chip = only(fixed, 'cd40106');
    const ends = pot('', 100000, 0.5, 360, 400);
    const byEnds = fixed.removeComponent(big.id).addComponent(ends).addConnection(connect(ends, 0, chip, 0)).addConnection(connect(ends, 2, small, 0));
    expect(done(new Work(byEnds))).toEqual([]);
    // By the middle leg and the other end it is a knob again, the other way up
    const otherWay = fixed.removeComponent(big.id).addComponent(ends).addConnection(connect(ends, 1, chip, 0)).addConnection(connect(ends, 2, small, 0));
    expect(done(new Work(otherWay))).toEqual(['knob']);
  });

  it('the finger: body contacts in the pot\'s place, pressed, then 10 nF', () => {
    const circuit = fingerFirst();
    expect(done(new Work(circuit))).toEqual(['knob', 'turn', 'top', 'skin']);
    expect(step(lesson.build, 'touch').done(new Work(circuit, playing))).toBe(false); // nobody is pressing
    const pressed = setting(circuit, only(circuit, 'body-contact'), { touch: 0.6 });
    expect(step(lesson.build, 'touch').done(new Work(pressed))).toBe(false); // it is not playing
    expect(step(lesson.build, 'touch').done(new Work(pressed, playing))).toBe(true);
    expect(step(lesson.build, 'small').done(new Work(circuit))).toBe(false);
    expect(step(lesson.build, 'small').done(new Work(withFarads(circuit, 10e-9)))).toBe(true);
    expect(done(new Work(skin()))).toEqual(['knob', 'turn', 'top', 'skin', 'small']);
    // Body contacts lying on the canvas play nothing
    expect(done(new Work(knob().addComponent(place('body-contact', 360, 520))))).toEqual(['knob', 'top']);
  });

  it('the light: a photocell in the contacts\' place, 47 nF and 4.7 kΩ, and the dial moved', () => {
    const circuit = cellFirst();
    const before = ['knob', 'turn', 'top', 'skin', 'touch', 'small'];
    expect(done(new Work(circuit))).toEqual([...before, 'cell']);
    // One of the two values is not both
    expect(done(new Work(withFarads(circuit, 47e-9)))).toEqual([...before, 'cell']);
    expect(done(new Work(withOhms(circuit, resistorOf(circuit, 10000), 4700)))).toEqual([...before, 'cell']);
    const both = withFarads(withOhms(circuit, resistorOf(circuit, 10000), 4700), 47e-9);
    expect(done(new Work(both))).toEqual([...before, 'cell', 'range']);
    expect(done(new Work(light()))).toEqual([...before, 'cell', 'range']);
    expect(step(lesson.build, 'shade').done(new Work(both, playing))).toBe(false); // the dial is where it started
    const shaded = setting(both, only(both, 'ldr'), { light: 0.1 });
    expect(step(lesson.build, 'shade').done(new Work(shaded))).toBe(false); // it is not playing
    expect(step(lesson.build, 'shade').done(new Work(shaded, playing))).toBe(true);
    // A photocell lying on the canvas plays nothing
    expect(step(lesson.build, 'cell').done(new Work(skin().addComponent(place('ldr', 360, 520))))).toBe(false);
  });

  it('the volume knob: a pot from SOUND to ground with the Audio Out on its middle leg, either way round, and turned', () => {
    const before = done(new Work(light()));
    expect(before).not.toContain('volume');
    const circuit = volumeAdded(2, 0);
    expect(done(new Work(circuit))).toEqual([...before, 'volume']);
    expect(done(new Work(volumeAdded(0, 2)))).toEqual([...before, 'volume']);
    // Without its ground it is no divider, and lying loose it is nothing
    expect(done(new Work(volumeAdded(2, null)))).toEqual(before);
    expect(done(new Work(light().addComponent(pot('', 10000, 0.5, 760, 400))))).toEqual(before);
    expect(step(lesson.build, 'loud').done(new Work(circuit, playing))).toBe(false); // it is still half way
    const up = setting(circuit, only(circuit, 'potentiometer'), { position: 1 });
    expect(step(lesson.build, 'loud').done(new Work(up))).toBe(false); // it is not playing
    expect(step(lesson.build, 'loud').done(new Work(up, playing))).toBe(true);
    // The class's own circuit, where the build ends: everything but the steps that need it playing
    expect(done(new Work(final()))).toEqual(BUILD.filter((id) => !['play', 'shade', 'loud'].includes(id)));
    const built = final();
    expect(done(new Work(setting(built, only(built, "ldr"), { light: 0.9 }), playing))).toEqual(BUILD);
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['top', 'small', 'shade']);
    const kinds = (circuit: Circuit) => ['potentiometer', 'body-contact', 'ldr'].map((type) => all(circuit, type).length);
    expect(kinds(start())).toEqual([0, 0, 0]);
    expect(kinds(classStage(lesson, []))).toEqual([1, 0, 0]);
    expect(kinds(classStage(lesson, upTo('turn')))).toEqual([1, 0, 0]);
    expect(kinds(classStage(lesson, upTo('top')))).toEqual([0, 1, 0]);
    expect(kinds(classStage(lesson, upTo('touch')))).toEqual([0, 1, 0]);
    expect(kinds(classStage(lesson, upTo('small')))).toEqual([0, 0, 1]);
    expect(kinds(classStage(lesson, upTo('range')))).toEqual([0, 0, 1]);
    expect(kinds(classStage(lesson, upTo('shade')))).toEqual([1, 0, 1]);
    expect(kinds(classStage(lesson, BUILD))).toEqual([1, 0, 1]);
    // Each is the start with parts swapped where they stood: nothing is left hanging
    for (const circuit of [knob(), skin(), light(), final(), kept()]) {
      expect(all(circuit, 'cd40106')).toHaveLength(1);
      expect(only(circuit, 'switch').label).toBe('SOUND');
      const wiredTo = new Set(circuit.getConnections().flatMap((c) => [c.from.componentId, c.to.componentId]));
      for (const part of circuit.getComponents()) expect(wiredTo.has(part.id)).toBe(true);
    }
  });

  it('keeping it: the photocell named PITCH, the pot named VOLUME, a look at the cover, and a save', () => {
    const circuit = tuned(final(), 12000, 390000);
    expect(lesson.keep.map((s) => s.id)).toEqual(['name', 'name-volume', 'cover', 'save']);
    expect(lesson.keep.filter((s) => s.done(new Work(circuit))).map((s) => s.id)).toEqual([]);
    const pitch = circuit.updateComponent(only(circuit, 'ldr').id, { label: 'pitch' });
    expect(lesson.keep.filter((s) => s.done(new Work(pitch))).map((s) => s.id)).toEqual(['name']);
    const both = pitch.updateComponent(only(pitch, 'potentiometer').id, { label: 'Volume' });
    expect(lesson.keep.filter((s) => s.done(new Work(both))).map((s) => s.id)).toEqual(['name', 'name-volume']);
    // The names go on those parts, not on any part
    expect(step(lesson.keep, 'name').done(new Work(circuit.updateComponent(only(circuit, 'potentiometer').id, { label: 'PITCH' })))).toBe(false);
    expect(step(lesson.keep, 'name-volume').done(new Work(circuit.updateComponent(only(circuit, 'ldr').id, { label: 'VOLUME' })))).toBe(false);
    expect(step(lesson.keep, 'cover').done(new Work(both, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'cover').done(new Work(both, playing))).toBe(false);
    expect(step(lesson.keep, 'save').done(new Work(both, { ...playing, saved: true }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(empty(), { ...playing, saved: true }))).toBe(false);
  });

  it('what it keeps passes the check, and each of its three named controls does what its name says', () => {
    const circuit = kept();
    expect(lesson.keep.filter((s) => s.done(new Work(circuit))).map((s) => s.id)).toEqual(['name', 'name-volume']);
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    expect(lesson.check.reading(new Work(circuit))).toBe('Your oscillator: 91.7 Hz to 2.02 kHz between dark and bright');
    expect(Number(resistorOf(circuit, 12000).parameters.resistance)).toBe(12000);
    expect(Number(resistorOf(circuit, 390000).parameters.resistance)).toBe(390000);
    expect(circuit.getComponents().filter((c) => c.label).map((c) => `${c.type} ${c.label}`).sort()).toEqual(['ldr PITCH', 'potentiometer VOLUME', 'switch SOUND']);
    // PITCH: more light, a higher note
    const notes = [0, 0.5, 1].map((value) => hertz(circuit, shade(circuit, value))!);
    expect(notes[0]).toBeLessThan(notes[1]);
    expect(notes[1]).toBeLessThan(notes[2]);
    // VOLUME: up is louder, and the note does not move
    const sizes = [0, 0.5, 1].map((position) => loudness(circuit, turned(circuit, position)));
    expect(sizes[0]).toBeLessThan(0.005);
    expect(sizes[1] / sizes[2]).toBeCloseTo(0.5, 2);
    expect(sizes[2]).toBeGreaterThan(0.5);
    expect(hertz(circuit, turned(circuit, 0.2))! / hertz(circuit, turned(circuit, 1))!).toBeCloseTo(1, 3);
    // SOUND: open is silence
    expect(Number(only(circuit, 'switch').parameters.closed)).toBe(1);
    expect(loudness(circuit, put(circuit, 'switch', 'closed', 0))).toBeLessThan(0.005);
    // Nothing in it is driven harder than a real part would stand
    const run = new Work(circuit).run();
    for (const part of circuit.getComponents()) expect(run.strain(part.id)).toBeLessThan(1);
  });
});
