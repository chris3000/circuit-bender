/**
 * Class 11 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { smallControlsBig as lesson, smallControlsBigKept } from '@/classes/smallControlsBig';
import { sharingVoltageKept } from '@/classes/sharingVoltage';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { capacitor, connect, ground, place, resistor } from '@/examples/circuits';
import { removeFromCircuit, replacePart, spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import { formatVolts } from '@/utils/readings';
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
const uA = (amps: number) => amps * 1e6;
const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const definition = (type: string) => ALL_PARTS.find((d) => d.type === type)!;
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
const set = (circuit: Circuit, part: Component, parameter: string, value: number) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, [parameter]: value } });

const light = (circuit: Circuit, value: number): Change[] => all(circuit, 'ldr').map((cell) => ({ componentId: cell.id, parameter: 'light', value }));
const touch = (circuit: Circuit, value: number): Change[] => all(circuit, 'body-contact').map((pads) => ({ componentId: pads.id, parameter: 'touch', value }));
const resistorOf = (circuit: Circuit, ohms: number) => all(circuit, 'resistor').find((r) => r.parameters.resistance === ohms)!;

/** The LED of the lamp (the one with the 470 Ω), the transistor under it and the resistor on its base. */
const led = (circuit: Circuit) => only(circuit, 'led');
function lampOf(circuit: Circuit): { q: Component; base: Component } {
  const work = new Work(circuit);
  const q = all(circuit, '2n3904').find((t) => work.joined(t, 1, led(circuit), 1))!;
  const base = all(circuit, 'resistor').find((r) => work.joined(r, 1, q, 0) || work.joined(r, 0, q, 0))!;
  return { q, base };
}
/** A run with the base and the collector of the lamp's transistor read. */
function lampRun(circuit: Circuit, changes: Change[] = []) {
  const { q, base } = lampOf(circuit);
  const run = new Work(circuit).bench({ watch: [[q, 0], [q, 1]], set: changes });
  return {
    led: run.amps(led(circuit).id),
    base: Math.abs(run.amps(base.id)),
    baseVolts: run.volts(q.id, q.pins[0].id).mean,
    collectorVolts: run.volts(q.id, q.pins[1].id).mean,
  };
}

// --- The circuits a learner has on the way ---

/** What the class starts from, and the same with the photocell deleted. */
const start = () => classStart(lesson);
function cleared(): Circuit {
  const circuit = start();
  return removeFromCircuit(circuit, [only(circuit, 'ldr').id]);
}
/** The transistor dropped into the wire from the LED to ground: nothing on its base yet. */
function switched(): Circuit {
  const circuit = cleared();
  const lamp = led(circuit);
  const wire = circuit.getConnections().find((c) => c.from.componentId === lamp.id && c.from.pinId === lamp.pins[1].id)!;
  return spliceIntoWire(circuit, place('2n3904', 600, 360), wire.id);
}
const touchLamp = () => classStage(lesson, []);
const nightLight = () => classCircuit(lesson);

/** The night light made as the build says: the touch lamp's contacts changed for 100 kΩ, then a photocell to ground. */
function fed(): Circuit {
  const circuit = touchLamp();
  return replacePart(circuit, only(circuit, 'body-contact').id, definition('resistor'),
    { resistance: 100000, value: formatValue(100000, 'resistance') }).circuit;
}
function nightLightByHand(): Circuit {
  const circuit = fed();
  const cell = place('ldr', 400, 560, { rotation: 90 });
  const cellGround = ground(400, 660);
  return add(circuit, [cell, cellGround], [connect(resistorOf(circuit, 100000), 1, cell, 0), connect(cell, 1, cellGround, 0)]);
}
/** The photocell and the 100 kΩ changed over, each by a double-click. */
function swapped(lower = 100000): Circuit {
  let circuit = nightLight();
  const cell = only(circuit, 'ldr');
  circuit = replacePart(circuit, resistorOf(circuit, 100000).id, definition('ldr')).circuit;
  return replacePart(circuit, cell.id, definition('resistor'), { resistance: lower, value: formatValue(lower, 'resistance') }).circuit;
}

