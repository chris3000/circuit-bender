/**
 * Class 4 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { simplestOscillator as lesson, simplestOscillatorKept } from '@/classes/simplestOscillator';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { capacitor, connect, exampleCircuits, place, resistor } from '@/examples/circuits';
import { dutyCycle, measureSignal } from '@/simulation/measure/signal';
import { removeFromCircuit, spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import type { Component } from '@/types/circuit';
import type { Built, Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

const A1 = 0, A2 = 1, Y1 = 6, Y2 = 7;
const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const circuitOf = ({ components, connections }: Built) => {
  let circuit = new Circuit('mine');
  for (const c of components) circuit = circuit.addComponent(c);
  for (const c of connections) circuit = circuit.addConnection(c);
  return circuit;
};
const resistorOf = (circuit: Circuit, value: number) => all(circuit, 'resistor').find((r) => r.parameters.resistance === value)!;
const withResistor = (circuit: Circuit, from: number, to: number) => {
  const part = resistorOf(circuit, from);
  return circuit.updateComponent(part.id, { parameters: { ...part.parameters, resistance: to, value: formatValue(to, 'resistance') } });
};
const withCapacitor = (circuit: Circuit, to: number) => {
  const part = only(circuit, 'capacitor');
  return circuit.updateComponent(part.id, { parameters: { ...part.parameters, capacitance: to, value: formatValue(to, 'capacitance') } });
};
const wireBetween = (circuit: Circuit, a: Component, pinA: number, b: Component, pinB: number) => {
  const ends = [`${a.id}::${a.pins[pinA].id}`, `${b.id}::${b.pins[pinB].id}`];
  return circuit.getConnections().find((c) => ends.includes(`${c.from.componentId}::${c.from.pinId}`) && ends.includes(`${c.to.componentId}::${c.to.pinId}`))!;
};
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);
const whyText = (title: string) => lesson.why.find((p) => p.title === title)!.text;

/** The three circuits of the build. */
const blinker = () => classStage(lesson, []);
const buffered = () => classStage(lesson, ['chip', 'feedback', 'timing', 'lamp', 'play', 'blink', 'probes']);
const tone = () => classCircuit(lesson);

/** A circuit watched: the oscillator's input and output, the LED and the sound. */
function watch(circuit: Circuit, seconds: number, sampleRate: number) {
  const chip = only(circuit, 'cd40106'), led = only(circuit, 'led');
  const run = new Work(circuit).bench({ seconds, sampleRate, watch: [[chip, A1], [chip, Y1], [chip, Y2]], watchAmps: [led.id] });
  const input = run.trace(chip.id, chip.pins[A1].id)!, output = run.trace(chip.id, chip.pins[Y1].id)!, lamp = run.ampsTrace(led.id)!;
  // Once it is going: the first cycle starts from an empty capacitor
  const settled = input.slice(Math.floor(input.length / 2));
  return {
    hertz: measureSignal(output, sampleRate).hertz!,
    low: Math.min(...settled), high: Math.max(...settled),
    top: Math.max(...output), bottom: Math.min(...output.slice(Math.floor(output.length / 2))),
    outputHigh: dutyCycle(output)!,
    blink: measureSignal(lamp, sampleRate, 1e-4).hertz, lit: dutyCycle(lamp, 1e-4),
    sound: run.sound,
  };
}
const slow = (circuit: Circuit) => watch(circuit, 8, 8000);
const quick = (circuit: Circuit) => watch(circuit, 0.5, 48000);

