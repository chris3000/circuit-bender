/**
 * Class 2 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { sharingVoltage as lesson, sharingVoltageKept } from '@/classes/sharingVoltage';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { connect, place, resistor } from '@/examples/circuits';
import { replacePart } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import type { Component } from '@/types/circuit';
import type { Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

const mA = (amps: number) => amps * 1000;
const uA = (amps: number) => amps * 1e6;
const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const ohms = (circuit: Circuit, part: Component, value: number) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, resistance: value, value: formatValue(value, 'resistance') } });
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);

/** The three circuits of the build: the divider, the pot with its LED, the photocell dimmer. */
const divider = () => classStage(lesson, []);
const withPot = () => classStage(lesson, ['supply', 'two', 'line', 'play', 'read']);
const dimmer = () => classCircuit(lesson);

/** The divider's lower resistor: the one that goes to ground. */
const lowerOf = (circuit: Circuit): Component => {
  const work = new Work(circuit);
  return all(circuit, 'resistor').find((r) => work.grounded(r, 1) && work.net(r, 0) !== work.net(only(circuit, 'power'), 0))!;
};
/** The divider's two resistors: [upper, lower], the upper being the one on +. */
function pair(circuit: Circuit): [Component, Component] {
  const work = new Work(circuit);
  const lower = lowerOf(circuit);
  const upper = all(circuit, 'resistor').find((r) => work.joined(r, 0, only(circuit, 'power'), 0) && work.joined(r, 1, lower, 0))!;
  return [upper, lower];
}
/** The divider with other values in it. */
const dividerOf = (upper: number, lower: number, circuit = divider()) => {
  const [a, b] = pair(circuit);
  return ohms(ohms(circuit, a, upper), b, lower);
};
/** The voltage at the point between the divider's halves. */
const point = (circuit: Circuit, set: Array<{ componentId: string; parameter: string; value: number }> = []) => {
  const lower = lowerOf(circuit);
  return new Work(circuit).bench({ watch: [[lower, 0]], set }).volts(lower.id, lower.pins[0].id).mean;
};
const light = (circuit: Circuit, value: number) => all(circuit, 'ldr').map((cell) => ({ componentId: cell.id, parameter: 'light', value }));
const ledAmps = (circuit: Circuit, set: Array<{ componentId: string; parameter: string; value: number }> = []) =>
  new Work(circuit).run(set).amps(only(circuit, 'led').id);

/** A third 10 kΩ beside the upper one. */
function beside(circuit: Circuit): Circuit {
  const [upper] = pair(circuit);
  const third = resistor(10000, 280, 220, 90);
  return circuit.addComponent(third).addConnection(connect(third, 0, upper, 0)).addConnection(connect(third, 1, upper, 1));
}
/** A photocell where the divider's upper resistor was. */
const lightMeter = (circuit = divider()) => replacePart(circuit, pair(circuit)[0].id, ALL_PARTS.find((d) => d.type === 'ldr')!).circuit;
/** The dimmer's photocell swapped for body contacts. */
function fingerDimmer(): Circuit {
  const circuit = dimmer();
  return replacePart(circuit, only(circuit, 'ldr').id, ALL_PARTS.find((d) => d.type === 'body-contact')!).circuit;
}