/** Class 4's oscillator beside whatever is there: 27 kΩ and 2.2 kΩ from 1Y back to 1A, a capacitor from 1A to ground. */
function withOscillator(circuit: Circuit, farads = 100e-9, feedback = [27000, 2200]) {
  const supply = only(circuit, 'power');
  const chip = place('cd40106', 300, 800);
  const first = resistor(feedback[0], 260, 960), second = resistor(feedback[1], 380, 960);
  const timing = capacitor(farads, 140, 840, 90), chipGround = ground(140, 940);
  const next = add(circuit, [chip, first, second, timing, chipGround], [
    connect(supply, 0, chip, 12), connect(chip, 13, chipGround, 0),
    connect(chip, 6, second, 1), connect(second, 0, first, 1), connect(first, 0, chip, 0),
    connect(chip, 0, timing, 0), connect(timing, 1, chipGround, 0),
  ]);
  return { circuit: next, chip, chipGround, supply };
}
/** ...with a speaker straight from 1Y to ground. */
function bareSpeaker() {
  const { circuit, chip, chipGround } = withOscillator(nightLight());
  const speaker = place('speaker', 520, 800);
  return { circuit: add(circuit, [speaker], [connect(chip, 6, speaker, 0), connect(speaker, 1, chipGround, 0)]), chip, speaker };
}
/** ...with a transistor between the chip and the speaker, and `ohms` in line with the speaker (0 for none). */
function drivenSpeaker(ohms = 220) {
  const { circuit, chip, supply } = withOscillator(nightLight());
  const driver = place('2n3904', 640, 800), into = resistor(10000, 500, 800), driverGround = ground(640, 900);
  const speaker = place('speaker', 780, 640), inLine = resistor(ohms || 1, 640, 600, 90);
  const collector = ohms
    ? [connect(speaker, 1, inLine, 0), connect(inLine, 1, driver, 1)]
    : [connect(speaker, 1, driver, 1)];
  const next = add(circuit, [driver, into, driverGround, speaker, ...(ohms ? [inLine] : [])], [
    connect(chip, 6, into, 0), connect(into, 1, driver, 0), connect(driver, 2, driverGround, 0),
    connect(supply, 0, speaker, 0), ...collector,
  ]);
  return { circuit: next, chip, speaker, into, inLine };
}
/** The night light with its divider fed from an oscillator's output in place of +: what the hint describes. */
function blinking(farads = 22e-6, feedback = [27000, 2200], from = nightLight()): Circuit {
  const { circuit, chip, supply } = withOscillator(from, farads, feedback);
  const upper = resistorOf(circuit, 100000);
  const wire = circuit.getConnections().find((c) =>
    [c.from.componentId, c.to.componentId].includes(supply.id) && [c.from.componentId, c.to.componentId].includes(upper.id))!;
  return circuit.removeConnection(wire.id).addConnection(connect(chip, 6, upper, 0));
}
/** A switch beside the lamp's transistor, from its collector to ground. */
function withAlways(circuit: Circuit, closed = 0): Circuit {
  const { q } = lampOf(circuit);
  const hold = place('switch', 740, 420, { rotation: 90, parameters: { closed } });
  const holdGround = ground(740, 520);
  return add(circuit, [hold, holdGround], [connect(q, 1, hold, 0), connect(hold, 1, holdGround, 0)]);
}
const keptCircuit = () => built(smallControlsBigKept());

/** The LED's current over a run of a few seconds: its least, its most and its average, in mA. */
function watched(circuit: Circuit, changes: Change[], seconds = 3) {
  const lamp = led(circuit);
  const run = new Work(circuit).bench({ set: changes, seconds, sampleRate: 8000, watchAmps: [lamp.id] });
  const trace = run.ampsTrace(lamp.id)!;
  return { min: mA(Math.min(...trace)), max: mA(Math.max(...trace)), mean: mA(run.amps(lamp.id)) };
}

