/**
 * Class 3 on the bench: every number the class quotes is measured here on
 * the class's own circuit, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { storingCharge as lesson, storingChargeKept } from '@/classes/storingCharge';
import { theLoop, theLoopKept } from '@/classes/theLoop';
import { classCircuit, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { capacitor, connect, ground, place, resistor } from '@/examples/circuits';
import { replacePart, spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import { formatAmps } from '@/utils/readings';
import type { Component } from '@/types/circuit';
import type { Built, Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

const RATE = 4000;
const mA = (amps: number) => amps * 1000;
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
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);
const built = () => classCircuit(lesson);

const button = (circuit: Circuit, closed: 0 | 1) => all(circuit, 'pushbutton').map((b) => ({ componentId: b.id, parameter: 'closed', value: closed }));
/** The LED's current, sample by sample, from the button held to long after it is let go at 0.05 s. */
function letGo(circuit: Circuit) {
  const led = only(circuit, 'led');
  const run = new Work(circuit).bench({
    seconds: 6, sampleRate: RATE, set: button(circuit, 1), watchAmps: [led.id],
    events: button(circuit, 0).map((e) => ({ ...e, at: 0.05 })),
  });
  const trace = run.ampsTrace(led.id)!;
  const on = trace[0];
  const timeTo = (fraction: number) => (trace.findIndex((amps, i) => i > 0.05 * RATE && amps <= on * fraction)) / RATE - 0.05;
  return { on, half: timeTo(0.5), tenth: timeTo(0.1) };
}
/** The same from the button's first touch at 0.05 s, held from then on. */
function pressed(circuit: Circuit) {
  const led = only(circuit, 'led');
  const resistors = all(circuit, 'resistor');
  const run = new Work(circuit).bench({
    seconds: 1.5, sampleRate: RATE, set: button(circuit, 0), watchAmps: [led.id, ...resistors.map((r) => r.id)],
    events: button(circuit, 1).map((e) => ({ ...e, at: 0.05 })),
  });
  return { run, led: run.ampsTrace(led.id)! };
}
/** The tank's voltage with the button held. */
const tankVolts = (circuit: Circuit) => {
  const tank = all(circuit, 'capacitor')[0];
  return new Work(circuit).bench({ set: button(circuit, 1), watch: [[tank, 0]] }).volts(tank.id, tank.pins[0].id).mean;
};

/** A second 100 µF beside the first. */
function twoTanks(circuit: Circuit): Circuit {
  const tank = only(circuit, 'capacitor');
  const second = capacitor(100e-6, 600, 420, 90), gnd = ground(600, 520);
  return circuit.addComponent(second).addComponent(gnd).addConnection(connect(second, 0, tank, 0)).addConnection(connect(second, 1, gnd, 0));
}

