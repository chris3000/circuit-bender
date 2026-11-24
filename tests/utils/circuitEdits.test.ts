/**
 * Edits that keep a circuit wired: a part dropped into a wire, a part taken
 * out of one, a part swapped for another.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { connect, exampleCircuits, ground, place, resistor } from '@/examples/circuits';
import { theLoop } from '@/classes/theLoop';
import { classCircuit } from '@/classes';
import { Work } from '@/classes/Work';
import type { Component, Connection } from '@/types/circuit';
import {
  fitsInPlaceOf, joinAtWire, removeFromCircuit, replacePart, rotateParts, similarParts, spliceIntoWire, throughPins,
} from '@/utils/circuitEdits';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

const definition = (type: string) => ALL_PARTS.find((d) => d.type === type)!;

function circuitOf(components: Component[], connections: Connection[]): Circuit {
  let circuit = new Circuit('test');
  for (const component of components) circuit = circuit.addComponent(component);
  for (const connection of connections) circuit = circuit.addConnection(connection);
  return circuit;
}

/** Whether a wire runs straight between two pins. */
function wired(circuit: Circuit, a: Component, pinA: number, b: Component, pinB: number): boolean {
  const from = `${a.id}::${a.pins[pinA].id}`, to = `${b.id}::${b.pins[pinB].id}`;
  return circuit.getConnections().some((c) => {
    const ends = [`${c.from.componentId}::${c.from.pinId}`, `${c.to.componentId}::${c.to.pinId}`];
    return ends.includes(from) && ends.includes(to);
  });
}

/** Supply, switch, resistor, LED and ground in one loop: class 1's circuit. */
function loop() {
  const circuit = classCircuit(theLoop);
  const one = (type: string) => circuit.getComponents().find((c) => c.type === type)!;
  return { circuit, supply: one('power'), toggle: one('switch'), r: one('resistor'), led: one('led') };
}

describe('the pins a wire runs through a part by', () => {
  it('are both legs of a part with two', () => {
    for (const type of ['resistor', 'capacitor', 'led', '1n914', 'switch', 'pushbutton', 'ldr', 'body-contact', 'speaker']) {
      expect(throughPins(definition(type)), type).toEqual([0, 1]);
    }
  });

  it('are none for a part with one leg, or for the supply', () => {
    for (const type of ['ground', 'audio-output', 'junction', 'power']) expect(throughPins(definition(type)), type).toBeNull();
  });

  it('are named by every part with more than two legs, and are two different legs it has', () => {
    for (const d of ALL_PARTS) {
      if (d.pins.length <= 2) continue;
      const through = throughPins(d);
      expect(through, d.type).not.toBeNull();
      const [a, b] = through!;
      expect(a, d.type).not.toBe(b);
      expect(d.pins[a], d.type).toBeDefined();
      expect(d.pins[b], d.type).toBeDefined();
      // Never a supply pin: a wire does not run through a chip by its power
      expect(['power', 'ground'], d.type).not.toContain(d.pins[a].type);
      expect(['power', 'ground'], d.type).not.toContain(d.pins[b].type);
    }
  });

  it('are the end and the wiper of a pot, and the collector and emitter of a transistor', () => {
    expect(throughPins(definition('potentiometer'))).toEqual([0, 1]);
    expect(throughPins(definition('2n3904'))).toEqual([1, 2]);
  });
});