describe('class 11, a small current controls a big one: what it says', () => {
  it('is class 11, and starts from the dimmer class 2 keeps', () => {
    expect(lesson.number).toBe(11);
    expect(lesson.id).toBe('small-controls-big');
    expect(lesson.unit).toBe('Bigger sound');
    const circuit = start();
    expect(circuit.getComponents().map((c) => c.type).sort()).toEqual(built(sharingVoltageKept()).getComponents().map((c) => c.type).sort());
    expect(only(circuit, 'ldr').label).toBe('SHADE');
    expect(resistorOf(circuit, 470)).toBeDefined();
    expect(lesson.startsFrom).toContain('SHADE');
  });

  it('without its photocell the dimmer is class 1\'s light: 14.5 mA', () => {
    const circuit = cleared();
    expect(all(circuit, 'ldr')).toHaveLength(0);
    expect(mA(new Work(circuit).run().amps(led(circuit).id)).toFixed(1)).toBe('14.5');
    expect(step(lesson.build, 'clear').how).toContain('14.5 mA');
  });

  it('with a transistor in the way and nothing on its base, the LED is dark', () => {
    const circuit = switched();
    expect(new Work(circuit).run().amps(led(circuit).id)).toBeLessThan(1e-6);
    expect(step(lesson.build, 'play').how).toContain('The LED stays dark');
  });

  it('the lightest touch passes 4.3 µA into the base and 1.8 mA through the LED, over 400 times as much; class 2\'s finger managed 0.14 mA', () => {
    const circuit = touchLamp();
    const lightest = lampRun(circuit, touch(circuit, 0.01));
    expect(uA(lightest.base).toFixed(1)).toBe('4.3');
    expect(mA(lightest.led).toFixed(1)).toBe('1.8');
    expect(lightest.led / lightest.base).toBeGreaterThan(400);
    expect(lightest.led / lightest.base).toBeLessThan(450);
    // Untouched it is dark
    expect(lampRun(circuit, touch(circuit, 0)).led).toBeLessThan(1e-5);
    // Class 2's dimmer with body contacts where its photocell was, pressed hard
    const dimmer = built(sharingVoltageKept());
    const finger = replacePart(dimmer, only(dimmer, 'ldr').id, definition('body-contact')).circuit;
    expect(mA(new Work(finger).run(touch(finger, 1)).amps(led(finger).id)).toFixed(2)).toBe('0.14');
    for (const quoted of ['4.3 µA', '1.8 mA', 'over 400 times', '0.14 mA']) expect(why('Gain')).toContain(quoted);
  });

  it('pressed hard the base gets 138 µA, the LED stops at 14.2 mA and 0.16 V is left across the transistor', () => {
    const circuit = touchLamp();
    const hard = lampRun(circuit, touch(circuit, 1));
    expect(uA(hard.base).toFixed(0)).toBe('138');
    expect(mA(hard.led).toFixed(1)).toBe('14.2');
    expect(hard.collectorVolts.toFixed(2)).toBe('0.16');
    expect((400 * mA(hard.base)).toFixed(0)).toBe('55');
    // Far less than the gain would allow: the load sets the current, not the transistor
    expect(hard.led / hard.base).toBeLessThan(150);
    for (const quoted of ['138 µA', '55 mA', '14.2 mA', '0.16 V']) expect(why('Fully on')).toContain(quoted);
  });

  it('nothing goes into the base below about 0.6 V, and it holds at 0.74 V with the LED fully lit', () => {
    const circuit = nightLight();
    // The light at which the LED can just be seen, a tenth of a milliamp, found by halving
    let dim = 0.6, out = 0.8;
    for (let i = 0; i < 24; i++) {
      const middle = (dim + out) / 2;
      if (lampRun(circuit, light(circuit, middle)).led > 1e-4) dim = middle; else out = middle;
    }
    expect(lampRun(circuit, light(circuit, dim)).baseVolts.toFixed(1)).toBe('0.6');
    // A tenth of a volt lower and there is next to nothing
    expect(lampRun(circuit, light(circuit, 0.75)).baseVolts).toBeLessThan(0.5);
    expect(lampRun(circuit, light(circuit, 0.75)).led).toBeLessThan(1e-6);
    expect(lampRun(circuit, light(circuit, 0)).baseVolts.toFixed(2)).toBe('0.74');
    const pressed = touchLamp();
    expect(lampRun(pressed, touch(pressed, 1)).baseVolts.toFixed(2)).toBe('0.74');
    for (const quoted of ['about 0.6 V', '0.74 V', '10 kΩ']) expect(why('The base is a diode')).toContain(quoted);
  });

  it('the night light: 0.09 V on the base in bright light and the LED off, 74 µA into it in the dark and the LED fully lit', () => {
    const circuit = nightLight();
    const cell = only(circuit, 'ldr');
    const ohms = (value: number) => {
      const run = new Work(circuit).run(light(circuit, value));
      return run.across(cell.id) / run.amps(cell.id);
    };
    expect(ohms(1) / 1e3).toBeCloseTo(1, 2);
    expect(ohms(0) / 1e6).toBeCloseTo(1, 2);
    const bright = lampRun(circuit, light(circuit, 1)), dark = lampRun(circuit, light(circuit, 0));
    expect(bright.baseVolts.toFixed(2)).toBe('0.09');
    expect(bright.led).toBeLessThan(1e-6);
    expect(uA(dark.base).toFixed(0)).toBe('74');
    expect(mA(dark.led).toFixed(1)).toBe('14.2');
    for (const quoted of ['1 kΩ', '0.09 V', '0.6 V', '1 MΩ', '74 µA']) expect(why('The night light')).toContain(quoted);
    // What the meter shows on the wire into B, as the last step of the build says
    expect(formatVolts(bright.baseVolts)).toBe('89.1 mV');
    expect(formatVolts(dark.baseVolts)).toBe('742 mV');
    expect(step(lesson.build, 'read').how).toContain('reads 89.1 mV');
    expect(step(lesson.build, 'read').how).toContain('0.09 V');
    expect(step(lesson.build, 'read').how).toContain('above 742 mV');
  });

  it('has its promise, six paragraphs of why and the new words', () => {
    expect(lesson.promise).toMatch(/fingertip.*dark/);
    expect(lesson.why).toHaveLength(6);
    const words = lesson.words.map((w) => w.word).join(', ');
    for (const word of ['Transistor', 'Base', 'collector', 'emitter', 'Gain', 'Load', 'Speaker']) expect(words).toContain(word);
    expect(lesson.words.length).toBeGreaterThanOrEqual(5);
    expect(lesson.words.length).toBeLessThanOrEqual(10);
  });

  it('keeps to plain punctuation: no dashes', () => {
    const text = JSON.stringify(lesson, (_key, value) => (typeof value === 'function' ? undefined : value));
    expect(text).not.toMatch(/[—–]/);
    for (const experiment of lesson.tries) {
      expect(experiment.question + experiment.change + experiment.options.join('')).not.toMatch(/[—–]/);
    }
  });
});