describe('class 3, storing charge: what it says', () => {
  it('starts from the light class 1 keeps', () => {
    const start = classStart(lesson);
    expect(start.getComponents().map((c) => c.type).sort()).toEqual(circuitOf(theLoopKept()).getComponents().map((c) => c.type).sort());
    expect(only(start, 'switch').label).toBe('LIGHT');
    expect(only(start, 'resistor').parameters.resistance).toBe(470);
    // ...which is class 1's own circuit with its keep step done
    expect(theLoop.keep.find((s) => s.id === 'name')!.done(new Work(start))).toBe(true);
    expect(lesson.startsFrom).toContain('470 Ω');
  });

  it('held, the LED carries 1.46 mA and the tank stands at 8.85 V', () => {
    const circuit = built();
    // As the meter writes it
    expect(formatAmps(new Work(circuit).run(button(circuit, 1)).amps(only(circuit, 'led').id))).toBe('1.46 mA');
    expect(tankVolts(circuit).toFixed(2)).toBe('8.85');
    expect(step(lesson.build, 'press').how).toContain('1.46 mA');
    expect(step(lesson.build, 'probe').how).toContain('8.85 V');
    expect(lesson.why.find((p) => p.title === 'The small resistor')!.text).toContain('fills to 8.85 V');
  });

  it('nothing is lit before the button is pressed', () => {
    const circuit = built();
    expect(new Work(circuit).run().amps(only(circuit, 'led').id)).toBeLessThan(1e-6);
  });

  it('let go, the LED falls to half in 0.33 s and to a tenth in 1.11 s: 0.7 × R × C, with R × C = 0.47 s', () => {
    const { on, half, tenth } = letGo(built());
    expect(formatAmps(on)).toBe('1.46 mA');
    expect(half.toFixed(2)).toBe('0.33');
    expect(tenth.toFixed(2)).toBe('1.11');
    expect(4700 * 100e-6).toBeCloseTo(0.47, 6);
    expect((0.7 * 0.47).toFixed(2)).toBe('0.33');
    const text = lesson.why.find((p) => p.title === 'How long it takes')!.text;
    for (const quoted of ['4,700 Ω × 0.0001 F = 0.47 s', '0.7 × R × C', '0.33 s', 'a tenth after 1.11 s']) expect(text).toContain(quoted);
  });

  it('the first rush through the 100 Ω is no more than 90 mA, and once the tank is full nothing more goes into it', () => {
    const circuit = built();
    const { run } = pressed(circuit);
    const fill = run.ampsTrace(resistorOf(circuit, 100).id)!;
    const drain = run.ampsTrace(resistorOf(circuit, 4700).id)!;
    expect(mA(Math.max(...fill))).toBeGreaterThan(70);
    expect(mA(Math.max(...fill))).toBeLessThanOrEqual(90);
    // Held for over a second: what comes in through the 100 Ω all goes out through the 4.7 kΩ
    const last = fill.length - 1;
    expect(mA(fill[last])).toBeCloseTo(mA(drain[last]), 3);
    expect(lesson.why.find((p) => p.title === 'The small resistor')!.text).toContain('no more than 9 V ÷ 100 Ω = 90 mA');
  });
});

describe('class 3, storing charge: the experiments', () => {
  it('10 kΩ on the way out: half after 0.70 s, and 0.70 mA while held', () => {
    const circuit = withResistor(built(), 4700, 10000);
    const { on, half } = letGo(circuit);
    expect(half.toFixed(2)).toBe('0.70');
    expect(mA(on).toFixed(2)).toBe('0.70');
    const experiment = tryOut('more-resistance');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^0\.70 s to fall to half, where it took 0\.33 s\..*: 699 µA, down from 1\.46 mA/);
    expect(experiment.made(new Work(built()))).toBe(false);
    // 10 kΩ on the way in is the other experiment
    expect(experiment.made(new Work(withResistor(built(), 100, 10000)))).toBe(false);
    expect(experiment.made(new Work(built().addComponent(resistor(10000, 0, 0))))).toBe(false);
  });

  it('470 µF: half after 1.55 s, no dimmer', () => {
    const circuit = withCapacitor(built(), 470e-6);
    const { on, half } = letGo(circuit);
    expect(half.toFixed(2)).toBe('1.55');
    expect(formatAmps(on)).toBe('1.46 mA');
    const experiment = tryOut('more-capacitance');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^1\.55 s to fall to half/);
    expect(experiment.made(new Work(built()))).toBe(false);
    expect(experiment.made(new Work(built().addComponent(capacitor(470e-6, 0, 0))))).toBe(false);
  });

  it('two 100 µF side by side: half after 0.66 s, twice as long', () => {
    const circuit = twoTanks(built());
    const { half } = letGo(circuit);
    expect(half.toFixed(2)).toBe('0.66');
    const experiment = tryOut('beside');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^0\.66 s to fall to half: twice the 0\.33 s of one/);
    expect(experiment.made(new Work(built()))).toBe(false);
    expect(experiment.made(new Work(built().addComponent(capacitor(100e-6, 0, 0))))).toBe(false);
  });

  it('10 kΩ on the way in: 0.14 s to reach 0.1 mA, 0.48 mA in the end, and a tank that fills to 4.18 V', () => {
    const circuit = withResistor(built(), 100, 10000);
    const { led } = pressed(circuit);
    const reached = led.findIndex((amps) => amps >= 1e-4) / RATE - 0.05;
    expect(reached.toFixed(2)).toBe('0.14');
    expect(mA(new Work(circuit).run(button(circuit, 1)).amps(only(circuit, 'led').id)).toFixed(2)).toBe('0.48');
    expect(tankVolts(circuit).toFixed(2)).toBe('4.18');
    // A third of the 1.46 mA it was
    expect(0.48 / 1.46).toBeCloseTo(1 / 3, 1);
    const experiment = tryOut('slow-fill');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^It takes 0\.14 s to reach even 0\.1 mA, and settles at 482 µA, a third of what it was\..*fills only to 4\.18 V/);
    expect(experiment.made(new Work(built()))).toBe(false);
    expect(experiment.made(new Work(withResistor(built(), 4700, 10000)))).toBe(false);
  });

  it('every experiment asks a question with a right answer among its options, and none is made on an empty canvas', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(new Circuit('empty')))).toBe(false);
      expect(experiment.made(new Work(classStart(lesson)))).toBe(false);
    }
  });
});

