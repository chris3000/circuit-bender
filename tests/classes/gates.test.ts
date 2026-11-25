/**
 * Class 7 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { gates as lesson, gatesKept } from '@/classes/gates';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { CD4093 } from '@/classes/kit';
import { capacitor, connect, exampleCircuits, ground, place, resistor } from '@/examples/circuits';
import { removeFromCircuit, replacePart } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import { formatHertz } from '@/utils/readings';
import type { Component, Connection } from '@/types/circuit';
import type { Built, Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

const mA = (amps: number) => amps * 1000;
const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const make = (built: Built, name = 'mine'): Circuit => {
  let circuit = new Circuit(name);
  for (const component of built.components) circuit = circuit.addComponent(component);
  for (const connection of built.connections) circuit = circuit.addConnection(connection);
  return circuit;
};
const add = (circuit: Circuit, parts: Component[], wires: Connection[] = []): Circuit => {
  for (const part of parts) circuit = circuit.addComponent(part);
  for (const wire of wires) circuit = circuit.addConnection(wire);
  return circuit;
};
const set = (circuit: Circuit, part: Component, parameters: Component['parameters']) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, ...parameters } });
const ohms = (circuit: Circuit, part: Component, value: number) =>
  set(circuit, part, { resistance: value, value: formatValue(value, 'resistance') });
const farads = (circuit: Circuit, part: Component, value: number) =>
  set(circuit, part, { capacitance: value, value: formatValue(value, 'capacitance') });
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);
const kept = (work: Work) => lesson.keep.filter((s) => s.done(work)).map((s) => s.id);
const EMPTY = () => new Circuit('empty');

/** The two circuits of the build, and the one that is kept. */
const keyed = () => classStage(lesson, []);
const beeper = () => classCircuit(lesson);
const keptCircuit = () => make(gatesKept(), 'kept');

const chipOf = (circuit: Circuit) => only(circuit, 'cd4093');
/** The resistor with a value, of which the class's circuits have one each, the two 100 kΩ aside. */
const valued = (circuit: Circuit, value: number) => {
  const found = all(circuit, 'resistor').filter((r) => Number(r.parameters.resistance) === value);
  if (found.length !== 1) throw new Error(`${found.length} resistors of ${value} Ω`);
  return found[0];
};
/** The pull-down: the resistor from 1A to ground. */
const pullDown = (circuit: Circuit): Component => {
  const work = new Work(circuit), chip = chipOf(circuit);
  return all(circuit, 'resistor').find((r) => work.joined(r, 0, chip, CD4093.A[0]) && work.grounded(r, 1))!;
};
/** The wires on one pin of a part. */
const wiresAt = (circuit: Circuit, part: Component, pin: number) => circuit.getConnections().filter((c) =>
  [c.from, c.to].some((end) => end.componentId === part.id && end.pinId === part.pins[pin].id));
const hold = (circuit: Circuit, value = 1) => all(circuit, 'pushbutton').map((b) => ({ componentId: b.id, parameter: 'closed', value }));
const press = (circuit: Circuit) => all(circuit, 'pushbutton').reduce((c, b) => set(c, b, { closed: 1 }), circuit);

/** The beeper with gate 2's resistor changed. */
const paced = (value: number, circuit = beeper()) => ohms(circuit, valued(circuit, 470e3), value);
/** The pull-down taken away as the Delete key takes it. */
const noPullDown = (circuit: Circuit) => removeFromCircuit(circuit, [pullDown(circuit).id]);
/** 2A taken off + and, if asked, wired to a ground. */
function gateTwoOff(circuit: Circuit, grounded: boolean): Circuit {
  const chip = chipOf(circuit);
  let changed = circuit;
  for (const wire of wiresAt(circuit, chip, CD4093.A[1])) changed = changed.removeConnection(wire.id);
  if (!grounded) return changed;
  const earth = ground(340, 520);
  return add(changed, [earth], [connect(chip, CD4093.A[1], earth, 0)]);
}
/** A third oscillator on gate 3 (470 kΩ, 10 µF), its output on 2A if asked. */
function withThird(circuit: Circuit, wired: boolean): Circuit {
  const chip = chipOf(circuit), supply = only(circuit, 'power');
  const feedback = resistor(470e3, 480, 800), timing = capacitor(10e-6, 100, 560, 90), earth = ground(100, 640);
  const built = add(wired ? gateTwoOff(circuit, false) : circuit, [feedback, timing, earth], [
    connect(supply, 0, chip, CD4093.A[2]),
    connect(chip, CD4093.Y[2], feedback, 1), connect(feedback, 0, chip, CD4093.B[2]),
    connect(timing, 0, chip, CD4093.B[2]), connect(timing, 1, earth, 0),
  ]);
  return wired ? built.addConnection(connect(chip, CD4093.Y[2], chip, CD4093.A[1])) : built;
}
const theremin = () => make(exampleCircuits.find((e) => e.name === 'Light Theremin')!.build(), 'Light Theremin');
/** The PLAY button swapped for a switch, as double-clicking it and picking Switch does. */
const swapped = (circuit: Circuit) => replacePart(circuit, only(circuit, 'pushbutton').id, ALL_PARTS.find((d) => d.type === 'switch')!).circuit;
/** The pull-down's ground end moved to +. */
function pulledUp(circuit: Circuit): Circuit {
  const down = pullDown(circuit);
  const toGround = wiresAt(circuit, down, 1)[0];
  return circuit.removeConnection(toGround.id).addConnection(connect(only(circuit, 'power'), 0, down, 1));
}