describe('dropping a part into a wire', () => {
  function oneWire() {
    const a = resistor(1000, 100, 100), b = resistor(2200, 400, 100);
    const w = { ...connect(a, 1, b, 0), color: 'green' };
    return { a, b, w, circuit: circuitOf([a, b], [w]) };
  }

  it('cuts the wire and puts the part between its two ends', () => {
    const { a, b, w, circuit } = oneWire();
    const led = place('led', 250, 100);
    const next = spliceIntoWire(circuit, led, w.id);
    expect(next.getComponent(led.id)).toBeDefined();
    expect(next.getConnections()).toHaveLength(2);
    expect(next.getConnections().some((c) => c.id === w.id)).toBe(false);
    expect(wired(next, a, 1, led, 0)).toBe(true);
    expect(wired(next, led, 1, b, 0)).toBe(true);
    expect(wired(next, a, 1, b, 0)).toBe(false);
  });

  it('wires the part the other way round when asked', () => {
    const { a, b, w, circuit } = oneWire();
    const led = place('led', 250, 100);
    const next = spliceIntoWire(circuit, led, w.id, true);
    expect(wired(next, a, 1, led, 1)).toBe(true);
    expect(wired(next, led, 0, b, 0)).toBe(true);
  });

  it('gives both halves the color the wire had', () => {
    const { w, circuit } = oneWire();
    const next = spliceIntoWire(circuit, place('switch', 250, 100), w.id);
    expect(next.getConnections().map((c) => c.color)).toEqual(['green', 'green']);
  });

  it('uses the through pins of a part with more legs', () => {
    const { a, b, w, circuit } = oneWire();
    const pot = place('potentiometer', 250, 100);
    const next = spliceIntoWire(circuit, pot, w.id);
    expect(wired(next, a, 1, pot, 0)).toBe(true);
    expect(wired(next, pot, 1, b, 0)).toBe(true);
    const chip = place('cd40106', 250, 100);
    const gated = spliceIntoWire(circuit, chip, w.id);
    expect(wired(gated, a, 1, chip, 0)).toBe(true); // 1A
    expect(wired(gated, chip, 6, b, 0)).toBe(true); // 1Y
  });

  it('moves and turns a part that is already on the canvas', () => {
    const { a, b, w, circuit } = oneWire();
    const loose = place('capacitor', 300, 300);
    const there = circuit.addComponent(loose);
    const next = spliceIntoWire(there, { ...loose, position: { x: 250, y: 100 }, rotation: 90 }, w.id);
    expect(next.getComponents()).toHaveLength(3);
    expect(next.getComponent(loose.id)!.position).toEqual({ x: 250, y: 100 });
    expect(next.getComponent(loose.id)!.rotation).toBe(90);
    expect(wired(next, a, 1, loose, 0)).toBe(true);
    expect(wired(next, loose, 1, b, 0)).toBe(true);
  });

  it('leaves the circuit alone for a part that cannot sit in a wire, or a wire that is not there', () => {
    const { a, w, circuit } = oneWire();
    expect(spliceIntoWire(circuit, ground(250, 100), w.id)).toBe(circuit);
    expect(spliceIntoWire(circuit, place('power', 250, 100), w.id)).toBe(circuit);
    expect(spliceIntoWire(circuit, place('led', 250, 100), 'nope' as never)).toBe(circuit);
    // ...or a part into its own wire
    expect(spliceIntoWire(circuit, a, w.id)).toBe(circuit);
  });

  it('is undone by deleting the part', () => {
    const { a, b, w, circuit } = oneWire();
    const led = place('led', 250, 100);
    const back = removeFromCircuit(spliceIntoWire(circuit, led, w.id), [led.id]);
    expect(back.getComponents()).toHaveLength(2);
    expect(back.getConnections()).toHaveLength(1);
    expect(wired(back, a, 1, b, 0)).toBe(true);
    expect(back.getConnections()[0].color).toBe('green');
  });
});