describe('class 3, storing charge: the check', () => {
  it('reads the fade as built, and is not passed by it', () => {
    const work = new Work(built());
    expect(lesson.check.reading(work)).toBe('Your LED: half after 0.33 s');
    expect(lesson.check.passed(work)).toBe(false);
  });

  it('is passed with the 27 kΩ the hint ends on (1.89 s), and with 470 µF and 6.8 kΩ', () => {
    const work = new Work(withResistor(built(), 4700, 27000));
    expect(lesson.check.reading(work)).toBe('Your LED: half after 1.89 s');
    expect(lesson.check.passed(work)).toBe(true);
    expect(lesson.check.hint).toContain('27 kΩ');
    expect((2 / 0.7).toFixed(1)).toBe('2.9');
    expect(lesson.check.passed(new Work(withCapacitor(withResistor(built(), 4700, 6800), 470e-6)))).toBe(true);
  });

  it('is not passed by a fade too short or too long, and says so of one it cannot see the end of', () => {
    expect(lesson.check.passed(new Work(withResistor(built(), 4700, 22000)))).toBe(false);
    expect(lesson.check.passed(new Work(withResistor(built(), 4700, 33000)))).toBe(false);
    const endless = new Work(withResistor(built(), 4700, 470000));
    expect(lesson.check.reading(endless)).toBe('Your LED: half after more than 5 s');
    expect(lesson.check.passed(endless)).toBe(false);
  });

  it('has nothing to read from the light it starts from, or from an empty canvas', () => {
    expect(lesson.check.reading(new Work(classStart(lesson)))).toBeNull();
    expect(lesson.check.reading(new Work(new Circuit('empty')))).toBeNull();
    expect(lesson.check.passed(new Work(new Circuit('empty')))).toBe(false);
  });
});

