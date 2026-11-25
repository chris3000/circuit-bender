/**
 * Class 14 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { bending as lesson, bendingKept } from '@/classes/bending';
import { simplestOscillatorKept } from '@/classes/simplestOscillator';
import { playingItKept } from '@/classes/playingIt';
import { moreVoicesKept } from '@/classes/moreVoices';
import { gatesKept } from '@/classes/gates';
import { countingKept } from '@/classes/counting';
import { the555Kept } from '@/classes/the555';
import { stepsKept } from '@/classes/steps';
import { amplifiersKept } from '@/classes/amplifiers';
import { toneKept } from '@/classes/tone';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { connect, exampleCircuits, place, resistor } from '@/examples/circuits';
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
const named = (circuit: Circuit, name: string) => circuit.getComponents().find((c) => c.label === name)!;
const circuitOf = ({ components, connections }: Built) => {
  let circuit = new Circuit('mine');
  for (const c of components) circuit = circuit.addComponent(c);
  for (const c of connections) circuit = circuit.addConnection(c);
  return circuit;
};
const turned = (circuit: Circuit, name: string, parameter: string, value: number) => {
  const part = named(circuit, name);
  return circuit.updateComponent(part.id, { parameters: { ...part.parameters, [parameter]: value } });
};
const pinOf = (part: Component, pin: number) => ({ componentId: part.id, pinId: part.pins[pin].id });
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);
const whyText = (title: string) => lesson.why.find((p) => p.title === title)!.text;

const A1 = 0, Y1 = 6, Y2 = 7, Y3 = 8, VDD = 12;
const oscillator = () => classStart(lesson);
const bent = () => classStage(lesson, ['play']);
const generator = () => classStage(lesson, ['play', 'bend', 'others', 'starve', 'keep-bend']);
const kept = () => circuitOf(bendingKept());

describe('class 14, bending: the oscillator, bent', () => {
  it('starts from the oscillator class 4 keeps, at 441 Hz', () => {
    const start = oscillator();
    expect(start.getComponents().map((c) => c.type)).toEqual(simplestOscillatorKept().components.map((c) => c.type));
    expect(new Work(start).bench({ seconds: 0.5 }).sound.hertz!.toFixed(0)).toBe('441');
    expect(lesson.startsFrom).toContain('441 Hz');
    expect(step(lesson.build, 'play').how).toContain('441 Hz');
  });

  it('a 10 kΩ jumper across the timing resistors lifts 441 Hz to 1.68 kHz, a finger to 466 Hz, and a wire stops it', () => {
    const circuit = oscillator();
    const chip = only(circuit, 'cd40106');
    const withJumper = (ohms: number) => new Work(circuit).bench({ seconds: 0.5, bend: { from: pinOf(chip, A1), to: pinOf(chip, Y1), ohms } }).sound.hertz;
    expect(withJumper(10e3)!.toFixed(0)).toBe('1681');
    expect(withJumper(500e3)!.toFixed(0)).toBe('466');
    expect(withJumper(1)).toBeNull();
    expect(step(lesson.build, 'bend').how).toContain('from 441 Hz to 1.68 kHz');
    expect(step(lesson.build, 'others').how).toContain('rises to 466 Hz');
    expect(step(lesson.build, 'others').how).toContain('it stops the oscillator');
  });

  it('starved half way the chip has 8.28 V and plays 540 Hz; further round it falls and gets quieter', () => {
    const circuit = oscillator();
    const chip = only(circuit, 'cd40106'), supply = only(circuit, 'power');
    const at = (starve: number) => {
      const run = new Work(circuit).bench({ seconds: 0.5, watch: [[chip, VDD]], set: [{ componentId: supply.id, parameter: 'starve', value: starve }] });
      return { volts: run.volts(chip.id, chip.pins[VDD].id).mean, hertz: run.sound.hertz!, swing: run.sound.max - run.sound.min };
    };
    const half = at(0.5), most = at(0.8);
    expect(at(0).volts.toFixed(2)).toBe('9.00');
    expect(half.volts.toFixed(2)).toBe('8.28');
    expect(half.hertz.toFixed(0)).toBe('540');
    expect(most.hertz).toBeLessThan(half.hertz);
    expect(most.swing).toBeLessThan(half.swing);
    for (const quoted of ['8.28 V, not 9 V', 'risen to 540 Hz']) expect(step(lesson.build, 'starve').how).toContain(quoted);
  });

  it('the steps: play, a jumper held, another kind of jumper, STARVE turned, a bend kept', () => {
    const circuit = oscillator();
    const chip = only(circuit, 'cd40106'), supply = only(circuit, 'power');
    expect(done(new Work(circuit))).toEqual([]);
    expect(done(new Work(circuit, playing))).toEqual(['play']);
    const bend = (ohms: number) => ({ from: pinOf(chip, A1), to: pinOf(chip, Y1), ohms });
    expect(done(new Work(circuit, { ...playing, bend: bend(10e3) }))).toEqual(['play', 'bend']);
    expect(done(new Work(circuit, { ...playing, bend: bend(500e3) }))).toEqual(['play', 'bend', 'others']);
    // A jumper held with both ends on one net joins nothing
    const r1 = all(circuit, 'resistor')[0];
    expect(done(new Work(circuit, { ...playing, bend: { from: pinOf(chip, A1), to: pinOf(r1, 0), ohms: 10e3 } }))).toEqual(['play']);
    // ...and nothing is heard of one held while the circuit is stopped
    expect(done(new Work(circuit, { ...playing, playing: false, bend: bend(10e3) }))).toEqual([]);
    const starved = circuit.updateComponent(supply.id, { parameters: { ...supply.parameters, starve: 0.5 } });
    expect(done(new Work(starved))).toEqual(['starve']);
    expect(step(lesson.build, 'starve').done(new Work(circuit.updateComponent(supply.id, { parameters: { ...supply.parameters, starve: 0.2 } })))).toBe(false);
  });

  it('a kept bend is a switch that changes the note: 441 Hz open, 1.68 kHz closed', () => {
    const circuit = bent();
    expect(all(circuit, 'switch')).toHaveLength(2);
    const bend = all(circuit, 'switch').find((s) => s.label !== 'SOUND')!;
    const at = (closed: number) => new Work(circuit).bench({ seconds: 0.5, set: [{ componentId: bend.id, parameter: 'closed', value: closed }] }).sound.hertz!;
    expect(at(0).toFixed(0)).toBe('441');
    expect(at(1).toFixed(0)).toBe('1681');
    expect(step(lesson.build, 'keep-bend').done(new Work(circuit))).toBe(true);
    // The oscillator's own SOUND switch is not a bend, and neither is a switch lying on the canvas
    expect(step(lesson.build, 'keep-bend').done(new Work(oscillator()))).toBe(false);
    expect(step(lesson.build, 'keep-bend').done(new Work(oscillator().addComponent(place('switch', 0, 0))))).toBe(false);
    // A button will do as well, and so will a bend that stops the note
    const plain = oscillator();
    const chip = only(plain, 'cd40106');
    const button = place('pushbutton', 400, 520);
    const stopped = plain.addComponent(button).addConnection(connect(chip, A1, button, 0)).addConnection(connect(button, 1, chip, Y1));
    expect(step(lesson.build, 'keep-bend').done(new Work(stopped))).toBe(true);
  });
});

describe('class 14, bending: the Weird Sound Generator, read', () => {
  /** The generator watched for two seconds, with its controls where `set` puts them. */
  function watch(circuit: Circuit) {
    const chip = only(circuit, 'cd40106'), amp = only(circuit, 'lm741');
    const run = new Work(circuit).bench({ seconds: 2, watch: [[chip, Y1], [chip, Y2], [chip, Y3], [amp, 1]] });
    const hertz = (pin: number) => run.volts(chip.id, chip.pins[pin].id).hertz;
    return { weird: hertz(Y1), wacky: hertz(Y2), zany: hertz(Y3), half: run.volts(amp.id, amp.pins[1].id).mean };
  }
  const wackyFree = () => turned(generator(), 'WACKINESS', 'closed', 0);
  const alone = () => turned(wackyFree(), 'ZANINESS', 'position', 0);

  it('is the example, with nothing in it that the text names missing', () => {
    const circuit = generator();
    const example = exampleCircuits.find((e) => e.name === 'MFOS Weird Sound Generator')!.build();
    expect(circuit.getComponents().map((c) => c.type)).toEqual(example.components.map((c) => c.type));
    for (const name of ['WEIRD', 'WACKY', 'ZANY', 'ZANINESS', 'ODDNESS', 'WACKINESS']) expect(named(circuit, name)).toBeDefined();
    const values = (type: string, key: string) => all(circuit, type).map((c) => c.parameters[key]);
    expect(values('resistor', 'resistance')).toEqual(expect.arrayContaining([1e6, 1000, 100e3]));
    expect(values('capacitor', 'capacitance')).toEqual(expect.arrayContaining([220e-6, 1e-6]));
    expect(all(circuit, '2n3904')).toHaveLength(1);
    expect(all(circuit, '1n914')).toHaveLength(1);
    expect(whyText('Nothing in it is new')).toContain('1 MΩ over 1 kΩ');
    expect(whyText('Nothing in it is new')).toContain('1 µF before the output');
  });

  it('Wacky runs near 90 Hz, Zany at 3.2 Hz, and the op-amp\'s + input sits at 4.50 V', () => {
    const seen = watch(generator());
    expect(seen.wacky!).toBeGreaterThan(85);
    expect(seen.wacky!).toBeLessThan(95);
    expect(seen.zany!.toFixed(1)).toBe('3.2');
    expect(seen.half.toFixed(2)).toBe('4.50');
    expect(step(lesson.build, 'three').how).toContain('near 90 Hz');
    expect(step(lesson.build, 'three').how).toContain('3.2 Hz');
    expect(step(lesson.build, 'half').how).toContain('4.50 V');
    expect(tryOut('sync').question).toContain('near 90 Hz');
  });

  it('the steps: open it, probe the three oscillators, read half supply', () => {
    const circuit = generator();
    const chip = only(circuit, 'cd40106'), amp = only(circuit, 'lm741');
    expect(done(new Work(circuit, playing))).toEqual(['play', 'open']);
    expect(step(lesson.build, 'open').done(new Work(oscillator()))).toBe(false);
    const probes = [Y1, Y2, Y3].map((pin) => pinOf(chip, pin));
    expect(step(lesson.build, 'three').done(new Work(circuit, { ...playing, probes }))).toBe(true);
    expect(step(lesson.build, 'three').done(new Work(circuit, { ...playing, probes: probes.slice(0, 2) }))).toBe(false);
    const bias = circuit.getConnections().find((c) => c.to.componentId === amp.id && c.to.pinId === amp.pins[1].id)!;
    expect(step(lesson.build, 'half').done(new Work(circuit, { ...playing, wires: [bias.id] }))).toBe(true);
    expect(step(lesson.build, 'half').done(new Work(circuit, playing))).toBe(false);
  });

  it('WACKINESS open: Weird jumps between 281 Hz and 1.41 kHz, 3.2 times a second', () => {
    const experiment = tryOut('wackiness');
    expect(experiment.made(new Work(generator()))).toBe(false);
    expect(experiment.made(new Work(wackyFree()))).toBe(true);
    expect(experiment.result(new Work(wackyFree()))).toMatch(/^Weird now jumps between 281 Hz and 1\.41 kHz, 3\.2 times a second\./);
  });

  it('ZANINESS down as well: a steady 282 Hz, and WEIRD turned down lowers it', () => {
    expect(watch(alone()).weird!.toFixed(0)).toBe('282');
    const experiment = tryOut('zaniness');
    expect(experiment.made(new Work(wackyFree()))).toBe(false);
    expect(experiment.made(new Work(alone()))).toBe(true);
    expect(experiment.result(new Work(alone()))).toMatch(/^A steady 282 Hz\./);
    const lower = turned(alone(), 'WEIRD', 'position', 0.25);
    expect(tryOut('weird').made(new Work(alone()))).toBe(false);
    expect(tryOut('weird').made(new Work(lower))).toBe(true);
    expect(tryOut('weird').result(new Work(lower))).toMatch(/^77\.7 Hz, down from 282 Hz\./);
    expect(tryOut('weird').question).toContain('Weird is alone');
    expect(tryOut('sync').question).toContain('alone at 282 Hz');
  });

  it('ODDNESS down: the fundamental is 8.9 times smaller, because the resonance has left the note', () => {
    const duller = turned(alone(), 'ODDNESS', 'position', 0.1);
    const experiment = tryOut('oddness');
    expect(experiment.made(new Work(alone()))).toBe(false);
    expect(experiment.made(new Work(duller))).toBe(true);
    expect(experiment.result(new Work(duller))).toMatch(/^Quieter: the fundamental is 8\.9 times smaller\..*Weird's 282 Hz/);
    expect(experiment.options[experiment.answer]).toBe('Quieter');
  });

  it('WACKINESS closed again: Weird is forced to Wacky\'s 90 Hz', () => {
    const synced = turned(generator(), 'ZANINESS', 'position', 0);
    const seen = watch(synced);
    expect(seen.weird!).toBeCloseTo(seen.wacky!, 0);
    const experiment = tryOut('sync');
    expect(experiment.made(new Work(alone()))).toBe(false);
    expect(experiment.made(new Work(synced))).toBe(true);
    expect(experiment.result(new Work(synced))).toMatch(/^Weird is at 90\.8 Hz, and Wacky at 90\.0 Hz\./);
    expect(experiment.options[experiment.answer]).toBe('Wacky\'s frequency');
  });

  it('no experiment is made on an empty canvas or on the oscillator, and each has its answer among its options', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(new Circuit('empty')))).toBe(false);
      expect(experiment.made(new Work(oscillator()))).toBe(false);
    }
  });
});