describe('class 2, sharing voltage: what it says', () => {
  it('starts from an empty canvas', () => {
    expect(classStart(lesson).getComponents()).toHaveLength(0);
    expect(lesson.number).toBe(2);
  });

  it('two 10 kΩ in a line pass 0.45 mA and put the point between them at 4.5 V', () => {
    const circuit = divider();
    const [upper, lower] = pair(circuit);
    const run = new Work(circuit).run();
    expect(mA(run.amps(upper.id))).toBeCloseTo(0.45, 3);
    expect(mA(run.amps(lower.id))).toBeCloseTo(0.45, 3);
    expect(point(circuit)).toBeCloseTo(4.5, 3);
    const why = lesson.why.map((p) => p.text).join(' ');
    expect(why).toContain('9 V ÷ 20 kΩ = 0.45 mA');
    expect(why).toContain('sits at 4.5 V');
    expect(step(lesson.build, 'read').text).toContain('4.5 V');
  });

  it('the pot takes its middle leg from 0 V to 8.8 V and the LED from dark to bright; half way reads 2.35 V', () => {
    const circuit = withPot();
    const knob = only(circuit, 'potentiometer'), led = only(circuit, 'led');
    const at = (position: number) => new Work(circuit).bench({ watch: [[knob, 1]], set: [{ componentId: knob.id, parameter: 'position', value: position }] });
    const volts = (position: number) => at(position).volts(knob.id, knob.pins[1].id).mean;
    const ends = [volts(0), volts(1)].sort((a, b) => a - b);
    expect(ends[0].toFixed(1)).toBe('0.0');
    expect(ends[1].toFixed(1)).toBe('8.8');
    const amps = [at(0).amps(led.id), at(1).amps(led.id)].sort((a, b) => a - b);
    expect(amps[0]).toBeLessThan(1e-6);
    expect(mA(amps[1])).toBeGreaterThan(10);
    expect(volts(0.5).toFixed(2)).toBe('2.35');
    expect(step(lesson.build, 'turn').how).toContain('from 0 V up to 8.8 V');
    expect(lesson.why.find((p) => p.title === 'A pot')!.text).toContain('2.35 V, not 4.5 V');
  });

  it('the photocell is 1 MΩ in the dark and 1 kΩ in bright light; the dimmer passes 0.007, 0.22 and 4.7 mA', () => {
    const circuit = dimmer();
    const cell = only(circuit, 'ldr');
    const across = (value: number) => {
      const run = new Work(circuit).run(light(circuit, value));
      return run.across(cell.id) / run.amps(cell.id);
    };
    expect(across(0) / 1e6).toBeCloseTo(1, 2);
    expect(across(1) / 1e3).toBeCloseTo(1, 2);
    expect(mA(ledAmps(circuit, light(circuit, 0))).toFixed(3)).toBe('0.007');
    expect(mA(ledAmps(circuit, light(circuit, 0.5))).toFixed(2)).toBe('0.22');
    expect(mA(ledAmps(circuit, light(circuit, 1))).toFixed(1)).toBe('4.7');
    const sensors = lesson.why.find((p) => p.title === 'Sensors')!.text;
    for (const quoted of ['1 MΩ in the dark and 1 kΩ in bright light', '0.007 mA', '0.22 mA', '4.7 mA']) expect(sensors).toContain(quoted);
  });
});

describe('class 2, sharing voltage: the experiments', () => {
  it('a 4.7 kΩ below reads 2.88 V, and above reads 6.12 V', () => {
    const circuit = dividerOf(10000, 4700);
    expect(point(circuit).toFixed(2)).toBe('2.88');
    expect(point(dividerOf(4700, 10000)).toFixed(2)).toBe('6.12');
    const experiment = tryOut('smaller');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^2\.88 V\. .* reads 6\.12 V/);
    expect(experiment.made(new Work(divider()))).toBe(false);
    expect(experiment.made(new Work(dividerOf(4700, 10000)))).toBe(false);
    // ...and with the dimmer beside it, as it is when the build is done
    expect(experiment.made(new Work(dividerOf(10000, 4700, dimmer())))).toBe(true);
  });

  it('100 kΩ over 1 kΩ reads 0.09 V', () => {
    const circuit = dividerOf(100000, 1000);
    expect(point(circuit).toFixed(2)).toBe('0.09');
    const experiment = tryOut('tiny');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^0\.089\d? V|^89\.\d mV/);
    expect(experiment.made(new Work(divider()))).toBe(false);
  });

  it('a second 10 kΩ beside the upper one lifts the point to 6 V', () => {
    const circuit = beside(divider());
    expect(point(circuit)).toBeCloseTo(6, 3);
    const experiment = tryOut('beside');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^6\.00 V\./);
    expect(experiment.made(new Work(divider()))).toBe(false);
    // A third resistor lying loose is not beside anything
    expect(experiment.made(new Work(divider().addComponent(resistor(10000, 280, 220))))).toBe(false);
  });

  it('a photocell over 10 kΩ reads 0.09 V in the dark, 2.16 V at half light and 8.18 V in bright light', () => {
    const circuit = lightMeter();
    expect(point(circuit, light(circuit, 0)).toFixed(2)).toBe('0.09');
    expect(point(circuit, light(circuit, 0.5)).toFixed(2)).toBe('2.16');
    expect(point(circuit, light(circuit, 1)).toFixed(2)).toBe('8.18');
    const experiment = tryOut('meter');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/in the dark, 2\.16 V at half light and 8\.18 V in bright light/);
    expect(experiment.made(new Work(divider()))).toBe(false);
    // The dimmer's own photocell is not a light meter
    expect(experiment.made(new Work(dimmer()))).toBe(false);
    expect(experiment.made(new Work(lightMeter(dimmer())))).toBe(true);
  });

  it('a finger passes 5 µA for a light touch and 140 µA pressed hard: 2 MΩ and 50 kΩ', () => {
    const circuit = fingerDimmer();
    const pads = only(circuit, 'body-contact');
    const touch = (value: number) => [{ componentId: pads.id, parameter: 'touch', value }];
    expect(uA(ledAmps(circuit, touch(0.01)))).toBeCloseTo(4, 0);
    expect(uA(ledAmps(circuit, touch(1)))).toBeCloseTo(140, -1);
    expect(ledAmps(circuit, touch(0))).toBeLessThan(1e-7);
    const ohmsAt = (value: number) => {
      const run = new Work(circuit).run(touch(value));
      return run.across(pads.id) / run.amps(pads.id);
    };
    expect(ohmsAt(0.001) / 1e6).toBeCloseTo(2, 1);
    expect(ohmsAt(1) / 1e3).toBeCloseTo(50, 0);
    const experiment = tryOut('finger');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^1\d\d µA pressed hard, and \d\.\d+ µA for the lightest touch/);
    expect(experiment.made(new Work(dimmer()))).toBe(false);
    // Body contacts lying loose light nothing
    expect(experiment.made(new Work(dimmer().addComponent(place('body-contact', 500, 500))))).toBe(false);
  });

  it('every experiment asks a question with a right answer among its options', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(new Circuit('empty')))).toBe(false);
    }
  });
});