describe('class 3, storing charge: the steps', () => {
  it('none are done by the light it starts from, or on an empty canvas', () => {
    expect(done(new Work(classStart(lesson)))).toEqual([]);
    expect(done(new Work(new Circuit('empty')))).toEqual([]);
    expect(lesson.keep.filter((s) => s.done(new Work(classStart(lesson)))).map((s) => s.id)).toEqual([]);
  });

  it('each is done as the light is changed the way the class says: swap, retype, drop into the wire, add the tank', () => {
    let circuit = classStart(lesson);
    const now = () => done(new Work(circuit));
    // Double-click the switch, pick the push button
    circuit = replacePart(circuit, only(circuit, 'switch').id, ALL_PARTS.find((d) => d.type === 'pushbutton')!).circuit;
    expect(now()).toEqual(['button']);
    circuit = withResistor(circuit, 470, 4700);
    expect(now()).toEqual(['button', 'drain']);
    // A 100 Ω lying on the canvas is not in the wire
    expect(done(new Work(circuit.addComponent(resistor(100, 0, 0))))).toEqual(['button', 'drain']);
    const wire = circuit.getConnections().find((c) => c.from.componentId === only(circuit, 'pushbutton').id && c.to.componentId === resistorOf(circuit, 4700).id)!;
    const fill = resistor(100, 380, 200);
    circuit = spliceIntoWire(circuit, fill, wire.id);
    expect(now()).toEqual(['button', 'drain', 'fill']);
    // A capacitor from the supply to ground is not the tank
    const stray = capacitor(100e-6, 100, 300, 90);
    expect(done(new Work(circuit.addComponent(stray).addConnection(connect(stray, 0, only(circuit, 'power'), 0))
      .addConnection(connect(stray, 1, all(circuit, 'ground')[0], 0))))).toEqual(['button', 'drain', 'fill']);
    const tank = capacitor(100e-6, 540, 300, 90), gnd = ground(540, 400);
    circuit = circuit.addComponent(tank).addComponent(gnd).addConnection(connect(tank, 0, fill, 1)).addConnection(connect(tank, 1, gnd, 0));
    expect(now()).toEqual(['button', 'drain', 'fill', 'tank']);
    // ...and it is the class's own circuit, to the number
    expect(letGo(circuit).half.toFixed(2)).toBe('0.33');
  });

  it('the last three want it playing, the button held, and a probe on the tank', () => {
    const circuit = built();
    expect(done(new Work(circuit, playing))).toEqual(['button', 'drain', 'fill', 'tank', 'play']);
    const b = only(circuit, 'pushbutton');
    const held = circuit.updateComponent(b.id, { parameters: { ...b.parameters, closed: 1 } });
    expect(step(lesson.build, 'press').done(new Work(held, playing))).toBe(true);
    expect(step(lesson.build, 'press').done(new Work(held))).toBe(false);
    const tank = only(circuit, 'capacitor'), fill = resistorOf(circuit, 100);
    // A probe anywhere on the tank's point will do; one on the supply will not
    expect(step(lesson.build, 'probe').done(new Work(circuit, { ...playing, probes: [{ componentId: fill.id, pinId: fill.pins[1].id }] }))).toBe(true);
    expect(step(lesson.build, 'probe').done(new Work(circuit, { ...playing, probes: [{ componentId: tank.id, pinId: tank.pins[0].id }] }))).toBe(true);
    expect(step(lesson.build, 'probe').done(new Work(circuit, { ...playing, probes: [{ componentId: fill.id, pinId: fill.pins[0].id }] }))).toBe(false);
  });

  it('a light that fades counts however it was put together', () => {
    // Built from nothing, the tank after the LED's resistor in the list, the button on the far side
    const supply = place('power', 0, 0), gnd = ground(0, 100), b = place('pushbutton', 100, 0);
    const fill = resistor(100, 200, 0), drain = resistor(4700, 300, 0), led = place('led', 400, 0), tank = capacitor(100e-6, 250, 100);
    const circuit = circuitOf({
      components: [supply, gnd, b, fill, drain, led, tank],
      connections: [connect(supply, 1, gnd, 0), connect(supply, 0, fill, 0), connect(fill, 1, b, 0), connect(b, 1, drain, 0),
        connect(drain, 1, led, 0), connect(led, 1, gnd, 0), connect(tank, 0, b, 1), connect(tank, 1, gnd, 0)],
    });
    expect(done(new Work(circuit))).toEqual(['button', 'drain', 'fill', 'tank']);
  });

  it('keeping it: the button named GLOW, a look at the cover, and a save', () => {
    const kept = circuitOf(storingChargeKept());
    expect(lesson.keep.filter((s) => s.done(new Work(kept))).map((s) => s.id)).toEqual(['name']);
    expect(step(lesson.keep, 'name').done(new Work(built()))).toBe(false);
    expect(step(lesson.keep, 'cover').done(new Work(kept, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(kept, { ...playing, saved: true }))).toBe(true);
    // The named button still does what the class says
    expect(letGo(kept).half.toFixed(2)).toBe('0.33');
  });
});