describe('joining a wire to a wire', () => {
  function oneWire() {
    const a = resistor(1000, 100, 100), b = resistor(2200, 500, 100), c = resistor(4700, 300, 300);
    const w = { ...connect(a, 1, b, 0), color: 'green' };
    return { a, b, c, w, circuit: circuitOf([a, b, c], [w]) };
  }

  it('cuts the wire at a dot and brings the new wire to it', () => {
    const { a, b, c, w, circuit } = oneWire();
    const dot = place('junction', 300, 100);
    const next = joinAtWire(circuit, w.id, dot, { componentId: c.id, pinId: c.pins[0].id });
    expect(next.getComponent(dot.id)).toBeDefined();
    expect(next.getConnections()).toHaveLength(3);
    expect(wired(next, a, 1, dot, 0)).toBe(true);
    expect(wired(next, dot, 0, b, 0)).toBe(true);
    expect(wired(next, c, 0, dot, 0)).toBe(true);
    expect(wired(next, a, 1, b, 0)).toBe(false);
    expect(next.getConnections().map((x) => x.color)).toEqual(['green', 'green', 'green']);
  });

  it('just puts a dot in the wire when nothing is brought to it', () => {
    const { a, b, w, circuit } = oneWire();
    const dot = place('junction', 300, 100);
    const next = joinAtWire(circuit, w.id, dot);
    expect(next.getConnections()).toHaveLength(2);
    expect(wired(next, a, 1, dot, 0)).toBe(true);
    expect(wired(next, dot, 0, b, 0)).toBe(true);
  });

  it('leaves the circuit alone for a wire that is not there, or a pin already on the wire', () => {
    const { a, w, circuit } = oneWire();
    const dot = place('junction', 300, 100);
    expect(joinAtWire(circuit, 'nothing' as Connection['id'], dot)).toBe(circuit);
    expect(joinAtWire(circuit, w.id, dot, { componentId: a.id, pinId: a.pins[1].id })).toBe(circuit);
  });

  it('is undone by deleting the dot, once the third wire is off it', () => {
    const { a, b, w, circuit } = oneWire();
    const dot = place('junction', 300, 100);
    const back = removeFromCircuit(joinAtWire(circuit, w.id, dot), [dot.id]);
    expect(back.getConnections()).toHaveLength(1);
    expect(wired(back, a, 1, b, 0)).toBe(true);
  });
});

describe('turning parts', () => {
  it('turns each a quarter turn, either way, and comes back round', () => {
    const a = resistor(1000, 100, 100), b = { ...place('led', 300, 100), rotation: 270 };
    const circuit = circuitOf([a, b], []);
    const on = rotateParts(circuit, [a.id, b.id], 90);
    expect([on.getComponent(a.id)!.rotation, on.getComponent(b.id)!.rotation]).toEqual([90, 0]);
    const back = rotateParts(circuit, [a.id, b.id], -90);
    expect([back.getComponent(a.id)!.rotation, back.getComponent(b.id)!.rotation]).toEqual([270, 180]);
  });

  it('leaves a junction dot, and a circuit with nothing in it to turn', () => {
    const dot = place('junction', 300, 100);
    const circuit = circuitOf([dot], []);
    expect(rotateParts(circuit, [dot.id], 90)).toBe(circuit);
    expect(rotateParts(circuit, ['gone' as Component['id']], 90)).toBe(circuit);
  });
});

