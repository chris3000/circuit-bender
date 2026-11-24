/**
 * Class 1 on the bench: every number the class quotes is measured here on
 * the class's own circuit, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { theLoop } from '@/classes/theLoop';
import { classCircuit } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { connect, place, resistor } from '@/examples/circuits';
import { removeFromCircuit, spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import type { Component, ConnectionId } from '@/types/circuit';
import type { Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

const mA = (amps: number) => amps * 1000;
const only = (circuit: Circuit, type: string): Component => {
  const parts = circuit.getComponents().filter((c) => c.type === type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const set = (circuit: Circuit, part: Component, parameters: Component['parameters']) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, ...parameters } });
const close = (circuit: Circuit) => set(circuit, only(circuit, 'switch'), { closed: 1 });
const withResistor = (circuit: Circuit, ohms: number) =>
  set(circuit, only(circuit, 'resistor'), { resistance: ohms, value: formatValue(ohms, 'resistance') });
/** The wire between two parts. */
const wireBetween = (circuit: Circuit, a: Component, b: Component): ConnectionId => {
  const wire = circuit.getConnections().find((c) =>
    (c.from.componentId === a.id && c.to.componentId === b.id) || (c.from.componentId === b.id && c.to.componentId === a.id));
  if (!wire) throw new Error('no such wire');
  return wire.id;
};

/** The class's circuit as it stands when the build is done and the switch closed. */
const lit = () => close(classCircuit(theLoop));
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => theLoop.tries.find((t) => t.id === id)!;
const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };

/** The LED turned round: its wires swapped. */
function backwards(circuit: Circuit): Circuit {
  const led = only(circuit, 'led'), r = only(circuit, 'resistor');
  const ledGround = circuit.getComponents().filter((c) => c.type === 'ground')[1];
  return circuit
    .removeConnection(wireBetween(circuit, r, led))
    .removeConnection(wireBetween(circuit, led, ledGround))
    .addConnection(connect(r, 1, led, 1))
    .addConnection(connect(led, 0, ledGround, 0));
}

/** A second LED in line, between the first and ground. */
function twoLeds(circuit: Circuit): Circuit {
  const led = only(circuit, 'led');
  const ledGround = circuit.getComponents().filter((c) => c.type === 'ground')[1];
  const second = place('led', 660, 160);
  return circuit
    .removeConnection(wireBetween(circuit, led, ledGround))
    .addComponent(second)
    .addConnection(connect(led, 1, second, 0))
    .addConnection(connect(second, 1, ledGround, 0));
}

/** The resistor deleted, as the Delete key does it: the wire closes up, and the switch goes straight to the LED. */
function noResistor(circuit: Circuit): Circuit {
  return removeFromCircuit(circuit, [only(circuit, 'resistor').id]);
}