describe('class 11, a small current controls a big one: the experiments', () => {
  it('dusk: off above three quarters on the dial, fully lit below half, and in between the LED gets the base current times the gain', () => {
    const circuit = nightLight();
    for (const value of [1, 0.9, 0.76]) expect(lampRun(circuit, light(circuit, value)).led).toBeLessThan(1e-6);
    for (const value of [0.5, 0.4, 0.2, 0]) expect(mA(lampRun(circuit, light(circuit, value)).led)).toBeGreaterThan(13.5);
    const between = lampRun(circuit, light(circuit, 0.6));
    expect(mA(between.led)).toBeCloseTo(8.0, 1);
    expect(uA(between.base)).toBeCloseTo(21.5, 1);

    const experiment = tryOut('fade');
    const cell = only(circuit, 'ldr');
    const partly = set(circuit, cell, 'light', 0.6);
    expect(experiment.made(new Work(partly))).toBe(true);
    expect(experiment.result(new Work(partly))).toMatch(/^8\.04 mA in the LED, from 21\.5 µA into the base: 370 times as much\. The LED is off with the dial above three quarters and fully lit below half\./);
    // The dial where the build left it, at the top, or at the bottom: it is not partly on
    expect(experiment.made(new Work(circuit))).toBe(false);
    expect(experiment.made(new Work(set(circuit, cell, 'light', 1)))).toBe(false);
    expect(experiment.made(new Work(set(circuit, cell, 'light', 0)))).toBe(false);
    // Nor is class 2's dimmer, whose LED is partly lit all the time
    expect(experiment.made(new Work(start()))).toBe(false);
    // The night light a learner made by hand reads the same
    const byHand = nightLightByHand();
    expect(experiment.made(new Work(set(byHand, only(byHand, 'ldr'), 'light', 0.6)))).toBe(true);
  });

  it('the other way up: 14.3 mA in bright light, 11.7 mA at a quarter light, and 706 µA in the dark with the base at 655 mV', () => {
    const circuit = swapped();
    expect(mA(lampRun(circuit, light(circuit, 1)).led).toFixed(1)).toBe('14.3');
    expect(mA(lampRun(circuit, light(circuit, 0.25)).led).toFixed(1)).toBe('11.7');
    const dark = lampRun(circuit, light(circuit, 0));
    expect(uA(dark.led).toFixed(0)).toBe('706');
    expect(dark.baseVolts.toFixed(3)).toBe('0.655');

    const experiment = tryOut('swap');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^14\.3 mA in bright light, and still 11\.7 mA at a quarter light\. In the dark it dims to 706 µA but does not go out: .* still leaves the base 655 mV\./);
    expect(experiment.made(new Work(nightLight()))).toBe(false);
    // Half way through the swap, with the resistor the list gives before 100k is typed in, it goes right out in the dark
    expect(experiment.made(new Work(swapped(10000)))).toBe(false);
    // Class 2's dimmer also lights in the light, but never fully
    expect(experiment.made(new Work(start()))).toBe(false);
  });

  it('class 4\'s oscillator, left alone, runs at 441 Hz, its input climbing to 5.3 V', () => {
    const { circuit, chip } = withOscillator(nightLight());
    const run = new Work(circuit).bench({ seconds: 0.1, watch: [[chip, 6], [chip, 0]] });
    expect(run.volts(chip.id, chip.pins[6].id).hertz!.toFixed(0)).toBe('441');
    expect(run.volts(chip.id, chip.pins[0].id).max.toFixed(1)).toBe('5.3');
    expect(tryOut('speaker').result(new Work(bareSpeaker().circuit))).toContain('5.3 V threshold');
    expect(tryOut('driver').result(new Work(drivenSpeaker().circuit))).toContain('the 441 Hz the oscillator makes left alone');
  });

  it('a speaker straight on the chip: silence, the output stuck at 0.25 V by 280 Ω over 8 Ω', () => {
    const { circuit, chip, speaker } = bareSpeaker();
    const run = new Work(circuit).bench({ seconds: 0.2, watch: [[chip, 6]] });
    const output = run.volts(chip.id, chip.pins[6].id);
    expect(output.max.toFixed(2)).toBe('0.25');
    expect(output.max - output.min).toBeLessThan(1e-3);
    expect(output.hertz).toBeNull();
    expect(run.sound.max - run.sound.min).toBeLessThan(1e-6);
    const amps = run.amps(speaker.id);
    expect(mA(amps).toFixed(1)).toBe('31.2');
    expect((run.across(speaker.id) / amps).toFixed(0)).toBe('8');
    expect(((9 - output.max) / amps).toFixed(0)).toBe('280');
    expect((9 * 8 / 288).toFixed(2)).toBe('0.25');

    const experiment = tryOut('speaker');
    expect(experiment.options[experiment.answer]).toBe('Nothing at all');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^Silence\. The output is stuck at 250 mV, and the speaker takes a steady 31\.2 mA\. A speaker is only 8 Ω\..* about 280 Ω .* 9 V × 8 ÷ 288 is 0\.25 V\./);
    // The oscillator without a speaker, a speaker lying loose, and a speaker on a chip that is not an oscillator
    const oscillator = withOscillator(nightLight());
    expect(experiment.made(new Work(oscillator.circuit))).toBe(false);
    expect(experiment.made(new Work(oscillator.circuit.addComponent(place('speaker', 520, 800))))).toBe(false);
    const idle = place('cd40106', 300, 800), idleSpeaker = place('speaker', 520, 800), idleGround = ground(140, 940);
    const night = nightLight();
    const noOscillator = add(night, [idle, idleSpeaker, idleGround], [
      connect(only(night, 'power'), 0, idle, 12), connect(idle, 13, idleGround, 0), connect(idle, 6, idleSpeaker, 0), connect(idleSpeaker, 1, idleGround, 0),
    ]);
    expect(experiment.made(new Work(noOscillator))).toBe(false);
    expect(experiment.made(new Work(nightLight()))).toBe(false);
  });

  it('with a transistor: a note at 430 Hz, 38.7 mA for the speaker and 796 µA from the chip; three times the current without the 220 Ω', () => {
    const { circuit, speaker, into, inLine } = drivenSpeaker();
    const run = new Work(circuit).bench({ seconds: 0.2, watchAmps: [speaker.id, into.id] });
    const most = (id: string) => Math.max(...run.ampsTrace(id)!);
    expect(run.sound.hertz!.toFixed(0)).toBe('430');
    expect(mA(most(speaker.id)).toFixed(1)).toBe('38.7');
    expect(uA(most(into.id)).toFixed(0)).toBe('796');
    expect(most(into.id)).toBeLessThan(1e-3);
    // It can be heard, and the 220 Ω is within what a real one stands
    expect(run.sound.max - run.sound.min).toBeGreaterThan(0.05);
    expect(run.strain(inLine.id)).toBeLessThan(1);
    // The speaker straight in the collector
    const without = drivenSpeaker(0);
    const bare = new Work(without.circuit).bench({ seconds: 0.2, watchAmps: [without.speaker.id] });
    const ratio = Math.max(...bare.ampsTrace(without.speaker.id)!) / most(speaker.id);
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(3.5);

    const experiment = tryOut('driver');
    expect(experiment.options[experiment.answer]).toContain('Under a milliamp');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^A note: 430 Hz\. The speaker gets 38\.7 mA at a time\. The chip supplies only 796 µA, into the base\..* three times the current /);
    expect(experiment.made(new Work(without.circuit))).toBe(true);
    // The speaker still on the chip is silent, and the night light's own transistor drives no speaker
    expect(experiment.made(new Work(bareSpeaker().circuit))).toBe(false);
    expect(experiment.made(new Work(nightLight()))).toBe(false);
    expect(experiment.made(new Work(nightLight().addComponent(place('speaker', 780, 640))))).toBe(false);
    // The night light beside it is none the worse
    expect(mA(lampRun(circuit, light(circuit, 0)).led).toFixed(1)).toBe('14.2');
  });

  it('every experiment asks a question with a right answer among its options, and none is made on an empty canvas', () => {
    expect(lesson.tries.map((t) => t.id)).toEqual(['fade', 'swap', 'speaker', 'driver']);
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options.length).toBeLessThan(5);
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(new Circuit('empty')))).toBe(false);
    }
  });
});