describe('deleting a part', () => {
  it('closes the wire a part sat in, so the loop is still a loop', () => {
    const { circuit, toggle, r, led } = loop();
    const next = removeFromCircuit(circuit, [r.id]);
    expect(next.getComponent(r.id)).toBeUndefined();
    expect(wired(next, toggle, 1, led, 0)).toBe(true);
    expect(next.getConnections()).toHaveLength(circuit.getConnections().length - 1);
    // The LED has the supply to itself now: far too much current
    const run = new Work(next).run([{ componentId: toggle.id, parameter: 'closed', value: 1 }]);
    expect(run.strain(led.id)).toBeGreaterThan(1);
  });

  it('closes it for each part of a row deleted together', () => {
    const { circuit, supply, toggle, r, led } = loop();
    const next = removeFromCircuit(circuit, [toggle.id, r.id]);
    expect(wired(next, supply, 0, led, 0)).toBe(true);
  });

  it('never wires the supply to itself: the last part in the loop just goes', () => {
    const { circuit, toggle, r, led } = loop();
    const next = removeFromCircuit(circuit, [toggle.id, r.id, led.id]);
    // What is left is the supply and its ground, with the one wire between them
    expect(next.getComponents().map((c) => c.type).sort()).toEqual(['ground', 'ground', 'power']);
    expect(next.getConnections()).toHaveLength(1);
  });

  it('leaves a gap where the part had only one wire', () => {
    const a = resistor(1000, 100, 100), b = resistor(2200, 300, 100), c = resistor(4700, 500, 100);
    const circuit = circuitOf([a, b, c], [connect(a, 1, b, 0)]);
    const next = removeFromCircuit(circuit, [b.id]);
    expect(next.getConnections()).toHaveLength(0);
  });

  it('does not close a wire the part was deleted along with', () => {
    const a = resistor(1000, 100, 100), b = resistor(2200, 300, 100), c = resistor(4700, 500, 100);
    const left = connect(a, 1, b, 0), right = connect(b, 1, c, 0);
    const next = removeFromCircuit(circuitOf([a, b, c], [left, right]), [b.id], [left.id]);
    expect(next.getConnections()).toHaveLength(0);
  });

  it('does not short what the part sat across', () => {
    // One of two resistors side by side
    const a = place('led', 100, 100), b = place('led', 500, 100);
    const r1 = resistor(1000, 300, 60), r2 = resistor(1000, 300, 140);
    const side = circuitOf([a, b, r1, r2], [connect(a, 1, r1, 0), connect(r1, 1, b, 0), connect(a, 1, r2, 0), connect(r2, 1, b, 0)]);
    expect(wired(removeFromCircuit(side, [r1.id]), a, 1, b, 0)).toBe(false);
    expect(removeFromCircuit(side, [r1.id]).getConnections()).toHaveLength(2);

    // The resistor from an inverter's output back to its input, and the capacitor from its input to ground
    const { components, connections } = exampleCircuits.find((e) => e.name === 'Simple Oscillator')!.build();
    const osc = circuitOf(components, connections);
    const chip = components.find((c) => c.type === 'cd40106')!;
    for (const type of ['resistor', 'capacitor']) {
      for (const part of components.filter((c) => c.type === type)) {
        const netOf = (circuit: Circuit, pin: number) => new Work(circuit).net(chip, pin);
        const before = [netOf(osc, 0), netOf(osc, 6), netOf(osc, 13)];
        expect(new Set(before).size).toBe(3);
        const after = removeFromCircuit(osc, [part.id]);
        // Input, output and ground are still three different places
        expect(new Set([netOf(after, 0), netOf(after, 6), netOf(after, 13)]).size, `${type} ${String(part.parameters.value)}`).toBe(3);
      }
    }
  });

  it('keeps everything joined that met at a leg with several wires', () => {
    const a = resistor(1000, 100, 100), mid = resistor(2200, 300, 100), b = resistor(4700, 500, 60), c = resistor(4700, 500, 140);
    const circuit = circuitOf([a, mid, b, c], [connect(a, 1, mid, 0), connect(mid, 1, b, 0), connect(mid, 1, c, 0)]);
    const next = removeFromCircuit(circuit, [mid.id]);
    const work = new Work(next);
    expect(work.joined(a, 1, b, 0)).toBe(true);
    expect(work.joined(a, 1, c, 0)).toBe(true);
    expect(next.getConnections()).toHaveLength(2);
  });

  it('closes a chip only when nothing but its through pins (and supply) is wired', () => {
    const a = resistor(1000, 100, 100), b = resistor(2200, 500, 100), chip = place('cd40106', 300, 100);
    const plus = place('power', 300, -100);
    const inWire = circuitOf([a, b, chip, plus], [connect(a, 1, chip, 0), connect(chip, 6, b, 0), connect(plus, 0, chip, 12)]);
    expect(wired(removeFromCircuit(inWire, [chip.id]), a, 1, b, 0)).toBe(true);
    const busy = inWire.addConnection(connect(a, 0, chip, 1));
    expect(removeFromCircuit(busy, [chip.id]).getConnections()).toHaveLength(0);
  });

  it('joins the two wires of a junction dot, and drops the wires of one with more', () => {
    const a = resistor(1000, 100, 100), b = resistor(2200, 500, 100), c = resistor(4700, 300, 300);
    const dot = place('junction', 300, 100);
    const two = circuitOf([a, b, c, dot], [{ ...connect(a, 1, dot, 0), color: 'blue' }, connect(dot, 0, b, 0)]);
    const joined = removeFromCircuit(two, [dot.id]);
    expect(wired(joined, a, 1, b, 0)).toBe(true);
    expect(joined.getConnections()[0].color).toBe('blue');
    const three = two.addConnection(connect(dot, 0, c, 0));
    expect(removeFromCircuit(three, [dot.id]).getConnections()).toHaveLength(0);
  });

  it('takes off wires on their own, and ignores what is not there', () => {
    const { circuit, r } = loop();
    const first = circuit.getConnections()[0];
    expect(removeFromCircuit(circuit, [], [first.id]).getConnections()).toHaveLength(circuit.getConnections().length - 1);
    expect(removeFromCircuit(circuit, ['nope' as never], ['nor-this' as never])).toBe(circuit);
    expect(removeFromCircuit(circuit, [r.id, r.id]).getComponent(r.id)).toBeUndefined();
  });
});