/** A circuit run at the full rate with PLAY held, an output of the chip and the Audio Out recorded. */
function benched(circuit: Circuit, seconds: number, held = 1) {
  const chip = chipOf(circuit), jack = only(circuit, 'audio-output');
  const run = new Work(circuit).bench({
    seconds, set: [...hold(circuit, held), ...all(circuit, 'switch').map((s) => ({ componentId: s.id, parameter: 'closed', value: 1 }))],
    watch: [[chip, CD4093.A[0]], [chip, CD4093.B[0]], [chip, CD4093.Y[0]], [chip, CD4093.Y[1]], [chip, CD4093.Y[2]], [jack, 0]],
  });
  const pin = (index: number) => run.volts(chip.id, chip.pins[index].id);
  return { run, pin, jack: run.trace(jack.id, jack.pins[0].id)! };
}

/** The stretches of a recorded square wave that sound, in seconds: a gap of several cycles ends one. */
function stretches(trace: Float32Array, sampleRate: number): Array<{ from: number; to: number }> {
  const rises: number[] = [];
  for (let i = 1; i < trace.length; i++) if (trace[i - 1] <= 4.5 && trace[i] > 4.5) rises.push(i / sampleRate);
  const found: Array<{ from: number; to: number }> = [];
  for (const at of rises) {
    const last = found[found.length - 1];
    if (last && at - last.to < 0.01) last.to = at; else found.push({ from: at, to: at });
  }
  return found;
}

const text = () => JSON.stringify(lesson, (_key, value) => (typeof value === 'function' ? undefined : value));

describe('class 7, gates: what it says', () => {
  it('is class 7, starts from an empty canvas, and has the parts of a class', () => {
    expect(lesson.id).toBe('gates');
    expect(lesson.number).toBe(7);
    expect(lesson.unit).toBe('Logic and rhythm');
    expect(classStart(lesson).getComponents()).toHaveLength(0);
    for (const list of [lesson.build, lesson.why, lesson.tries, lesson.keep, lesson.words]) expect(list.length).toBeGreaterThan(0);
    const ids = [...lesson.build, ...lesson.keep].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(lesson.tries.map((t) => t.id)).size).toBe(lesson.tries.length);
  });

  it('keeps to plain punctuation: no dashes, in what it says or in what its experiments answer', () => {
    expect(text()).not.toMatch(/[—–]/);
    const answers = [
      tryOut('floating').result(new Work(noPullDown(beeper()))),
      tryOut('slower').result(new Work(paced(1e6))),
      tryOut('faster').result(new Work(paced(10e3))),
      tryOut('stuck').result(new Work(gateTwoOff(beeper(), true))),
      tryOut('third').result(new Work(withThird(beeper(), true))),
      tryOut('theremin').result(new Work(theremin())),
    ];
    for (const answer of answers) {
      expect(answer.length).toBeGreaterThan(50);
      expect(answer).not.toMatch(/[—–]|undefined|null|NaN/);
    }
  });

  it('a NAND gate\'s output is low only when both of its inputs are high', () => {
    const out = (a: boolean, b: boolean) => {
      const supply = place('power', 100, 200), earth = ground(100, 300), chip = place('cd4093', 480, 320), load = resistor(100e3, 600, 300, 90);
      const circuit = add(new Circuit('gate'), [supply, earth, chip, load], [
        connect(supply, 1, earth, 0), connect(supply, 0, chip, CD4093.VDD), connect(chip, CD4093.VSS, earth, 0),
        connect(a ? supply : earth, 0, chip, CD4093.A[0]), connect(b ? supply : earth, 0, chip, CD4093.B[0]),
        connect(chip, CD4093.Y[0], load, 0), connect(load, 1, earth, 0),
      ]);
      return new Work(circuit).bench({ watch: [[chip, CD4093.Y[0]]] }).volts(chip.id, chip.pins[CD4093.Y[0]].id).mean;
    };
    expect(out(true, true)).toBeLessThan(0.1);
    for (const [a, b] of [[false, false], [true, false], [false, true]]) expect(out(a, b)).toBeGreaterThan(8.9);
    expect(lesson.why[0].text).toContain('low only when both of its inputs are high');
  });

  it('held, the key plays 1.30 kHz, which is about 1.3 ÷ (R × C); let go, there is silence and the capacitor is full', () => {
    const circuit = keyed();
    const held = benched(circuit, 0.5);
    expect(formatHertz(held.run.sound.hertz!)).toBe('1.30 kHz');
    expect(held.run.sound.hertz! / (1.3 / (100e3 * 10e-9))).toBeCloseTo(1, 2);
    expect(1.3 / (100e3 * 10e-9)).toBeCloseTo(1300, 6);
    const released = benched(circuit, 0.05, 0);
    expect(released.run.sound.hertz).toBeNull();
    expect(released.run.sound.max - released.run.sound.min).toBeLessThan(1e-6);
    // The output is stuck high and the capacitor on 1B has filled
    expect(released.pin(CD4093.Y[0]).min).toBeGreaterThan(8.9);
    expect(released.pin(CD4093.B[0]).mean).toBeGreaterThan(8.9);
    const why = lesson.why.find((p) => p.title === 'An inverter, if you let it')!.text;
    for (const quoted of ['1.3 ÷ (R × C) = 1,300 Hz', 'the app reads 1.30 kHz', 'stuck high', 'there is silence']) expect(why).toContain(quoted);
  });

  it('the note starts when the button is pressed and stops when it is let go', () => {
    const circuit = keyed();
    const button = only(circuit, 'pushbutton'), jack = only(circuit, 'audio-output');
    const run = new Work(circuit).bench({
      seconds: 0.3, watch: [[jack, 0]],
      events: [{ at: 0.1, componentId: button.id, parameter: 'closed', value: 1 }, { at: 0.2, componentId: button.id, parameter: 'closed', value: 0 }],
    });
    const sounding = stretches(run.trace(jack.id, jack.pins[0].id)!, run.sampleRate);
    expect(sounding).toHaveLength(1);
    expect(sounding[0].from).toBeGreaterThan(0.1);
    expect(sounding[0].from).toBeLessThan(0.103);
    expect(sounding[0].to).toBeGreaterThan(0.198);
    expect(sounding[0].to).toBeLessThan(0.201);
  });

  it('the pull-down holds 1A at 0 V while PLAY is open, and passes 0.09 mA while it is held', () => {
    const circuit = keyed();
    const down = pullDown(circuit);
    const held = benched(circuit, 0.02), released = benched(circuit, 0.02, 0);
    expect(released.pin(CD4093.A[0]).mean).toBeCloseTo(0, 2);
    expect(held.pin(CD4093.A[0]).mean).toBeCloseTo(9, 2);
    expect(mA(held.run.amps(down.id)).toFixed(2)).toBe('0.09');
    expect(mA(9 / 100e3)).toBeCloseTo(0.09, 6);
    expect(lesson.why.find((p) => p.title === 'The pull-down')!.text).toContain('9 V ÷ 100 kΩ = 0.09 mA');
  });

  it('the beeper beeps 2.8 times a second, which is 1.3 ÷ (R × C); the note is the same and sounds half the time', () => {
    const circuit = beeper();
    const held = benched(circuit, 3);
    // Gate 2 itself, at the full rate
    const slow = held.pin(CD4093.Y[1]).hertz!;
    expect(slow.toFixed(1)).toBe('2.8');
    expect((1.3 / (470e3 * 1e-6)).toFixed(1)).toBe('2.8');
    // ...and what is heard: the note in bursts, there half the time
    const sounding = stretches(held.jack, held.run.sampleRate).filter((s) => s.to - s.from > 0.05);
    expect(sounding.length).toBeGreaterThanOrEqual(6);
    const whole = sounding.slice(1, -1);
    for (const burst of whole) expect((burst.to - burst.from) * slow).toBeCloseTo(0.5, 1);
    // As the class listens to it
    expect(lesson.check.reading(new Work(circuit))).toBe('Your beeper: 2.76 beeps a second, of a 1.30 kHz note');
    expect(step(lesson.build, 'beep').text).toContain('2.8 times a second');
    const why = lesson.why.find((p) => p.title === 'One oscillator enables another')!.text;
    for (const quoted of ['1.3 ÷ (470 kΩ × 1 µF) = 2.8 times a second', 'high for half of each round', '2.8 beeps a second']) expect(why).toContain(quoted);
  });

  it('the note on 1Y is there only while 2Y is high, and with PLAY let go there is none', () => {
    const circuit = beeper();
    const chip = chipOf(circuit);
    const held = benched(circuit, 2);
    const fast = held.run.trace(chip.id, chip.pins[CD4093.Y[0]].id)!, slow = held.run.trace(chip.id, chip.pins[CD4093.Y[1]].id)!;
    let edges = 0, whileLow = 0;
    for (let i = 2; i < fast.length; i++) {
      if ((fast[i] > 4.5) === (fast[i - 1] > 4.5)) continue;
      edges++;
      // The edge that ends a burst comes as 2Y falls: that one aside
      if (slow[i] < 4.5 && slow[i - 2] < 4.5) whileLow++;
    }
    expect(edges).toBeGreaterThan(1000);
    expect(whileLow).toBe(0);
    expect(step(lesson.build, 'watch').how).toContain('only while 2Y is high');
    const released = benched(circuit, 1, 0);
    expect(released.run.sound.hertz).toBeNull();
    expect(stretches(released.jack, released.run.sampleRate)).toHaveLength(0);
  });
});