/** The LED's resistor moved back from 2Y to 1Y. */
function unbuffered(circuit: Circuit): Circuit {
  const chip = only(circuit, 'cd40106'), limit = resistorOf(circuit, 1000);
  return circuit.removeConnection(wireBetween(circuit, chip, Y2, limit, 0).id).addConnection(connect(chip, Y1, limit, 0));
}
/** 27 kΩ and 2.2 kΩ in a line where the one resistor was. */
function inLine(circuit: Circuit, first = 27000, second = 2200): Circuit {
  const chip = only(circuit, 'cd40106');
  const bare = removeFromCircuit(circuit, [resistorOf(circuit, 100000).id]);
  const a = resistor(first, 400, 440), b = resistor(second, 520, 440);
  return bare.addComponent(a).addComponent(b)
    .addConnection(connect(chip, A1, a, 0)).addConnection(connect(a, 1, b, 0)).addConnection(connect(b, 1, chip, Y1));
}
const noFeedback = (circuit: Circuit) => removeFromCircuit(circuit, [resistorOf(circuit, 100000).id]);
/** A switch dropped into the wire to the Audio Out. */
function withSwitch(circuit: Circuit, name?: string, closed = 1): Circuit {
  const chip = only(circuit, 'cd40106'), out = only(circuit, 'audio-output');
  const toggle = place('switch', 640, 480, { ...(name ? { label: name } : {}), parameters: { closed } });
  return spliceIntoWire(circuit, toggle, wireBetween(circuit, chip, Y2, out, 0).id);
}

describe('class 4, the simplest oscillator: what it says', () => {
  it('starts from an empty canvas', () => {
    expect(classStart(lesson).getComponents()).toHaveLength(0);
    expect(lesson.number).toBe(4);
  });

  it('the blinker blinks about once a second: 1.03 Hz, lit 60% of the time, its output reaching only 7.48 V', () => {
    const seen = slow(blinker());
    expect(seen.hertz.toFixed(2)).toBe('1.03');
    expect(seen.blink!.toFixed(2)).toBe('1.03');
    expect(Math.round(seen.lit! * 100)).toBe(60);
    expect(seen.top.toFixed(2)).toBe('7.48');
    for (const quoted of ['1.03 Hz, not 1.30', 'lit 60% of the time', 'down to 7.48 V']) expect(whyText('A load, and a buffer')).toContain(quoted);
    expect(step(lesson.build, 'blink').text).toContain('about once a second');
  });

  it('the input climbs and falls between 3.6 V and 5.3 V while the output jumps between 0 V and 9 V', () => {
    const seen = slow(buffered());
    expect(seen.low.toFixed(1)).toBe('3.6');
    expect(seen.high.toFixed(1)).toBe('5.3');
    expect(seen.bottom.toFixed(1)).toBe('0.0');
    expect(seen.top.toFixed(1)).toBe('9.0');
    expect(whyText('Two thresholds')).toContain('climbs past 5.3 V');
    expect(whyText('Two thresholds')).toContain('fallen below 3.6 V');
    expect(whyText('An argument with itself')).toContain('climbs to 5.3 V');
    expect(whyText('An argument with itself')).toContain('falls to 3.6 V');
    expect(step(lesson.build, 'probes').how).toContain('between 0 V and 9 V');
    expect(whyText('A chip')).toContain('output high, 9 V');
  });

  it('with the LED on an inverter of its own it runs at 1.30 Hz, lit half the time: 1.3 ÷ (R × C)', () => {
    const seen = slow(buffered());
    expect(seen.hertz.toFixed(2)).toBe('1.30');
    expect(seen.outputHigh).toBeCloseTo(0.5, 1);
    expect(seen.lit!).toBeCloseTo(0.5, 1);
    expect(1.3 / (100000 * 10e-6)).toBeCloseTo(1.3, 6);
    expect(whyText('How fast')).toContain('1.3 ÷ (100,000 × 0.00001) = 1.3 Hz');
    // ...and it clicks in the Audio Out
    expect(seen.sound.max - seen.sound.min).toBeGreaterThan(0.5);
  });

  it('1 µF makes it 13 times a second, and 100 nF 130: the same square wave, now a note', () => {
    expect(watch(withCapacitor(buffered(), 1e-6), 2, 8000).hertz.toFixed(1)).toBe('13.0');
    const seen = quick(tone());
    expect(seen.hertz.toFixed(0)).toBe('130');
    expect(seen.sound.hertz!.toFixed(0)).toBe('130');
    expect(step(lesson.build, 'purr').how).toContain('13 times a second');
    expect(step(lesson.build, 'note').how).toContain('130 times a second');
    expect(whyText('Rhythm and pitch')).toContain('At 1.3 Hz');
    expect(whyText('Rhythm and pitch')).toContain('At 130 Hz');
  });
});