describe('swapping a part', () => {
  it('changes only the value for another value of the same part', () => {
    const { circuit, r } = loop();
    const { circuit: next, id } = replacePart(circuit, r.id, definition('resistor'), { resistance: 3300, value: '3.3k' });
    expect(id).toBe(r.id);
    expect(next.getComponent(r.id)!.parameters).toMatchObject({ resistance: 3300, value: '3.3k' });
    expect(next.getConnections()).toEqual(circuit.getConnections());
    // The value it has already is no change at all
    expect(replacePart(next, r.id, definition('resistor'), { resistance: 3300, value: '3.3k' }).circuit).toBe(next);
  });

  it('puts the new part where the old one was, turned the same way, with its name and wires', () => {
    const { circuit, toggle, r, led } = loop();
    const named = circuit.updateComponent(r.id, { label: 'DIM', rotation: 90 });
    const { circuit: next, id } = replacePart(named, r.id, definition('ldr'));
    const cell = next.getComponent(id)!;
    expect(id).not.toBe(r.id);
    expect(next.getComponent(r.id)).toBeUndefined();
    expect(cell).toMatchObject({ type: 'ldr', position: r.position, rotation: 90, label: 'DIM' });
    expect(next.getConnections()).toHaveLength(circuit.getConnections().length);
    expect(wired(next, toggle, 1, cell, 0)).toBe(true);
    expect(wired(next, cell, 1, led, 0)).toBe(true);
  });

  it('keeps the wires\' own ids and colors', () => {
    const { circuit, r } = loop();
    const onIt = circuit.getConnections().filter((c) => c.from.componentId === r.id || c.to.componentId === r.id);
    const colored = circuit.updateConnection(onIt[0].id, { color: 'red' });
    const { circuit: next } = replacePart(colored, r.id, definition('ldr'));
    expect(next.getConnections().map((c) => c.id).sort()).toEqual(circuit.getConnections().map((c) => c.id).sort());
    expect(next.getConnections().find((c) => c.id === onIt[0].id)!.color).toBe('red');
  });

  it('takes a resistor\'s two wires to a pot\'s end and wiper, and gives it the value asked for', () => {
    const { circuit, toggle, r, led } = loop();
    const { circuit: next, id } = replacePart(circuit, r.id, definition('potentiometer'), { maxResistance: 10000, value: '10k' });
    const pot = next.getComponent(id)!;
    expect(pot.parameters).toMatchObject({ maxResistance: 10000, value: '10k', position: 0.5 });
    expect(wired(next, toggle, 1, pot, 0)).toBe(true);
    expect(wired(next, pot, 1, led, 0)).toBe(true);
  });

  it('matches legs by name where the names agree', () => {
    const { circuit, r, led } = loop();
    const { circuit: next, id } = replacePart(circuit, led.id, definition('1n914'));
    const diode = next.getComponent(id)!;
    expect(wired(next, r, 1, diode, 0)).toBe(true); // A
    expect(new Work(next).grounded(diode, 1)).toBe(true); // K

    // A chip's supply stays on its supply pins, whatever else moves
    const { components, connections } = exampleCircuits.find((e) => e.name === 'Simple Oscillator')!.build();
    const osc = circuitOf(components, connections);
    const chip = components.find((c) => c.type === 'cd40106')!;
    const swapped = replacePart(osc, chip.id, definition('cd4093'));
    const nand = swapped.circuit.getComponent(swapped.id)!;
    const supply = components.find((c) => c.type === 'power')!;
    const after = new Work(swapped.circuit);
    expect(new Work(osc).joined(chip, 12, supply, 0)).toBe(true);
    expect(after.joined(nand, 12, supply, 0)).toBe(true);
    expect(after.grounded(nand, 13)).toBe(true);
    expect(swapped.circuit.getConnections()).toHaveLength(connections.length);
  });

  it('will not put in a part with too few legs for the wires', () => {
    const { circuit, r, led } = loop();
    expect(fitsInPlaceOf(circuit, r.id, definition('ground'))).toBe(false);
    expect(replacePart(circuit, r.id, definition('ground')).circuit).toBe(circuit);
    expect(fitsInPlaceOf(circuit, r.id, definition('potentiometer'))).toBe(true);
    expect(fitsInPlaceOf(circuit, r.id, definition('cd4017'))).toBe(true);
    expect(fitsInPlaceOf(circuit, led.id, definition('audio-output'))).toBe(false);
    // With one wire off, one leg is enough
    const wire = circuit.getConnections().find((c) => c.from.componentId === led.id || c.to.componentId === led.id)!;
    const loose = circuit.removeConnection(wire.id);
    expect(fitsInPlaceOf(loose, led.id, definition('audio-output'))).toBe(true);
    expect(replacePart(loose, led.id, definition('audio-output')).circuit.getConnections()).toHaveLength(loose.getConnections().length);
    expect(fitsInPlaceOf(circuit, 'nope' as never, definition('resistor'))).toBe(false);
  });

  it('never puts two wired legs on one leg of the new part', () => {
    for (const from of ALL_PARTS) {
      const part = place(from.type, 300, 300);
      const others = part.pins.map((_, i) => resistor(1000, 100 * i, 0));
      const circuit = circuitOf([part, ...others], part.pins.map((_, i) => connect(part, i, others[i], 0)));
      for (const to of ALL_PARTS) {
        if (to.type === from.type) continue;
        const fits = fitsInPlaceOf(circuit, part.id, to);
        expect(fits, `${from.type} to ${to.type}`).toBe(to.pins.length >= from.pins.length);
        if (!fits) continue;
        const { circuit: next, id } = replacePart(circuit, part.id, to);
        const legs = next.getConnections().map((c) => (c.from.componentId === id ? c.from.pinId : c.to.pinId));
        expect(new Set(legs).size, `${from.type} to ${to.type}`).toBe(from.pins.length);
      }
    }
  });
});