describe('class 7, gates: the experiments', () => {
  it('without the pull-down the beeps never stop: an input wired only to an open button follows the button\'s far side', () => {
    const circuit = noPullDown(beeper());
    // Deleting the resistor does not close a wire from 1A to ground
    expect(new Work(circuit).grounded(chipOf(circuit), CD4093.A[0])).toBe(false);
    const released = benched(circuit, 2, 0);
    expect(released.pin(CD4093.Y[1]).hertz!.toFixed(1)).toBe('2.8');
    expect(stretches(released.jack, released.run.sampleRate).filter((s) => s.to - s.from > 0.05).length).toBeGreaterThanOrEqual(4);
    const experiment = tryOut('floating');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^2\.76 beeps a second, and nobody is holding PLAY\. In the app an open button is not perfectly open/);
    expect(experiment.made(new Work(beeper()))).toBe(false);
    // A second button lying loose is not a key with no pull-down
    expect(experiment.made(new Work(beeper().addComponent(place('pushbutton', 700, 500))))).toBe(false);
  });

  it('the same on the first circuit: 1A sits at 9 V behind the open button and the note never stops; with no wire at all it reads low', () => {
    const circuit = noPullDown(keyed());
    const released = benched(circuit, 0.1, 0);
    expect(released.pin(CD4093.A[0]).mean).toBeGreaterThan(8.9);
    expect(formatHertz(released.run.sound.hertz!)).toBe('1.30 kHz');
    const experiment = tryOut('floating');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^A steady 1\.30 kHz note, and nobody is holding PLAY/);
    expect(experiment.made(new Work(keyed()))).toBe(false);
    // The button gone too: nothing on 1A, which the app reads as low
    const bare = circuit.removeComponent(only(circuit, 'pushbutton').id);
    expect(wiresAt(bare, chipOf(bare), CD4093.A[0])).toHaveLength(0);
    expect(benched(bare, 0.1).run.sound.hertz).toBeNull();
    expect(experiment.made(new Work(bare))).toBe(false);
    expect(experiment.result(new Work(noPullDown(beeper())))).toContain('A pin with no wire on it at all reads low in the app');
  });

  it('1 MΩ gives 1.3 beeps a second', () => {
    const circuit = paced(1e6);
    expect(benched(circuit, 3).pin(CD4093.Y[1]).hertz!.toFixed(1)).toBe('1.3');
    const experiment = tryOut('slower');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^1\.3 beeps a second, down from 2\.8\./);
    expect(experiment.made(new Work(beeper()))).toBe(false);
    // A 1 MΩ lying loose changes nothing, and nor does the value that passes the check
    expect(experiment.made(new Work(beeper().addComponent(resistor(1e6, 700, 500))))).toBe(false);
    expect(experiment.made(new Work(paced(680e3)))).toBe(false);
  });

  it('10 kΩ gives 126 beeps a second: a second note', () => {
    const circuit = paced(10e3);
    expect(benched(circuit, 1).pin(CD4093.Y[1]).hertz!.toFixed(0)).toBe('126');
    const experiment = tryOut('faster');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^126 beeps a second\. Nobody hears that many as beeps/);
    expect(experiment.made(new Work(beeper()))).toBe(false);
    expect(experiment.made(new Work(paced(1e6)))).toBe(false);
  });

  it('with 2A on ground gate 2 stops with its output high, and gate 1 plays one steady note', () => {
    const circuit = gateTwoOff(beeper(), true);
    const held = benched(circuit, 0.5);
    expect(held.pin(CD4093.Y[1]).min).toBeGreaterThan(8.9);
    expect(formatHertz(held.run.sound.hertz!)).toBe('1.30 kHz');
    expect(stretches(held.jack, held.run.sampleRate)).toHaveLength(1);
    const experiment = tryOut('stuck');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^One steady note, 1\.30 kHz\. Gate 2 has stopped/);
    expect(experiment.made(new Work(beeper()))).toBe(false);
    // The wire only taken off sounds the same in the app, but it is not the change asked for
    const off = gateTwoOff(beeper(), false);
    expect(formatHertz(benched(off, 0.5).run.sound.hertz!)).toBe('1.30 kHz');
    expect(experiment.made(new Work(off))).toBe(false);
    // The first circuit plays a steady note too, and has no second gate to hold off
    expect(experiment.made(new Work(keyed()))).toBe(false);
    // Letting go of PLAY is what silences gate 1
    expect(benched(circuit, 0.5, 0).run.sound.hertz).toBeNull();
  });

  it('a third oscillator on 2A: a few beeps, then one long note, every 3.6 seconds', () => {
    const circuit = withThird(beeper(), true);
    const held = new Work(circuit).bench({ seconds: 14, sampleRate: 8000, set: hold(circuit), watch: [[only(circuit, 'audio-output'), 0], [chipOf(circuit), CD4093.Y[2]]] });
    const chip = chipOf(circuit), jack = only(circuit, 'audio-output');
    const sounding = stretches(held.trace(jack.id, jack.pins[0].id)!, 8000).filter((s) => s.to - s.from > 0.05);
    const long = sounding.map((s, i) => ({ ...s, i })).filter((s) => s.to - s.from > 1.5);
    expect(long.length).toBeGreaterThanOrEqual(3);
    // Between one long note and the next: the beeps, each a fraction of a second
    const between = sounding.slice(long[1].i + 1, long[2].i);
    expect(between).toHaveLength(4);
    for (const beep of between) expect(beep.to - beep.from).toBeLessThan(0.3);
    expect((long[2].from - long[1].from).toFixed(1)).toBe('3.6');
    // The long note is there while 3Y is low
    const third = held.trace(chip.id, chip.pins[CD4093.Y[2]].id)!;
    const middle = Math.round(((long[1].from + long[1].to) / 2) * 8000);
    expect(third[middle]).toBeLessThan(0.5);

    const experiment = tryOut('third');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^A few beeps, then one long note, round and round every 3\.6 seconds\./);
    expect(experiment.made(new Work(beeper()))).toBe(false);
    // A third oscillator that works nothing is not it
    expect(experiment.made(new Work(withThird(beeper(), false)))).toBe(false);
    expect(experiment.made(new Work(gateTwoOff(beeper(), true)))).toBe(false);
  });

  it('the Light Theremin: DRONE holds the enable high by itself; with both open it is silent', () => {
    const circuit = theremin();
    const button = only(circuit, 'pushbutton'), toggle = only(circuit, 'switch');
    const sound = (held: number, closed: number) => new Work(circuit).run([
      { componentId: button.id, parameter: 'closed', value: held }, { componentId: toggle.id, parameter: 'closed', value: closed },
    ]).sound.hertz;
    expect(sound(0, 1)).toBeCloseTo(sound(1, 1)!, 3);
    expect(sound(1, 0)).toBeCloseTo(sound(0, 1)!, 3);
    expect(sound(0, 0)).toBeNull();
    // What the question says of it: both go from + to 1A, and a 100 kΩ pulls 1A down
    const work = new Work(circuit), chip = chipOf(circuit), supply = only(circuit, 'power');
    for (const part of [button, toggle]) {
      expect(work.joined(part, 0, supply, 0)).toBe(true);
      expect(work.joined(part, 1, chip, CD4093.A[0])).toBe(true);
    }
    expect(Number(pullDown(circuit).parameters.resistance)).toBe(100e3);
    expect(button.label).toBe('PLAY');
    expect(toggle.label).toBe('DRONE');
    expect(all(circuit, 'ldr')).toHaveLength(1);

    const experiment = tryOut('theremin');
    expect(experiment.made(work)).toBe(true);
    expect(experiment.result(work)).toMatch(/^Nothing changes: with DRONE closed the note carries on at 75\d Hz, because DRONE holds 1A high by itself\. With both open there is silence\./);
    // It is the last experiment, and says what loading an example does to the canvas
    expect(lesson.tries[lesson.tries.length - 1]).toBe(experiment);
    expect(experiment.change).toContain('takes your beeper off the canvas, so save it first');
    for (const other of [beeper(), keyed(), keptCircuit(), EMPTY()]) expect(experiment.made(new Work(other))).toBe(false);
  });

  it('every experiment asks a question with a right answer, and none is made by the build as it stands or by an empty canvas', () => {
    expect(lesson.tries.length).toBeGreaterThanOrEqual(4);
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options.length).toBeLessThanOrEqual(4);
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(EMPTY()))).toBe(false);
      expect(experiment.made(new Work(beeper()))).toBe(false);
      expect(experiment.made(new Work(press(beeper()), playing))).toBe(false);
    }
  });
});