describe('class 11, a small current controls a big one: the check', () => {
  const { check } = lesson;

  it('reads the night light as built, and is not passed by it', () => {
    for (const circuit of [nightLight(), nightLightByHand()]) {
      expect(check.reading(new Work(circuit))).toBe('In the dark: lit all the time. In bright light: off.');
      expect(check.passed(new Work(circuit))).toBe(false);
    }
  });

  it('is passed the way the hint gives: 22 µF in the oscillator, and the 100 kΩ fed from 1Y. It flashes twice a second', () => {
    const circuit = blinking();
    expect(check.reading(new Work(circuit))).toBe('In the dark: flashing 2.0 times a second. In bright light: off.');
    expect(check.passed(new Work(circuit))).toBe(true);
    // The LED really does go fully on and fully off in the dark, and stays off in the light
    const dark = watched(circuit, light(circuit, 0)), bright = watched(circuit, light(circuit, 1));
    expect(dark.max).toBeGreaterThan(14);
    expect(dark.min).toBeLessThan(0.001);
    expect(bright.max).toBeLessThan(0.001);
    for (const quoted of ['Calculated, not measured', '440 Hz', '220 times', '2 Hz', '22 µF', '100 nF', '100 kΩ', '1Y']) expect(check.hint).toContain(quoted);
    expect(440 / 220).toBe(2);
    expect(22e-6 / 100e-9).toBeCloseTo(220, 6);
    // It does not matter where the dial or the lamp's own switches were left
    const cell = only(circuit, 'ldr');
    expect(check.passed(new Work(set(circuit, cell, 'light', 1)))).toBe(true);
    expect(check.passed(new Work(set(circuit, cell, 'light', 0)))).toBe(true);
  });

  it('is passed by other speeds between one and three a second, and by class 4\'s blinker values', () => {
    expect(check.reading(new Work(blinking(33e-6)))).toBe('In the dark: flashing 1.3 times a second. In bright light: off.');
    expect(check.passed(new Work(blinking(33e-6)))).toBe(true);
    const blinker = blinking(10e-6, [100000, 1]);
    expect(check.reading(new Work(blinker))).toMatch(/^In the dark: flashing 1\.3 times a second\./);
    expect(check.passed(new Work(blinker))).toBe(true);
  });

  it('is not passed by one that is too fast or too slow, and says how fast it is', () => {
    const fast = blinking(100e-9);
    expect(check.reading(new Work(fast))).toMatch(/^In the dark: flashing 44[01] times a second\. In bright light: off\.$/);
    expect(check.passed(new Work(fast))).toBe(false);
    expect(check.reading(new Work(blinking(10e-6)))).toMatch(/flashing 4\.4 times a second/);
    expect(check.passed(new Work(blinking(10e-6)))).toBe(false);
    expect(check.reading(new Work(blinking(47e-6)))).toMatch(/flashing 0\.9 times a second/);
    expect(check.passed(new Work(blinking(47e-6)))).toBe(false);
    expect(check.reading(new Work(blinking(470e-6)))).toMatch(/In the dark: (on and off, too slowly to count|lit all the time|off)\./);
    expect(check.passed(new Work(blinking(470e-6)))).toBe(false);
  });

  it('is not passed by a blinker that takes no notice of the light', () => {
    const base = blinking();
    const circuit = base.removeComponent(only(base, 'ldr').id);
    expect(check.reading(new Work(circuit))).toMatch(/^In the dark: flashing 2\.0 times a second\. In bright light: (flashing 2\.\d times a second|on and off)\.$/);
    expect(check.passed(new Work(circuit))).toBe(false);
    // Nor by the day light, blinking: it has the light the wrong way round
    const { circuit: day, chip, supply } = withOscillator(swapped(), 22e-6);
    const cell = only(day, 'ldr');
    const wire = day.getConnections().find((c) =>
      [c.from.componentId, c.to.componentId].includes(supply.id) && [c.from.componentId, c.to.componentId].includes(cell.id))!;
    const wrongWay = day.removeConnection(wire.id).addConnection(connect(chip, 6, cell, 0));
    expect(check.passed(new Work(wrongWay))).toBe(false);
    expect(check.reading(new Work(wrongWay))).toMatch(/In bright light: (flashing 2\.\d times a second|on and off)\.$/);
  });

  it('has nothing to read without an LED, and reads class 2\'s dimmer for what it is', () => {
    expect(check.reading(new Work(new Circuit('empty')))).toBeNull();
    expect(check.passed(new Work(new Circuit('empty')))).toBe(false);
    const loose = new Circuit('loose').addComponent(place('led', 0, 0)).addComponent(place('2n3904', 200, 0)).addComponent(place('ldr', 400, 0));
    expect(check.reading(new Work(loose))).toBe('In the dark: off. In bright light: off.');
    expect(check.passed(new Work(loose))).toBe(false);
    expect(check.reading(new Work(start()))).toBe('In the dark: off. In bright light: lit all the time.');
    expect(check.passed(new Work(start()))).toBe(false);
  });

  it('is read with the switch ALWAYS open, so adding it early does not spoil the check', () => {
    const circuit = withAlways(blinking(), 1);
    expect(check.passed(new Work(circuit))).toBe(true);
    const whole = keptCircuit();
    expect(check.passed(new Work(set(whole, only(whole, 'switch'), 'closed', 1)))).toBe(true);
  });
});