describe('class 2, sharing voltage: the check', () => {
  it('reads the divider as built, and is not passed by it', () => {
    for (const circuit of [divider(), dimmer()]) {
      expect(lesson.check.reading(new Work(circuit))).toBe('Your point: 4.50 V');
      expect(lesson.check.passed(new Work(circuit))).toBe(false);
    }
  });

  it('is passed by two 10 kΩ in a line over one, and by one over two side by side: the two ways the hint gives', () => {
    // 20 kΩ above: a second 10 kΩ in line with the upper one
    const base = divider();
    const [upper] = pair(base);
    const supply = only(base, 'power');
    const wire = base.getConnections().find((c) => c.from.componentId === supply.id && c.to.componentId === upper.id)!;
    const extra = resistor(10000, 360, 120, 90);
    const inLine = base.removeConnection(wire.id).addComponent(extra)
      .addConnection(connect(supply, 0, extra, 0)).addConnection(connect(extra, 1, upper, 0));
    expect(lesson.check.passed(new Work(inLine))).toBe(true);
    expect(lesson.check.reading(new Work(inLine))).toBe('Your point: 3.00 V');

    // 5 kΩ below: a second 10 kΩ beside the lower one
    const [, lower] = pair(base);
    const second = resistor(10000, 440, 340, 90);
    const sideBySide = base.addComponent(second).addConnection(connect(second, 0, lower, 0)).addConnection(connect(second, 1, lower, 1));
    expect(lesson.check.passed(new Work(sideBySide))).toBe(true);
    expect(lesson.check.hint).toContain('9 V × 10 ÷ 30');
    expect(lesson.check.hint).toContain('9 V × 5 ÷ 15');
  });

  it('is not passed by 3 V made with other values, and says why', () => {
    const circuit = dividerOf(20000, 10000);
    expect(lesson.check.passed(new Work(circuit))).toBe(false);
    expect(lesson.check.reading(new Work(circuit))).toBe('Your point: 3.00 V, but not every resistor in it is 10 kΩ');
  });

  it('does not take a photocell\'s point for one, and has nothing to read from an empty canvas', () => {
    const meter = lightMeter();
    expect(lesson.check.reading(new Work(meter))).toBeNull();
    expect(lesson.check.reading(new Work(new Circuit('empty')))).toBeNull();
    expect(lesson.check.passed(new Work(new Circuit('empty')))).toBe(false);
  });
});