describe('class 7, gates: the check', () => {
  it('reads the beeper as built, and is not passed by it', () => {
    const work = new Work(beeper());
    expect(lesson.check.reading(work)).toBe('Your beeper: 2.76 beeps a second, of a 1.30 kHz note');
    expect(lesson.check.passed(work)).toBe(false);
    // Whether PLAY is held on the canvas or not: the app holds it
    expect(lesson.check.reading(new Work(press(beeper())))).toBe('Your beeper: 2.76 beeps a second, of a 1.30 kHz note');
  });

  it('is passed with the 680 kΩ the hint ends on: 1.9 beeps a second', () => {
    const circuit = paced(680e3);
    expect(benched(circuit, 3).pin(CD4093.Y[1]).hertz!.toFixed(1)).toBe('1.9');
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    expect(lesson.check.reading(new Work(circuit))).toBe('Your beeper: 1.91 beeps a second, of a 1.30 kHz note');
    expect(lesson.check.hint).toContain('680 kΩ');
    expect(lesson.check.hint).toContain('1.3 ÷ (2 × 0.000001 F) = 650,000 Ω');
    expect(1.3 / (2 * 0.000001)).toBeCloseTo(650000, 6);
    expect(lesson.check.hint).toMatch(/^Calculated, not measured/);
  });

  it('is passed another way: 220 kΩ in line with the 470 kΩ, or a bigger capacitor', () => {
    // 470 kΩ + 220 kΩ
    const base = beeper();
    const chip = chipOf(base), feedback = valued(base, 470e3);
    const toOutput = wiresAt(base, feedback, 1)[0];
    const extra = resistor(220e3, 600, 500);
    const inLine = add(base.removeConnection(toOutput.id), [extra], [connect(feedback, 1, extra, 0), connect(extra, 1, chip, CD4093.Y[1])]);
    expect(lesson.check.passed(new Work(inLine))).toBe(true);
    // 1.5 µF with 470 kΩ
    const timing = all(base, 'capacitor').find((c) => Number(c.parameters.capacitance) === 1e-6)!;
    const bigger = farads(base, timing, 1.5e-6);
    expect(lesson.check.reading(new Work(bigger))).toMatch(/^Your beeper: 1\.8\d beeps a second/);
    expect(lesson.check.passed(new Work(bigger))).toBe(true);
    // And as it is kept, with a switch where the button was
    const { components, connections } = gatesKept();
    const keptSlower = ohms(make({ components, connections }), components.find((c) => Number(c.parameters.resistance) === 470e3)!, 680e3);
    expect(lesson.check.passed(new Work(keptSlower))).toBe(true);
  });

  it('is not passed by the wrong pace, or by the right pace of a note that is too low', () => {
    expect(lesson.check.reading(new Work(paced(560e3)))).toBe('Your beeper: 2.31 beeps a second, of a 1.30 kHz note');
    expect(lesson.check.passed(new Work(paced(560e3)))).toBe(false);
    expect(lesson.check.passed(new Work(paced(1e6)))).toBe(false);
    // 22 nF in gate 1: the same pace, a note below 800 Hz
    const circuit = paced(680e3);
    const timing = all(circuit, 'capacitor').find((c) => Number(c.parameters.capacitance) === 10e-9)!;
    const low = farads(circuit, timing, 22e-9);
    expect(lesson.check.reading(new Work(low))).toMatch(/^Your beeper: 1\.91 beeps a second, of a 58\d Hz note$/);
    expect(lesson.check.passed(new Work(low))).toBe(false);
  });

  it('says so when there are no beeps, or nothing at all', () => {
    expect(lesson.check.reading(new Work(keyed()))).toBe('Your circuit: a steady 1.30 kHz note, with no beeps to count');
    expect(lesson.check.passed(new Work(keyed()))).toBe(false);
    // The chip and the Audio Out with no oscillator yet
    const { components, connections } = lesson.stages![0].circuit();
    const bare = make({ components: components.slice(0, 4).concat(components[7]), connections: connections.slice(0, 3).concat(connections[7]) });
    expect(lesson.check.reading(new Work(bare))).toBe('Your circuit: silence');
    expect(lesson.check.passed(new Work(bare))).toBe(false);
    expect(lesson.check.reading(new Work(EMPTY()))).toBeNull();
    expect(lesson.check.passed(new Work(EMPTY()))).toBe(false);
  });
});