describe('parts that are alike', () => {
  const alike = (type: string) => similarParts(definition(type), ALL_PARTS).map((d) => d.type);

  it('are the other things that resist, switch, light, count or sound', () => {
    expect(alike('resistor')).toEqual(['potentiometer', 'ldr', 'body-contact', 'optocoupler']);
    expect(alike('potentiometer')).toEqual(['resistor', 'ldr', 'body-contact', 'optocoupler']);
    expect(alike('switch')).toEqual(['pushbutton', 'body-contact', 'spdt']);
    expect(alike('led')).toEqual(['1n914', '1n4004']);
    expect(alike('cd40106')).toEqual(['cd4093', 'cd4049']);
    expect(alike('cd4040')).toEqual(['cd4017', 'cd4013']);
    expect(alike('lm386')).toEqual(['lm741', 'lm324', 'tl072', 'lm13700']);
    expect(alike('speaker')).toEqual(['audio-output', 'piezo']);
    expect(alike('2n3904')).toEqual(['2n5457', '2n3906']);
  });

  it('are none for a part that is like nothing else', () => {
    for (const type of ['capacitor', 'power', 'ground', 'ne555', 'audio-input', 'junction']) expect(alike(type), type).toEqual([]);
  });

  it('go both ways', () => {
    for (const d of ALL_PARTS) {
      for (const other of similarParts(d, ALL_PARTS)) {
        expect(similarParts(other, ALL_PARTS).map((o) => o.type), `${other.type} to ${d.type}`).toContain(d.type);
      }
    }
  });
});