describe('class 14, bending: the brief', () => {
  const reading = (circuit: Circuit, situation: Situation = playing) => lesson.check.reading(new Work(circuit, situation));
  const passed = (circuit: Circuit, situation: Situation = playing) => lesson.check.passed(new Work(circuit, situation));

  it('the instrument the class keeps meets it, while it plays without strain', () => {
    expect(reading(kept())).toBe('It meets the brief.');
    expect(passed(kept())).toBe(true);
    expect(passed(kept(), { ...playing, playing: false })).toBe(false);
    expect(passed(kept(), { ...playing, strained: true })).toBe(false);
    expect(reading(kept(), { ...playing, strained: true })).toContain('a lighter load');
  });

  it('every control of that instrument does what its name says', () => {
    const circuit = kept();
    const chip = only(circuit, 'cd40106'), counter = only(circuit, 'cd4040');
    const hear = (set: Array<[string, string, number]>) => {
      const run = new Work(circuit).bench({
        seconds: 1.5, watch: [[chip, Y1], [chip, Y2], [counter, 2]],
        set: set.map(([name, parameter, value]) => ({ componentId: named(circuit, name).id, parameter, value })),
      });
      return {
        lfo: run.volts(chip.id, chip.pins[Y1].id).hertz!, voice: run.volts(chip.id, chip.pins[Y2].id).hertz!,
        sub: run.volts(counter.id, counter.pins[2].id).hertz!, sound: run.sound.hertz!, swing: run.sound.max - run.sound.min,
      };
    };
    // CHOP: closed, the slow oscillator cuts the voice up; open, the voice runs free
    const free = hear([['CHOP', 'closed', 0]]);
    expect(free.voice).toBeGreaterThan(300);
    expect(hear([]).voice).toBeLessThan(free.voice * 0.7);
    // The counter gives the octave below, and SUB puts it in the mix
    expect(free.sub).toBeCloseTo(free.voice / 2, 0);
    expect(free.sound).toBeCloseTo(free.sub, 0);
    expect(hear([['CHOP', 'closed', 0], ['SUB', 'closed', 0]]).sound).toBeGreaterThan(free.sub * 1.5);
    // SHADOW: less light, lower note
    const dark = hear([['CHOP', 'closed', 0], ['SHADOW', 'light', 0.1]]), bright = hear([['CHOP', 'closed', 0], ['SHADOW', 'light', 0.9]]);
    expect(dark.voice).toBeLessThan(50);
    expect(bright.voice).toBeGreaterThan(1000);
    // RATE: how fast the voice is cut up
    expect(hear([['RATE', 'position', 0.9]]).lfo).toBeGreaterThan(hear([['RATE', 'position', 0.1]]).lfo * 4);
    // TONE: the filter lets more or less through
    expect(hear([['CHOP', 'closed', 0], ['TONE', 'position', 1]]).swing).toBeGreaterThan(hear([['CHOP', 'closed', 0], ['TONE', 'position', 0]]).swing * 1.3);
  });

  it('the pattern instrument, before it is named, lacks only its names', () => {
    const bare = classCircuit(lesson);
    expect(reading(bare)).toBe('Still missing: names for 5 controls.');
    expect(passed(bare)).toBe(false);
    const part = only(bare, 'ldr');
    const fourNamed = ['potentiometer', 'switch'].flatMap((type) => all(bare, type)).reduce((c, p, i) => c.updateComponent(p.id, { label: `N${i}` }), bare);
    expect(reading(fourNamed)).toBe('Still missing: a name for the last control.');
    expect(reading(fourNamed.updateComponent(part.id, { label: 'hand' }))).toBe('It meets the brief.');
  });

  it('says what is missing when a part of the brief is taken out', () => {
    const circuit = kept();
    // No light or touch: the photocell swapped for a resistor
    const cell = only(circuit, 'ldr');
    const fixed = resistor(47000, 600, 480);
    const wires = circuit.getConnections().filter((c) => c.from.componentId === cell.id || c.to.componentId === cell.id);
    let noLight = circuit.addComponent(fixed);
    for (const wire of wires) {
      const other = wire.from.componentId === cell.id ? wire.to : wire.from;
      const pin = (wire.from.componentId === cell.id ? wire.from.pinId : wire.to.pinId) === cell.pins[0].id ? 0 : 1;
      noLight = noLight.addConnection({ ...wire, id: `${wire.id}-moved`, from: { componentId: fixed.id, pinId: fixed.pins[pin].id }, to: other });
    }
    noLight = noLight.removeComponent(cell.id);
    expect(reading(noLight)).toBe('Still missing: something played by light or touch.');
    // No control of one oscillator by the other: the diode gone
    expect(reading(circuit.removeComponent(only(circuit, '1n914').id))).toMatch(/^Still missing: one oscillator controlling the other[;.]/);
    // No counter
    expect(reading(circuit.removeComponent(only(circuit, 'cd4040').id))).toContain('a gate or a counter');
    // Neither mixer nor filter: the counter's resistor and the capacitor to ground both gone
    const low = all(circuit, 'resistor').filter((r) => r.parameters.resistance === 100000)[1];
    const cap = all(circuit, 'capacitor').find((c) => c.parameters.capacitance === 10e-9)!;
    expect(reading(circuit.removeComponent(low.id).removeComponent(cap.id))).toContain('a mixer or a filter before the output');
    // ...but either one alone will do
    expect(reading(circuit.removeComponent(cap.id))).toBe('It meets the brief.');
    expect(reading(circuit.removeComponent(low.id))).not.toContain('a mixer or a filter');
    // One oscillator only
    const slow = all(circuit, 'capacitor').find((c) => c.parameters.capacitance === 220e-9)!;
    expect(reading(circuit.removeComponent(slow.id))).toContain('a second oscillator');
    // No sound at all
    expect(reading(circuit.removeComponent(only(circuit, 'audio-output').id))).toMatch(/^Still missing: a sound/);
  });

  it('is not fooled by parts lying on the canvas, and names a control that does nothing', () => {
    const oscillatorOnly = oscillator();
    const littered = [place('ldr', 0, 0), place('cd4040', 0, 200), place('cd40106', 0, 400)].reduce((c, p) => c.addComponent(p), oscillatorOnly);
    // The photocell lying there would be on the cover, so it wants a name; it counts for nothing else
    expect(reading(littered)).toBe(reading(oscillatorOnly)!.replace(/\.$/, '; a name for the last control.'));
    expect(reading(oscillatorOnly)).toBe('Still missing: a second oscillator; something played by light or touch; a gate or a counter; a mixer or a filter before the output.');
    const idle = place('potentiometer', 0, 0, { label: 'magic' });
    expect(reading(kept().addComponent(idle))).toBe('Still missing: MAGIC to change the sound.');
    expect(passed(kept().addComponent(idle))).toBe(false);
  });

  it('two switches side by side both count: each does something while the other is open', () => {
    const circuit = kept();
    const chop = named(circuit, 'CHOP');
    const also = place('switch', 700, 680, { label: 'ALSO', parameters: { closed: 0 } });
    const beside = circuit.addComponent(also)
      .addConnection({ id: 'also-a', from: pinOf(also, 0), to: pinOf(chop, 0) })
      .addConnection({ id: 'also-b', from: pinOf(also, 1), to: pinOf(chop, 1) });
    expect(reading(beside)).toBe('It meets the brief.');
  });

  it('does not depend on where the knobs stand, and reads nothing from an empty canvas', () => {
    const moved = turned(turned(turned(kept(), 'RATE', 'position', 0.02), 'CHOP', 'closed', 0), 'SHADOW', 'light', 0.97);
    expect(reading(moved)).toBe('It meets the brief.');
    expect(reading(new Circuit('empty'))).toBeNull();
    expect(passed(new Circuit('empty'))).toBe(false);
  });

  it('no example meets the brief as it comes, and the Weird Sound Generator lacks light or touch and a counter', () => {
    for (const example of exampleCircuits) expect(passed(circuitOf(example.build()))).toBe(false);
    expect(reading(generator())).toBe('Still missing: something played by light or touch; a gate or a counter.');
  });

  it('reads what the other classes keep for what each is: slow oscillators, counters, mixers and filters are all seen', () => {
    const lacks = (built: Built) => reading(circuitOf(built))!.replace('Still missing: ', '').replace(/\.$/, '').split('; ');
    const light = 'something played by light or touch', counter = 'a gate or a counter', shape = 'a mixer or a filter before the output';
    const second = 'a second oscillator', control = 'one oscillator controlling the other';
    // Class 5: one oscillator played by light. Class 6: three, mixed, none controlling another
    expect(lacks(playingItKept())).toEqual([second, counter, shape]);
    expect(lacks(moreVoicesKept())).toEqual([control, light, counter]);
    // Class 7: a slow gate switching a quick one, 2.8 times a second. Class 8: one oscillator, a counter, a mix
    expect(lacks(gatesKept())).toEqual([light]);
    expect(lacks(countingKept())).toEqual([second, light]);
    // Class 9: a 1.3 Hz oscillator pushing a 555 about. Class 10: a counter whose steps come round under once a second
    expect(lacks(the555Kept())).toEqual([light, counter, shape]);
    expect(lacks(stepsKept())).toEqual([light, shape]);
    // Class 12: the op-amp mixer. Class 13: the op-amp filter, one voice
    expect(lacks(amplifiersKept())).toEqual([control, light, counter]);
    expect(lacks(toneKept())).toEqual([second, light, counter]);
  });

  it('keeping it: the cover with every control named, and a save', () => {
    const cover: Situation = { ...playing, view: 'cover' };
    expect(lesson.keep.filter((s) => s.done(new Work(kept(), cover))).map((s) => s.id)).toEqual(['cover']);
    expect(lesson.keep.filter((s) => s.done(new Work(kept(), { ...playing, saved: true }))).map((s) => s.id)).toEqual(['save']);
    expect(lesson.keep.filter((s) => s.done(new Work(classCircuit(lesson), { ...cover, saved: true })))).toEqual([]);
    expect(lesson.keep.filter((s) => s.done(new Work(new Circuit('empty'), { ...cover, saved: true })))).toEqual([]);
  });

  it('"Stuck?" gives the bent oscillator, then the generator; the pattern instrument is what is left', () => {
    expect(all(classStage(lesson, []), 'switch')).toHaveLength(2);
    expect(all(generator(), 'lm741')).toHaveLength(1);
    expect(all(classStage(lesson, lesson.build.map((s) => s.id)), 'cd4040')).toHaveLength(1);
  });
});