describe('class 7, gates: the steps', () => {
  it('none are done on an empty canvas', () => {
    expect(done(new Work(EMPTY(), playing))).toEqual(['play']);
    expect(done(new Work(EMPTY()))).toEqual([]);
    expect(kept(new Work(EMPTY(), { ...playing, saved: true, view: 'cover' }))).toEqual(['cover']);
    expect(kept(new Work(EMPTY()))).toEqual([]);
  });

  it('each step of the key is done as its part or wire arrives', () => {
    const { components, connections } = lesson.stages![0].circuit();
    const [supply, supplyGround, chip, chipGround, feedback, timing, timingGround, output, play, down, downGround] = components;
    const [toGround, toVdd, toVss, fromOutput, toInput, capToInput, capToGround, toJack, toButton, buttonToEnable, downToEnable, downToGround] = connections;
    let circuit = new Circuit('mine');
    const now = () => done(new Work(circuit));
    circuit = add(circuit, [supply, supplyGround]);
    expect(now()).toEqual([]);
    circuit = circuit.addConnection(toGround);
    expect(now()).toEqual(['supply']);
    // A chip is nothing until both its power pins are wired
    circuit = add(circuit, [chip, chipGround], [toVdd]);
    expect(now()).toEqual(['supply']);
    circuit = circuit.addConnection(toVss);
    expect(now()).toEqual(['supply', 'chip']);
    // The resistor without the capacitor is not an oscillator
    circuit = add(circuit, [feedback, timing, timingGround], [fromOutput, toInput]);
    expect(now()).toEqual(['supply', 'chip']);
    circuit = add(circuit, [], [capToInput, capToGround]);
    expect(now()).toEqual(['supply', 'chip', 'oscillator']);
    // An Audio Out lying loose is not on 1Y
    circuit = circuit.addComponent(output);
    expect(now()).toEqual(['supply', 'chip', 'oscillator']);
    circuit = circuit.addConnection(toJack);
    expect(now()).toEqual(['supply', 'chip', 'oscillator', 'out']);
    // A button lying loose, even one named PLAY, is not a key; nor is one wired at one side only
    circuit = circuit.addComponent(play);
    expect(now()).toEqual(['supply', 'chip', 'oscillator', 'out']);
    circuit = circuit.addConnection(buttonToEnable);
    expect(now()).toEqual(['supply', 'chip', 'oscillator', 'out', 'key-name']);
    circuit = circuit.addConnection(toButton);
    expect(now()).toEqual(['supply', 'chip', 'oscillator', 'out', 'key', 'key-name']);
    // The pull-down has to reach ground to be one
    circuit = add(circuit, [down, downGround], [downToEnable]);
    expect(now()).toEqual(['supply', 'chip', 'oscillator', 'out', 'key', 'key-name']);
    circuit = circuit.addConnection(downToGround);
    expect(now()).toEqual(['supply', 'chip', 'oscillator', 'out', 'key', 'down', 'key-name']);
    // The name is asked for
    const unnamed = circuit.updateComponent(play.id, { label: '' });
    expect(done(new Work(unnamed))).toEqual(['supply', 'chip', 'oscillator', 'out', 'key', 'down']);
    expect(step(lesson.build, 'key-name').done(new Work(circuit.updateComponent(play.id, { label: 'play' })))).toBe(true);
  });

  it('the first circuit is done up to the press, which wants it playing and the button held', () => {
    const circuit = keyed();
    expect(done(new Work(circuit))).toEqual(['supply', 'chip', 'oscillator', 'out', 'key', 'down', 'key-name']);
    expect(step(lesson.build, 'press').done(new Work(circuit, playing))).toBe(false);  // not held
    expect(step(lesson.build, 'press').done(new Work(press(circuit)))).toBe(false);     // not playing
    expect(step(lesson.build, 'press').done(new Work(press(circuit), playing))).toBe(true);
    // Held, but the chip has no power: no note, no tick
    const dead = circuit.removeConnection(wiresAt(circuit, chipOf(circuit), CD4093.VDD)[0].id);
    expect(step(lesson.build, 'press').done(new Work(press(dead), playing))).toBe(false);
  });

  it('an oscillator built on the other input counts: the two inputs are alike', () => {
    // The resistor and capacitor on 1A, the button and its pull-down on 1B
    const supply = place('power', 100, 200), earth = ground(100, 300), chip = place('cd4093', 480, 320);
    const feedback = resistor(100e3, 480, 520), timing = capacitor(10e-9, 240, 560, 90), output = place('audio-output', 680, 290);
    const button = place('pushbutton', 260, 190, { label: 'PLAY' }), down = resistor(100e3, 360, 330, 90);
    const circuit = add(new Circuit('mine'), [supply, earth, chip, feedback, timing, output, button, down], [
      connect(supply, 1, earth, 0), connect(supply, 0, chip, CD4093.VDD), connect(chip, CD4093.VSS, earth, 0),
      connect(chip, CD4093.Y[0], feedback, 0), connect(feedback, 1, chip, CD4093.A[0]),
      connect(timing, 1, chip, CD4093.A[0]), connect(timing, 0, earth, 0), connect(chip, CD4093.Y[0], output, 0),
      connect(button, 1, supply, 0), connect(button, 0, chip, CD4093.B[0]), connect(down, 1, chip, CD4093.B[0]), connect(down, 0, earth, 0),
    ]);
    expect(done(new Work(circuit))).toEqual(['supply', 'chip', 'oscillator', 'out', 'key', 'down', 'key-name']);
    expect(step(lesson.build, 'press').done(new Work(press(circuit), playing))).toBe(true);
  });

  it('the slow oscillator is done when it goes round, and moving the button\'s wire makes the beeper', () => {
    // Gate 2's parts, taken from the finished build and put on the first circuit
    const first = keyed();
    const chip = chipOf(first), supply = only(first, 'power');
    const feedback = resistor(470e3, 480, 620), timing = capacitor(1e-6, 400, 560, 90), earth = ground(400, 640);
    const oscillator = [connect(chip, CD4093.Y[1], feedback, 1), connect(feedback, 0, chip, CD4093.B[1]), connect(timing, 0, chip, CD4093.B[1]), connect(timing, 1, earth, 0)];
    // Without 2A on + gate 2 does not run
    const idle = add(first, [feedback, timing, earth], oscillator);
    expect(step(lesson.build, 'slow').done(new Work(idle))).toBe(false);
    const slow = idle.addConnection(connect(supply, 0, chip, CD4093.A[1]));
    expect(step(lesson.build, 'slow').done(new Work(slow))).toBe(true);
    expect(step(lesson.build, 'slow').done(new Work(first))).toBe(false);
    // Nothing listens to it yet: the key still plays one steady note
    expect(step(lesson.build, 'gate').done(new Work(slow))).toBe(false);
    expect(lesson.check.reading(new Work(slow))).toBe('Your circuit: a steady 1.30 kHz note, with no beeps to count');

    const button = only(slow, 'pushbutton');
    const fromSupply = wiresAt(slow, button, 0)[0];
    const moved = slow.removeConnection(fromSupply.id).addConnection(connect(button, 0, chip, CD4093.Y[1]));
    expect(done(new Work(moved))).toEqual(['supply', 'chip', 'oscillator', 'out', 'key', 'down', 'key-name', 'slow', 'gate']);
    expect(step(lesson.build, 'beep').done(new Work(moved, playing))).toBe(false);          // not held
    expect(step(lesson.build, 'beep').done(new Work(press(moved)))).toBe(false);             // not playing
    expect(step(lesson.build, 'beep').done(new Work(press(moved), playing))).toBe(true);
    // The wire taken off + and not yet put on 2Y: no beeper
    expect(step(lesson.build, 'gate').done(new Work(slow.removeConnection(fromSupply.id)))).toBe(false);
  });

  it('the finished build is done up to the listening, and the probes go on 2Y and 1Y', () => {
    const circuit = beeper();
    expect(done(new Work(circuit))).toEqual(['supply', 'chip', 'oscillator', 'out', 'key', 'down', 'key-name', 'slow', 'gate']);
    const chip = chipOf(circuit);
    const probe = (pin: number) => ({ componentId: chip.id, pinId: chip.pins[pin].id });
    const both = { ...playing, probes: [probe(CD4093.Y[1]), probe(CD4093.Y[0])] };
    expect(step(lesson.build, 'watch').done(new Work(circuit, both))).toBe(true);
    expect(step(lesson.build, 'watch').done(new Work(circuit, { ...both, playing: false }))).toBe(false);
    expect(step(lesson.build, 'watch').done(new Work(circuit, { ...playing, probes: [probe(CD4093.Y[0])] }))).toBe(false);
    expect(step(lesson.build, 'watch').done(new Work(circuit, { ...playing, probes: [probe(CD4093.Y[1]), probe(CD4093.B[0])] }))).toBe(false);
    // A probe anywhere on the same wire will do: the Audio Out is on 1Y's
    const jack = only(circuit, 'audio-output');
    const onJack = { ...playing, probes: [probe(CD4093.Y[1]), { componentId: jack.id, pinId: jack.pins[0].id }] };
    expect(step(lesson.build, 'watch').done(new Work(circuit, onJack))).toBe(true);
    // Held and playing with the probes on, every step of the build is done
    expect(done(new Work(press(circuit), both))).toEqual(lesson.build.map((s) => s.id));
  });

  it('a beeper with no button at all, 2Y wired straight to 1A, counts as one', () => {
    const base = beeper();
    const chip = chipOf(base);
    const direct = base.removeComponent(only(base, 'pushbutton').id).addConnection(connect(chip, CD4093.Y[1], chip, CD4093.A[0]));
    expect(step(lesson.build, 'gate').done(new Work(direct))).toBe(true);
    expect(step(lesson.build, 'beep').done(new Work(direct, playing))).toBe(true);
    expect(lesson.check.reading(new Work(direct))).toBe('Your beeper: 2.76 beeps a second, of a 1.30 kHz note');
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['press']);
    const first = classStage(lesson, ['supply', 'chip']);
    const work = new Work(first);
    expect(work.joined(only(first, 'pushbutton'), 0, only(first, 'power'), 0)).toBe(true);
    expect(all(first, 'capacitor')).toHaveLength(1);
    const second = classStage(lesson, ['supply', 'chip', 'oscillator', 'out', 'key', 'down', 'key-name', 'play', 'press']);
    expect(new Work(second).joined(only(second, 'pushbutton'), 0, chipOf(second), CD4093.Y[1])).toBe(true);
    expect(all(second, 'capacitor')).toHaveLength(2);
    for (const circuit of [first, second]) expect(only(circuit, 'pushbutton').label).toBe('PLAY');
  });

  it('the circuits are laid out on the grid, with room between the parts', () => {
    for (const built of [lesson.stages![0].circuit(), lesson.circuit(), gatesKept()]) {
      for (const part of built.components) {
        expect(part.position.x % 20).toBe(0);
        expect(part.position.y % 20).toBe(0);
        for (const other of built.components) {
          if (other === part) continue;
          // A ground hangs close under the part it belongs to, as in the examples
          const room = part.type === 'ground' || other.type === 'ground' ? 80 : 100;
          expect(Math.hypot(part.position.x - other.position.x, part.position.y - other.position.y)).toBeGreaterThanOrEqual(room);
        }
      }
    }
  });

  it('keeping it: a switch where the button was, the resistor turned into a pull-up, the name BEEP, the cover, and a save', () => {
    const circuit = beeper();
    expect(kept(new Work(circuit))).toEqual([]);
    // A switch lying loose is not in the beeper
    expect(kept(new Work(circuit.addComponent(place('switch', 700, 500))))).toEqual([]);
    // The swap keeps the wires and the name; the switch arrives open
    const withSwitch = swapped(circuit);
    expect(all(withSwitch, 'pushbutton')).toHaveLength(0);
    expect(only(withSwitch, 'switch').label).toBe('PLAY');
    expect(kept(new Work(withSwitch))).toEqual(['switch']);
    // The pull-up moved first, the button still there: not yet
    expect(kept(new Work(pulledUp(circuit)))).toEqual([]);
    const up = pulledUp(withSwitch);
    expect(kept(new Work(up))).toEqual(['switch', 'pull-up']);
    const named = up.updateComponent(only(up, 'switch').id, { label: 'beep' });
    expect(kept(new Work(named))).toEqual(['switch', 'pull-up', 'name']);
    expect(step(lesson.keep, 'cover').done(new Work(named, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'cover').done(new Work(named, playing))).toBe(false);
    expect(step(lesson.keep, 'save').done(new Work(named, { ...playing, saved: true }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(named, playing))).toBe(false);
    // Saving the beeper before it is finished, or having the Light Theremin loaded, is not keeping it
    expect(step(lesson.keep, 'save').done(new Work(circuit, { ...playing, saved: true }))).toBe(false);
    expect(step(lesson.keep, 'save').done(new Work(theremin(), { ...playing, saved: true }))).toBe(false);
    expect(step(lesson.keep, 'save').done(new Work(EMPTY(), { ...playing, saved: true }))).toBe(false);
  });

  it('what it keeps: BEEP closed is 2.8 beeps a second, BEEP open is one steady note', () => {
    const circuit = keptCircuit();
    const toggle = only(circuit, 'switch'), chip = chipOf(circuit), jack = only(circuit, 'audio-output');
    expect(toggle.label).toBe('BEEP');
    expect(Number(toggle.parameters.closed)).toBe(1);
    expect(all(circuit, 'pushbutton')).toHaveLength(0);
    expect(kept(new Work(circuit))).toEqual(['switch', 'pull-up', 'name']);
    // The switch is in the wire from 2Y to 1A, and 100 kΩ pulls 1A up
    const work = new Work(circuit);
    expect(work.joined(toggle, 0, chip, CD4093.Y[1])).toBe(true);
    expect(work.joined(toggle, 1, chip, CD4093.A[0])).toBe(true);
    const up = all(circuit, 'resistor').find((r) => work.joined(r, 0, only(circuit, 'power'), 0) && work.joined(r, 1, chip, CD4093.A[0]))!;
    expect(Number(up.parameters.resistance)).toBe(100e3);

    // As it stands, with nothing set: closed
    const closed = work.bench({ seconds: 3, watch: [[chip, CD4093.Y[1]], [jack, 0]] });
    expect(closed.volts(chip.id, chip.pins[CD4093.Y[1]].id).hertz!.toFixed(1)).toBe('2.8');
    expect(stretches(closed.trace(jack.id, jack.pins[0].id)!, closed.sampleRate).filter((s) => s.to - s.from > 0.05).length).toBeGreaterThanOrEqual(6);
    // Open
    const open = set(circuit, toggle, { closed: 0 });
    const steady = new Work(open).bench({ seconds: 1, watch: [[jack, 0], [chip, CD4093.A[0]]] });
    expect(formatHertz(steady.sound.hertz!)).toBe('1.30 kHz');
    expect(stretches(steady.trace(jack.id, jack.pins[0].id)!, steady.sampleRate)).toHaveLength(1);
    expect(steady.volts(chip.id, chip.pins[CD4093.A[0]].id).min).toBeGreaterThan(8.9);
    expect(step(lesson.keep, 'pull-up').how).toContain('2.8 beeps a second');
    expect(step(lesson.keep, 'pull-up').how).toContain('one steady note');
    // With neither a pull-up nor a pull-down the switch does nothing in the app: the beeps leak through it open
    const noPull = open.removeComponent(up.id);
    expect(new Work(noPull).bench({ seconds: 2, watch: [[chip, CD4093.A[0]]] }).volts(chip.id, chip.pins[CD4093.A[0]].id).hertz!.toFixed(1)).toBe('2.8');
    expect(kept(new Work(noPull))).toEqual(['name']);
  });

  it('the words are the new ones, and the class uses the names the chip shows', () => {
    expect(lesson.words.map((w) => w.word)).toEqual(['Logic', 'Gate', 'NAND', 'Enable', 'Pull-down', 'Pull-up', 'Floating input']);
    const labels = chipOf(beeper()).pins.map((pin) => pin.label);
    for (const name of ['1A', '1B', '1Y', '2A', '2B', '2Y', '3A', '3B', '3Y', 'VDD', 'VSS']) expect(labels).toContain(name);
    // ...and never the other way of writing them
    expect(text()).not.toMatch(/\b[ABY][1-4]\b/);
  });
});