describe('class 11, a small current controls a big one: the steps', () => {
  it('none are done on an empty canvas, or on what the class starts from', () => {
    expect(done(new Work(new Circuit('empty')))).toEqual([]);
    expect(done(new Work(new Circuit('empty'), playing))).toEqual(['play']);
    expect(kept(new Work(new Circuit('empty')))).toEqual([]);
    expect(done(new Work(start()))).toEqual([]);
    // Not even with the dimmer in bright light: 4.7 mA is not an LED straight on its resistor
    const dimmer = start();
    expect(done(new Work(set(dimmer, only(dimmer, 'ldr'), 'light', 1)))).toEqual([]);
    expect(kept(new Work(start()))).toEqual([]);
  });

  it('the photocell goes, the transistor goes into the wire, and the base gets its contacts', () => {
    expect(done(new Work(cleared()))).toEqual(['clear']);
    expect(done(new Work(switched()))).toEqual(['clear', 'transistor']);
    expect(done(new Work(switched(), playing))).toEqual(['clear', 'transistor', 'play']);
    // A transistor lying on the canvas switches nothing, and one put in upside down is not it
    expect(done(new Work(cleared().addComponent(place('2n3904', 400, 400))))).toEqual(['clear']);
    const circuit = cleared();
    const lamp = led(circuit);
    const wire = circuit.getConnections().find((c) => c.from.componentId === lamp.id && c.from.pinId === lamp.pins[1].id)!;
    const upsideDown = spliceIntoWire(circuit, place('2n3904', 600, 360), wire.id, true);
    expect(step(lesson.build, 'transistor').done(new Work(upsideDown))).toBe(false);
    // Contacts and a resistor that are only lying there are not on the base
    const loose = switched().addComponent(place('body-contact', 340, 420)).addComponent(resistor(10000, 480, 420));
    expect(done(new Work(loose))).toEqual(['clear', 'transistor']);
    expect(done(new Work(touchLamp()))).toEqual(['clear', 'transistor', 'contacts']);
  });

  it('the touch lamp counts with the resistor before the contacts, because it works', () => {
    const circuit = switched();
    const q = only(circuit, '2n3904'), supply = only(circuit, 'power');
    const pads = place('body-contact', 480, 420), base = resistor(10000, 340, 420);
    const otherOrder = add(circuit, [pads, base], [connect(supply, 0, base, 0), connect(base, 1, pads, 0), connect(pads, 1, q, 0)]);
    expect(done(new Work(otherOrder))).toEqual(['clear', 'transistor', 'contacts']);
    expect(mA(new Work(otherOrder).run(touch(otherOrder, 1)).amps(led(otherOrder).id)).toFixed(1)).toBe('14.2');
  });

  it('pressing the contacts counts while it plays and they are held', () => {
    const circuit = touchLamp();
    const held = set(circuit, only(circuit, 'body-contact'), 'touch', 0.6);
    expect(step(lesson.build, 'touch').done(new Work(held, playing))).toBe(true);
    expect(step(lesson.build, 'touch').done(new Work(held))).toBe(false);
    expect(step(lesson.build, 'touch').done(new Work(circuit, playing))).toBe(false);
    // Held as the canvas holds them, the LED is well lit
    expect(mA(new Work(held).run().amps(led(held).id))).toBeGreaterThan(10);
  });

  it('the night light: 100 kΩ for the contacts, then the photocell, the dial turned up, and the base read', () => {
    expect(done(new Work(fed()))).toEqual(['clear', 'transistor', 'feed']);
    const lit = fed();
    expect(mA(new Work(lit).run().amps(led(lit).id))).toBeGreaterThan(14);
    for (const circuit of [nightLight(), nightLightByHand()]) {
      expect(done(new Work(circuit))).toEqual(['clear', 'transistor', 'contacts', 'touch', 'feed', 'cell']);
      const cell = only(circuit, 'ldr');
      const bright = set(circuit, cell, 'light', 1);
      expect(step(lesson.build, 'dusk').done(new Work(bright, playing))).toBe(true);
      expect(step(lesson.build, 'dusk').done(new Work(bright))).toBe(false);
      expect(step(lesson.build, 'dusk').done(new Work(circuit, playing))).toBe(false); // the dial is where it was put down: the LED is lit
      const { q, base } = lampOf(circuit);
      const intoBase = circuit.getConnections().find((c) => [c.from.componentId, c.to.componentId].includes(q.id)
        && [c.from.componentId, c.to.componentId].includes(base.id))!;
      const elsewhere = circuit.getConnections().find((c) => [c.from.componentId, c.to.componentId].includes(led(circuit).id))!;
      expect(step(lesson.build, 'read').done(new Work(circuit, { ...playing, wires: [intoBase.id] }))).toBe(true);
      expect(step(lesson.build, 'read').done(new Work(circuit, { ...playing, wires: [elsewhere.id] }))).toBe(false);
      expect(step(lesson.build, 'read').done(new Work(circuit, { ...NOT_PLAYING, wires: [intoBase.id] }))).toBe(false);
    }
    // A photocell wired to nothing is not a night light, and nor is one put above the 100 kΩ
    expect(step(lesson.build, 'cell').done(new Work(fed().addComponent(place('ldr', 400, 560))))).toBe(false);
    expect(step(lesson.build, 'cell').done(new Work(swapped()))).toBe(false);
    // With the 10 kΩ the list gives before 100k is typed in, the LED never goes out: not a night light yet
    const circuit = nightLight();
    const weak = circuit.updateComponent(resistorOf(circuit, 100000).id, { parameters: { resistance: 10000, value: formatValue(10000, 'resistance') } });
    expect(step(lesson.build, 'cell').done(new Work(weak))).toBe(false);
  });

  it('"Stuck?" gives the touch lamp for the first part of the build and the night light after', () => {
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['touch']);
    expect(all(classStage(lesson, []), 'body-contact')).toHaveLength(1);
    expect(all(classStage(lesson, ['clear', 'transistor', 'play', 'contacts']), 'body-contact')).toHaveLength(1);
    const after = classStage(lesson, ['clear', 'transistor', 'play', 'contacts', 'touch']);
    expect(all(after, 'body-contact')).toHaveLength(0);
    expect(all(after, 'ldr')).toHaveLength(1);
    // Every step of a part can be done on the circuit "Stuck?" gives for it
    const lamp = touchLamp();
    const held = set(lamp, only(lamp, 'body-contact'), 'touch', 0.6);
    expect(done(new Work(held, playing))).toEqual(['clear', 'transistor', 'play', 'contacts', 'touch']);
  });

  it('the circuits are laid out on the grid, with room between the parts', () => {
    for (const circuit of [touchLamp(), nightLight(), keptCircuit()]) {
      const parts = circuit.getComponents();
      for (const part of parts) {
        expect(part.position.x % 20).toBe(0);
        expect(part.position.y % 20).toBe(0);
      }
      for (const a of parts) {
        for (const b of parts) {
          if (a !== b) expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeGreaterThanOrEqual(100);
        }
      }
    }
  });
});