describe('class 1, the loop: what it says', () => {
  it('has the parts of a class, each with something in it', () => {
    expect(theLoop.number).toBe(1);
    for (const list of [theLoop.build, theLoop.why, theLoop.tries, theLoop.keep, theLoop.words]) expect(list.length).toBeGreaterThan(0);
    const ids = [...theLoop.build, ...theLoop.keep].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const experiment of theLoop.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options[experiment.answer]).toBeDefined();
    }
  });

  it('14.5 mA through the resistor and the LED alike; the LED keeps 2.2 V and the resistor gets 6.8 V', () => {
    const circuit = lit();
    const run = new Work(circuit).run();
    const led = only(circuit, 'led'), r = only(circuit, 'resistor');
    expect(mA(run.amps(led.id))).toBeCloseTo(14.5, 1);
    expect(mA(run.amps(r.id))).toBeCloseTo(mA(run.amps(led.id)), 6);
    expect(run.across(led.id).toFixed(1)).toBe('2.2');
    expect(run.across(r.id).toFixed(1)).toBe('6.8');
    // ...which is Ohm's law, as the class works it
    expect(mA(6.8 / 470)).toBeCloseTo(14.5, 1);
    const why = theLoop.why.map((p) => p.text).join(' ');
    for (const quoted of ['14.5 mA', '9 − 2.2 = 6.8 V', '6.8 V ÷ 470 Ω = 0.0145 A']) expect(why).toContain(quoted);
  });

  it('nothing flows with the switch open', () => {
    const circuit = classCircuit(theLoop);
    expect(new Work(circuit).run().amps(only(circuit, 'led').id)).toBeLessThan(1e-6);
  });

  it('backwards, the LED is dark with the whole 9 V across it', () => {
    const circuit = backwards(lit());
    const work = new Work(circuit);
    const run = work.run();
    expect(Math.abs(run.amps(only(circuit, 'led').id))).toBeLessThan(1e-9);
    expect(run.across(only(circuit, 'led').id)).toBeCloseTo(-9, 3);
    const experiment = tryOut('backwards');
    expect(experiment.made(work)).toBe(true);
    expect(experiment.result(work)).toContain('The whole 9.00 V of the supply');
    expect(experiment.made(new Work(lit()))).toBe(false);
  });

  it('ten times the resistance is a tenth of the current: 1.5 mA, and 6.9 and 0.15 mA for 1 kΩ and 47 kΩ', () => {
    const amps = (ohms: number) => {
      const circuit = withResistor(lit(), ohms);
      return new Work(circuit).run().amps(only(circuit, 'led').id);
    };
    expect(mA(amps(4700))).toBeCloseTo(1.5, 1);
    expect(mA(amps(1000))).toBeCloseTo(6.9, 1);
    expect(mA(amps(47000))).toBeCloseTo(0.15, 2);
    expect(amps(4700) / amps(470)).toBeGreaterThan(0.095);
    expect(amps(4700) / amps(470)).toBeLessThan(0.105);

    const experiment = tryOut('ten-times');
    const work = new Work(withResistor(lit(), 4700));
    expect(experiment.made(work)).toBe(true);
    expect(experiment.result(work)).toMatch(/^1\.49 mA, down from 14\.5 mA/);
    expect(experiment.made(new Work(lit()))).toBe(false);
    // The same resistor lying loose on the canvas is not the change
    expect(experiment.made(new Work(lit().addComponent(resistor(4700, 440, 300))))).toBe(false);
  });

  it('the LED keeps 2.2 V at 470 Ω and still 1.9 V at 47 kΩ', () => {
    const across = (ohms: number) => {
      const circuit = withResistor(lit(), ohms);
      return new Work(circuit).run().across(only(circuit, 'led').id);
    };
    expect(across(470).toFixed(1)).toBe('2.2');
    expect(across(47000).toFixed(1)).toBe('1.9');
  });

  it('a second LED in line: 10.1 mA through both, with 4.8 V left for the resistor', () => {
    const circuit = twoLeds(lit());
    const work = new Work(circuit);
    const run = work.run();
    const [first, second] = circuit.getComponents().filter((c) => c.type === 'led');
    expect(mA(run.amps(first.id))).toBeCloseTo(10.1, 1);
    // One loop, one current (to within what the solver calls converged)
    expect(run.amps(second.id) / run.amps(first.id)).toBeCloseTo(1, 3);
    expect(run.across(only(circuit, 'resistor').id).toFixed(1)).toBe('4.8');
    expect(tryOut('second-led').result(work)).toContain('4.8 V where it had 6.8 V');
    const experiment = tryOut('second-led');
    expect(experiment.made(work)).toBe(true);
    expect(experiment.result(work)).toMatch(/^10\.1 mA through both/);
    expect(experiment.made(new Work(lit()))).toBe(false);
    // A second LED that is only lying there is not in line
    expect(experiment.made(new Work(lit().addComponent(place('led', 660, 300))))).toBe(false);
  });

  it('with no resistor the LED takes over an amp, far more than it stands', () => {
    const circuit = noResistor(lit());
    const work = new Work(circuit);
    const run = work.run();
    const led = only(circuit, 'led');
    expect(run.amps(led.id)).toBeGreaterThan(1);
    expect(run.amps(led.id)).toBeLessThan(2);
    expect(run.strain(led.id)).toBeGreaterThan(1);
    expect(run.strain(only(circuit, 'power').id)).toBeGreaterThan(1);
    const experiment = tryOut('no-resistor');
    expect(experiment.made(work)).toBe(true);
    expect(experiment.result(work)).toMatch(/^1\.3\d A, where the LED is built for 0\.02 A/);
    // With its resistor nothing is strained
    const whole = new Work(lit());
    expect(experiment.made(whole)).toBe(false);
    for (const part of lit().getComponents()) expect(whole.run().strain(part.id)).toBeLessThan(1);
  });

  it('a 470 Ω dropped onto the wire from the switch to the LED puts the light back as it was', () => {
    const bare = noResistor(lit());
    const mended = spliceIntoWire(bare, resistor(470, 440, 200), wireBetween(bare, only(bare, 'switch'), only(bare, 'led')));
    const work = new Work(mended);
    expect(mA(work.run().amps(only(mended, 'led').id))).toBeCloseTo(14.5, 1);
    expect(tryOut('no-resistor').made(work)).toBe(false);
    expect(mended.getConnections()).toHaveLength(lit().getConnections().length);
  });

  it('every experiment is found with the switch open too: it is the change that counts', () => {
    const open = (circuit: Circuit) => set(circuit, only(circuit, 'switch'), { closed: 0 });
    expect(tryOut('backwards').made(new Work(open(backwards(lit()))))).toBe(true);
    expect(tryOut('ten-times').made(new Work(open(withResistor(lit(), 4700))))).toBe(true);
    expect(tryOut('second-led').made(new Work(open(twoLeds(lit()))))).toBe(true);
    expect(tryOut('no-resistor').made(new Work(open(noResistor(lit()))))).toBe(true);
  });
});