describe('class 4, the simplest oscillator: the experiments', () => {
  it('10 kΩ: 1.26 kHz, ten times the 130 Hz of 100 kΩ', () => {
    const circuit = withResistor(tone(), 100000, 10000);
    expect(quick(circuit).hertz.toFixed(0)).toBe('1264');
    const experiment = tryOut('smaller');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^1\.26 kHz, up from 130 Hz/);
    expect(experiment.made(new Work(tone()))).toBe(false);
    expect(experiment.made(new Work(tone().addComponent(resistor(10000, 0, 0))))).toBe(false);
  });

  it('27 kΩ and 2.2 kΩ in a line: 441 Hz, as 1.3 ÷ (R × C) says', () => {
    const circuit = inLine(tone());
    expect(quick(circuit).hertz.toFixed(0)).toBe('441');
    expect(1.3 / (29200 * 100e-9)).toBeGreaterThan(400);
    expect(1.3 / (29200 * 100e-9)).toBeLessThan(480);
    const experiment = tryOut('tuned');
    expect(experiment.options[experiment.answer]).toBe('440 Hz');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^441 Hz\./);
    expect(experiment.made(new Work(tone()))).toBe(false);
  });

  it('the LED back on the oscillator: 103 Hz, high 60% of the time, reaching 7.48 V', () => {
    const circuit = unbuffered(tone());
    const seen = quick(circuit);
    expect(seen.hertz.toFixed(0)).toBe('103');
    expect(Math.round(seen.outputHigh * 100)).toBe(60);
    const experiment = tryOut('load');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^103 Hz, and the output is high 60% of the time, not half\..*down to 7\.48 V/);
    expect(experiment.made(new Work(tone()))).toBe(false);
    // The slow blinker it all began with is not this experiment
    expect(experiment.made(new Work(blinker()))).toBe(false);
  });

  it('with no feedback it stops, the output stuck high', () => {
    const circuit = noFeedback(tone());
    const chip = only(circuit, 'cd40106');
    const run = new Work(circuit).bench({ seconds: 0.25, watch: [[chip, Y1]] });
    const output = run.volts(chip.id, chip.pins[Y1].id);
    expect(output.hertz).toBeNull();
    expect(output.min).toBeCloseTo(9, 1);
    const experiment = tryOut('no-feedback');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^It stops/);
    expect(experiment.made(new Work(tone()))).toBe(false);
    expect(experiment.made(new Work(inLine(tone())))).toBe(false);
  });

  it('every experiment asks a question with a right answer among its options, and none is made on an empty canvas', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(new Circuit('empty')))).toBe(false);
    }
  });
});

describe('class 4, the simplest oscillator: the check', () => {
  it('reads the note as built, and is not passed by it', () => {
    expect(lesson.check.reading(new Work(tone()))).toBe('Your note: 130 Hz');
    expect(lesson.check.passed(new Work(tone()))).toBe(false);
  });

  it('is passed with the 47 kΩ and 2.2 kΩ the hint ends on (263 Hz), and with one 50 kΩ', () => {
    const work = new Work(inLine(tone(), 47000, 2200));
    expect(lesson.check.reading(work)).toBe('Your note: 263 Hz');
    expect(lesson.check.passed(work)).toBe(true);
    expect(lesson.check.hint).toContain('47 kΩ and 2.2 kΩ');
    expect((1.3 / 262).toFixed(3)).toBe('0.005');
    expect(lesson.check.passed(new Work(withResistor(tone(), 100000, 50000)))).toBe(true);
  });

  it('is not passed by a note either side, and says so when there is nothing to hear', () => {
    expect(lesson.check.passed(new Work(withResistor(tone(), 100000, 47000)))).toBe(false); // 275 Hz
    expect(lesson.check.passed(new Work(withResistor(tone(), 100000, 56000)))).toBe(false);
    // The right pitch with no Audio Out is not played
    const silent = removeFromCircuit(inLine(tone(), 47000, 2200), [only(tone(), 'audio-output').id]);
    const tuned = inLine(tone(), 47000, 2200);
    const mute = tuned.removeComponent(only(tuned, 'audio-output').id);
    expect(lesson.check.reading(new Work(mute))).toBe('Your note: nothing to hear yet');
    expect(lesson.check.passed(new Work(mute))).toBe(false);
    expect(silent.getComponents().length).toBeGreaterThan(0);
    expect(lesson.check.reading(new Work(new Circuit('empty')))).toBeNull();
  });
});