describe('class 2, sharing voltage: the steps', () => {
  it('none are done on an empty canvas', () => {
    expect(done(new Work(new Circuit('empty')))).toEqual([]);
    expect(lesson.keep.filter((s) => s.done(new Work(new Circuit('empty')))).map((s) => s.id)).toEqual([]);
  });

  it('the divider is built, played and read', () => {
    const circuit = divider();
    expect(done(new Work(circuit))).toEqual(['supply', 'two', 'line']);
    expect(done(new Work(circuit, playing))).toEqual(['supply', 'two', 'line', 'play']);
    const [upper, lower] = pair(circuit);
    const between = circuit.getConnections().find((c) => c.from.componentId === upper.id && c.to.componentId === lower.id)!;
    const toSupply = circuit.getConnections().find((c) => c.to.componentId === upper.id && c.from.componentId !== lower.id)!;
    expect(step(lesson.build, 'read').done(new Work(circuit, { ...playing, wires: [between.id] }))).toBe(true);
    // Some other wire is not the point between them
    expect(step(lesson.build, 'read').done(new Work(circuit, { ...playing, wires: [toSupply.id] }))).toBe(false);
    // Two 10 kΩ that are only lying there are not a line
    const loose = new Circuit('mine').addComponent(resistor(10000, 0, 0)).addComponent(resistor(10000, 100, 0));
    expect(done(new Work(loose))).toEqual(['two']);
  });

  it('the pot goes across the supply, gets its LED, and is turned', () => {
    const circuit = withPot();
    expect(done(new Work(circuit))).toEqual(['supply', 'two', 'line', 'pot', 'lamp']);
    const knob = only(circuit, 'potentiometer');
    const turned = circuit.updateComponent(knob.id, { parameters: { ...knob.parameters, position: 0.95 } });
    expect(step(lesson.build, 'turn').done(new Work(turned))).toBe(false); // it is not playing
    expect(step(lesson.build, 'turn').done(new Work(turned, playing))).toBe(true);
    expect(step(lesson.build, 'turn').done(new Work(circuit, playing))).toBe(false); // it has not been turned
    // A pot on the canvas with nothing wired is none of it
    const loose = divider().addComponent(place('potentiometer', 500, 300));
    expect(done(new Work(loose))).toEqual(['supply', 'two', 'line']);
  });

  it('the photocell takes the pot\'s place, and its dial is moved', () => {
    const circuit = dimmer();
    expect(done(new Work(circuit))).toEqual(['supply', 'two', 'line', 'pot', 'lamp', 'turn', 'cell']);
    const cell = only(circuit, 'ldr');
    const shaded = circuit.updateComponent(cell.id, { parameters: { ...cell.parameters, light: 0.1 } });
    expect(step(lesson.build, 'shade').done(new Work(shaded, playing))).toBe(true);
    expect(step(lesson.build, 'shade').done(new Work(shaded))).toBe(false);
    expect(step(lesson.build, 'shade').done(new Work(circuit, playing))).toBe(false);
    // A photocell wired to nothing is not a dimmer
    expect(step(lesson.build, 'cell').done(new Work(withPot().addComponent(place('ldr', 500, 100))))).toBe(false);
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(all(classStage(lesson, []), 'potentiometer')).toHaveLength(0);
    expect(all(classStage(lesson, ['supply', 'two', 'line', 'play', 'read']), 'potentiometer')).toHaveLength(1);
    expect(all(classStage(lesson, ['supply', 'two', 'line', 'play', 'read', 'pot', 'lamp', 'turn']), 'ldr')).toHaveLength(1);
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['read', 'turn']);
  });

  it('keeping it: the divider cleared away, the photocell named SHADE, a look at the cover, and a save', () => {
    const circuit = dimmer();
    expect(step(lesson.keep, 'tidy').done(new Work(circuit))).toBe(false);
    let tidy = circuit;
    for (const r of pair(circuit)) tidy = tidy.removeComponent(r.id);
    expect(step(lesson.keep, 'tidy').done(new Work(tidy))).toBe(true);
    expect(mA(ledAmps(tidy, light(tidy, 1))).toFixed(1)).toBe('4.7');
    expect(step(lesson.keep, 'name').done(new Work(tidy))).toBe(false);
    const named = tidy.updateComponent(only(tidy, 'ldr').id, { label: 'shade' });
    expect(step(lesson.keep, 'name').done(new Work(named))).toBe(true);
    expect(step(lesson.keep, 'cover').done(new Work(named, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(named, { ...playing, saved: true }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(new Circuit('empty'), { ...playing, saved: true }))).toBe(false);
  });

  it('what it keeps is the dimmer by itself, every keep step done but the look at the cover and the save', () => {
    const { components, connections } = sharingVoltageKept();
    let kept = new Circuit('kept');
    for (const c of components) kept = kept.addComponent(c);
    for (const c of connections) kept = kept.addConnection(c);
    expect(lesson.keep.filter((s) => s.done(new Work(kept))).map((s) => s.id)).toEqual(['tidy', 'name']);
    expect(mA(ledAmps(kept, light(kept, 1))).toFixed(1)).toBe('4.7');
    expect(mA(ledAmps(kept, light(kept, 0))).toFixed(3)).toBe('0.007');
  });
});