describe('class 1, the loop: the check', () => {
  it('is not passed by the light as built', () => {
    const work = new Work(lit());
    expect(theLoop.check.passed(work)).toBe(false);
    expect(theLoop.check.reading(work)).toBe('Your LED: 14.5 mA');
  });

  it('is passed with the 3.3 kΩ the hint ends on, and with the 3,500 Ω it works out', () => {
    for (const ohms of [3300, 3500]) {
      const work = new Work(withResistor(lit(), ohms));
      expect(theLoop.check.passed(work)).toBe(true);
    }
    expect(theLoop.check.reading(new Work(withResistor(lit(), 3300)))).toBe('Your LED: 2.12 mA');
    expect(theLoop.check.hint).toContain('3.3 kΩ');
  });

  it('has nothing to read before there is an LED', () => {
    expect(theLoop.check.reading(new Work(new Circuit('empty')))).toBeNull();
    expect(theLoop.check.passed(new Work(new Circuit('empty')))).toBe(false);
  });
});

describe('class 1, the loop: the steps', () => {
  const done = (steps: Step[], work: Work) => steps.filter((s) => s.done(work)).map((s) => s.id);

  it('none are done on an empty canvas', () => {
    expect(done(theLoop.build, new Work(new Circuit('empty'), playing))).toEqual(['play']);
    expect(done(theLoop.build, new Work(new Circuit('empty')))).toEqual([]);
    expect(done(theLoop.keep, new Work(new Circuit('empty')))).toEqual([]);
  });

  it('each is done as its part or wire arrives', () => {
    const { components, connections } = theLoop.circuit();
    const [supply, supplyGround, light, limit, led, ledGround] = components;
    let circuit = new Circuit('mine');
    const now = () => done(theLoop.build, new Work(circuit));
    circuit = circuit.addComponent(supply);
    expect(now()).toEqual(['supply']);
    circuit = circuit.addComponent(supplyGround);
    expect(now()).toEqual(['supply', 'ground']);
    circuit = circuit.addConnection(connections[0]);
    expect(now()).toEqual(['supply', 'ground', 'return']);
    circuit = circuit.addComponent(light).addComponent({ ...limit, parameters: { ...limit.parameters, resistance: 1000 } }).addComponent(led);
    // A resistor of another value is not the one asked for
    expect(now()).toEqual(['supply', 'ground', 'return', 'switch', 'led']);
    circuit = circuit.updateComponent(limit.id, { parameters: limit.parameters });
    expect(now()).toEqual(['supply', 'ground', 'return', 'switch', 'resistor', 'led']);
    // Two parts that both hang off the supply are not wired to each other
    circuit = circuit.addConnection(connections[1]);
    expect(now()).toContain('wire-switch');
    expect(now()).not.toContain('wire-resistor');
    circuit = circuit.addConnection(connections[2]);
    expect(now()).toContain('wire-resistor');
    expect(now()).not.toContain('wire-led');
    circuit = circuit.addConnection(connections[3]);
    expect(now()).toContain('wire-led');
    expect(now()).not.toContain('wire-ground');
    circuit = circuit.addComponent(ledGround).addConnection(connections[4]);
    expect(now()).toEqual(theLoop.build.map((s) => s.id).filter((id) => !['play', 'light', 'meter'].includes(id)));
  });

  it('the last three want it playing, lit, and the LED clicked', () => {
    const circuit = classCircuit(theLoop);
    const led = only(circuit, 'led');
    expect(step(theLoop.build, 'light').done(new Work(circuit, playing))).toBe(false); // the switch is open
    expect(step(theLoop.build, 'light').done(new Work(close(circuit)))).toBe(false);   // it is not playing
    expect(step(theLoop.build, 'light').done(new Work(close(circuit), playing))).toBe(true);
    expect(step(theLoop.build, 'meter').done(new Work(close(circuit), playing))).toBe(false);
    expect(step(theLoop.build, 'meter').done(new Work(close(circuit), { ...playing, selected: [led.id] }))).toBe(true);
  });

  it('a loop wired in another order counts, because it works', () => {
    // Resistor first, then the switch, then the LED
    const supply = place('power', 200, 240), gnd = place('ground', 200, 340);
    const limit = resistor(470, 320, 160), light = place('switch', 440, 160), led = place('led', 560, 160);
    let circuit = new Circuit('mine');
    for (const part of [supply, gnd, limit, light, led]) circuit = circuit.addComponent(part);
    for (const wire of [connect(supply, 1, gnd, 0), connect(supply, 0, limit, 0), connect(limit, 1, light, 0),
      connect(light, 1, led, 0), connect(led, 1, gnd, 0)]) circuit = circuit.addConnection(wire);
    const ids = done(theLoop.build, new Work(circuit));
    for (const id of ['wire-switch', 'wire-resistor', 'wire-led', 'wire-ground']) expect(ids).toContain(id);
  });

  it('keeping it: the switch named LIGHT, a look at the cover, and a save', () => {
    const circuit = classCircuit(theLoop);
    const named = circuit.updateComponent(only(circuit, 'switch').id, { label: 'light' });
    expect(step(theLoop.keep, 'name').done(new Work(circuit))).toBe(false);
    expect(step(theLoop.keep, 'name').done(new Work(named))).toBe(true);
    expect(step(theLoop.keep, 'cover').done(new Work(named, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(theLoop.keep, 'cover').done(new Work(named, playing))).toBe(false);
    expect(step(theLoop.keep, 'save').done(new Work(named, { ...playing, saved: true }))).toBe(true);
    expect(step(theLoop.keep, 'save').done(new Work(new Circuit('empty'), { ...playing, saved: true }))).toBe(false);
  });
});