describe('class 4, the simplest oscillator: the steps', () => {
  it('none are done on an empty canvas', () => {
    expect(done(new Work(new Circuit('empty')))).toEqual([]);
    expect(lesson.keep.filter((s) => s.done(new Work(new Circuit('empty')))).map((s) => s.id)).toEqual([]);
  });

  it('each is done as its part or wire arrives', () => {
    const { components, connections } = lesson.stages![0].circuit();
    const [supply, supplyGround, chip, chipGround, feedback, cap, capGround, limit, led, ledGround] = components;
    let circuit = new Circuit('mine');
    const now = () => done(new Work(circuit));
    for (const part of [supply, supplyGround, chip, chipGround]) circuit = circuit.addComponent(part);
    expect(now()).toEqual([]); // a chip with no power is not a chip put down and wired
    circuit = circuit.addConnection(connections[0]).addConnection(connections[1]);
    expect(now()).toEqual([]);
    circuit = circuit.addConnection(connections[2]);
    expect(now()).toEqual(['chip']);
    circuit = circuit.addComponent(feedback).addComponent(cap).addComponent(capGround);
    expect(now()).toEqual(['chip']); // lying on the canvas
    circuit = circuit.addConnection(connections[3]).addConnection(connections[4]);
    expect(now()).toEqual(['chip', 'feedback']);
    circuit = circuit.addConnection(connections[5]).addConnection(connections[6]);
    expect(now()).toEqual(['chip', 'feedback', 'timing']);
    circuit = circuit.addComponent(limit).addComponent(led).addComponent(ledGround).addConnection(connections[7]).addConnection(connections[8]);
    expect(now()).toEqual(['chip', 'feedback', 'timing']);
    circuit = circuit.addConnection(connections[9]);
    expect(now()).toEqual(['chip', 'feedback', 'timing', 'lamp']);
    expect(done(new Work(circuit, playing))).toEqual(['chip', 'feedback', 'timing', 'lamp', 'play', 'blink']);
  });

  it('any of the six inverters will do', () => {
    const supply = place('power', 0, 0), gnd = place('ground', 0, 100), chip = place('cd40106', 200, 0);
    const r = resistor(100000, 200, 200), c = capacitor(10e-6, 100, 200);
    const circuit = circuitOf({
      components: [supply, gnd, chip, r, c],
      connections: [connect(supply, 1, gnd, 0), connect(supply, 0, chip, 12), connect(chip, 13, gnd, 0),
        connect(chip, 3, r, 0), connect(r, 1, chip, 9), connect(c, 0, chip, 3), connect(c, 1, gnd, 0)],
    });
    expect(done(new Work(circuit))).toEqual(['chip', 'feedback', 'timing']);
  });

  it('the probes go on the input and the output', () => {
    const circuit = blinker();
    const chip = only(circuit, 'cd40106'), cap = only(circuit, 'capacitor'), limit = resistorOf(circuit, 1000);
    const probe = (part: Component, pin: number) => ({ componentId: part.id, pinId: part.pins[pin].id });
    expect(step(lesson.build, 'probes').done(new Work(circuit, { ...playing, probes: [probe(cap, 0), probe(limit, 0)] }))).toBe(true);
    expect(step(lesson.build, 'probes').done(new Work(circuit, { ...playing, probes: [probe(chip, Y1)] }))).toBe(false);
    expect(step(lesson.build, 'probes').done(new Work(circuit, playing))).toBe(false);
  });

  it('the LED moves to the second inverter, the Audio Out arrives, and the capacitor shrinks twice', () => {
    expect(done(new Work(blinker()))).toEqual(['chip', 'feedback', 'timing', 'lamp']);
    const withBuffer = unbuffered(buffered());
    expect(step(lesson.build, 'buffer').done(new Work(withBuffer))).toBe(false);
    expect(done(new Work(buffered()))).toEqual(['chip', 'feedback', 'timing', 'lamp', 'buffer', 'audio']);
    // An Audio Out wired to nothing is not heard
    expect(step(lesson.build, 'audio').done(new Work(blinker().addComponent(place('audio-output', 700, 480))))).toBe(false);
    const purr = withCapacitor(buffered(), 1e-6);
    expect(step(lesson.build, 'purr').done(new Work(purr))).toBe(true);
    expect(step(lesson.build, 'note').done(new Work(purr, playing))).toBe(false);
    expect(done(new Work(tone(), playing))).toEqual(['chip', 'feedback', 'timing', 'lamp', 'play', 'buffer', 'audio', 'purr', 'note']);
    expect(step(lesson.build, 'note').done(new Work(tone()))).toBe(false); // it is not playing
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(all(classStage(lesson, []), 'audio-output')).toHaveLength(0);
    const second = classStage(lesson, ['chip', 'feedback', 'timing', 'lamp', 'play', 'blink', 'probes']);
    expect(all(second, 'audio-output')).toHaveLength(1);
    expect(only(second, 'capacitor').parameters.capacitance).toBe(10e-6);
    const last = classStage(lesson, lesson.build.map((s) => s.id).filter((id) => id !== 'note'));
    expect(only(last, 'capacitor').parameters.capacitance).toBe(100e-9);
  });

  it('keeping it: a switch in the wire to the Audio Out, named SOUND, a look at the cover, and a save', () => {
    const circuit = tone();
    expect(lesson.keep.filter((s) => s.done(new Work(circuit))).map((s) => s.id)).toEqual([]);
    // A switch lying on the canvas switches nothing
    expect(step(lesson.keep, 'switch').done(new Work(circuit.addComponent(place('switch', 0, 0))))).toBe(false);
    const switched = withSwitch(circuit);
    expect(step(lesson.keep, 'switch').done(new Work(switched))).toBe(true);
    // ...open or closed: it is the switch that counts, and it does switch the sound
    expect(step(lesson.keep, 'switch').done(new Work(withSwitch(circuit, undefined, 0)))).toBe(true);
    expect(new Work(withSwitch(circuit, undefined, 0)).bench({ seconds: 0.25 }).sound.hertz).toBeNull();
    expect(new Work(switched).bench({ seconds: 0.25 }).sound.hertz!.toFixed(0)).toBe('130');
    expect(step(lesson.keep, 'name').done(new Work(switched))).toBe(false);
    const named = withSwitch(circuit, 'sound');
    expect(step(lesson.keep, 'name').done(new Work(named))).toBe(true);
    expect(step(lesson.keep, 'cover').done(new Work(named, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(named, { ...playing, saved: true }))).toBe(true);
  });

  it('what later classes start from is the Simple Oscillator example: this oscillator at 440 Hz with its SOUND switch', () => {
    const kept = circuitOf(simplestOscillatorKept());
    const example = exampleCircuits.find((e) => e.name === 'Simple Oscillator')!.build();
    expect(kept.getComponents().map((c) => c.type)).toEqual(example.components.map((c) => c.type));
    expect(only(kept, 'switch').label).toBe('SOUND');
    expect(new Work(kept).bench({ seconds: 0.25 }).sound.hertz!.toFixed(0)).toBe('441');
    // It counts as kept by this class's own steps
    expect(lesson.keep.filter((s) => s.done(new Work(kept))).map((s) => s.id)).toEqual(['switch', 'name']);
  });
});