const NOT_PLAYING: Situation = { ...playing, playing: false };

describe('class 11, a small current controls a big one: keeping it', () => {
  it('a switch from the collector to ground lights the LED whatever the light, and leaves the night light alone when open', () => {
    for (const base of [blinking(), nightLight()]) {
      const circuit = withAlways(base);
      expect(step(lesson.keep, 'always').done(new Work(circuit))).toBe(true);
      // ...whichever way it was left
      expect(step(lesson.keep, 'always').done(new Work(withAlways(base, 1)))).toBe(true);
      expect(step(lesson.keep, 'always').done(new Work(base))).toBe(false);
      // A switch on the canvas with no wires is not it
      expect(step(lesson.keep, 'always').done(new Work(base.addComponent(place('switch', 740, 420))))).toBe(false);
    }
  });

  it('a switch in the photocell\'s leg is not it: closed, it would leave the light to the photocell', () => {
    const base = nightLight();
    const cell = only(base, 'ldr');
    const wire = base.getConnections().find((c) => c.from.componentId === cell.id && c.from.pinId === cell.pins[1].id)!;
    const circuit = spliceIntoWire(base, place('switch', 400, 580, { rotation: 90 }), wire.id);
    expect(all(circuit, 'switch')).toHaveLength(1);
    expect(step(lesson.keep, 'always').done(new Work(circuit))).toBe(false);
  });

  it('then the name, a look at the cover, and a save', () => {
    const circuit = withAlways(blinking());
    expect(kept(new Work(circuit))).toEqual(['always']);
    const named = circuit.updateComponent(only(circuit, 'switch').id, { label: 'always' });
    expect(kept(new Work(named))).toEqual(['always', 'name']);
    expect(step(lesson.keep, 'cover').done(new Work(named, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(named, { ...playing, saved: true }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(new Circuit('empty'), { ...playing, saved: true }))).toBe(false);
    expect(lesson.keep.map((s) => s.id)).toEqual(['always', 'name', 'cover', 'save']);
  });

  it('what it keeps is the blinking night light with ALWAYS open: every keep step done but the look at the cover and the save', () => {
    const circuit = keptCircuit();
    expect(kept(new Work(circuit))).toEqual(['always', 'name']);
    const hold = only(circuit, 'switch');
    expect(hold.label).toBe('ALWAYS');
    expect(hold.parameters.closed).toBe(0);
    expect(all(circuit, 'speaker')).toHaveLength(0);
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    expect(lesson.check.reading(new Work(circuit))).toBe('In the dark: flashing 2.0 times a second. In bright light: off.');
  });

  it('ALWAYS does what its name says: open, a night light that blinks; closed, lit at 14.5 mA in any light', () => {
    const circuit = keptCircuit();
    const hold = only(circuit, 'switch');
    const state = (closed: number, value: number) => watched(circuit, [{ componentId: hold.id, parameter: 'closed', value: closed }, ...light(circuit, value)]);
    // Open: off in bright light, on and off in the dark
    expect(state(0, 1).max).toBeLessThan(0.001);
    expect(state(0, 0).max).toBeGreaterThan(14);
    expect(state(0, 0).min).toBeLessThan(0.001);
    // Closed: steady, in the light and in the dark
    for (const value of [1, 0]) {
      const held = state(1, value);
      expect(held.min.toFixed(1)).toBe('14.5');
      expect(held.max.toFixed(1)).toBe('14.5');
    }
  });
});
