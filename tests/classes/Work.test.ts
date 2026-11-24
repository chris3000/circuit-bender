/**
 * The learner's work as a class sees it: what is wired to what, and what the
 * circuit does on the bench. And how far they have got, kept in the browser.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { GROUND, Work } from '@/classes/Work';
import { CLASSES, classById, classCircuit, classCircuitName } from '@/classes';
import { SYLLABUS } from '@/classes/syllabus';
import { SECTIONS } from '@/classes/types';
import { NEW_CLASS, readProgress, writeProgress } from '@/classes/progress';
import { connect, ground, place, resistor } from '@/examples/circuits';
import type { Component, Connection } from '@/types/circuit';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

const circuitOf = (components: Component[], connections: Connection[] = []) => {
  let circuit = new Circuit('work');
  for (const c of components) circuit = circuit.addComponent(c);
  for (const c of connections) circuit = circuit.addConnection(c);
  return circuit;
};

describe('Work: what is wired to what', () => {
  it('lists the parts of a kind in the order they were put down', () => {
    const a = resistor(100, 0, 0), b = resistor(200, 100, 0), led = place('led', 200, 0);
    const work = new Work(circuitOf([a, led, b]));
    expect(work.parts('resistor').map((p) => p.id)).toEqual([a.id, b.id]);
    expect(work.parts('capacitor')).toEqual([]);
  });

  it('pins joined by wire share a net, through as many wires as it takes', () => {
    const a = resistor(100, 0, 0), b = resistor(100, 100, 0), c = resistor(100, 200, 0);
    const work = new Work(circuitOf([a, b, c], [connect(a, 1, b, 0), connect(b, 0, c, 0)]));
    expect(work.joined(a, 1, c, 0)).toBe(true);
    expect(work.joined(a, 0, c, 0)).toBe(false);
    // A pin with nothing on it is a net of its own
    expect(work.joined(a, 0, c, 1)).toBe(false);
  });

  it('every ground is the same net, wired together or not', () => {
    const g1 = ground(0, 0), g2 = ground(100, 0), a = resistor(100, 0, 0), b = resistor(100, 100, 0);
    const work = new Work(circuitOf([g1, g2, a, b], [connect(a, 1, g1, 0), connect(b, 1, g2, 0)]));
    expect(work.grounded(a, 1)).toBe(true);
    expect(work.grounded(a, 0)).toBe(false);
    expect(work.joined(a, 1, b, 1)).toBe(true);
    expect(work.net(b, 1)).toBe(GROUND);
  });

  it('finds a part of one kind wired to a part of another, by the pins asked about', () => {
    const supply = place('power', 0, 0), sw = place('switch', 100, 0), led = place('led', 200, 0);
    const work = new Work(circuitOf([supply, sw, led], [connect(supply, 0, sw, 1)]));
    expect(work.wired('power', [0], 'switch', [0, 1])).toBe(true);
    expect(work.wired('power', [1], 'switch', [0, 1])).toBe(false);
    expect(work.wired('switch', [0, 1], 'led', [0])).toBe(false);
  });

  it('two parts that only share a rail are not wired to each other', () => {
    const supply = place('power', 0, 0), a = resistor(100, 0, 0), b = resistor(100, 100, 0);
    const work = new Work(circuitOf([supply, a, b], [connect(supply, 0, a, 0), connect(supply, 0, b, 0)]));
    expect(work.wired('resistor', [0, 1], 'resistor', [0, 1])).toBe(true);
    expect(work.wired('resistor', [0, 1], 'resistor', [0, 1], [work.net(supply, 0)])).toBe(false);
  });
});

describe('Work: what the circuit does', () => {
  const loop = () => {
    const supply = place('power', 0, 0), gnd = ground(0, 100), sw = place('switch', 100, 0), r = resistor(1000, 200, 0);
    return { sw, r, circuit: circuitOf([supply, gnd, sw, r], [connect(supply, 1, gnd, 0), connect(supply, 0, sw, 0), connect(sw, 1, r, 0), connect(r, 1, gnd, 0)]) };
  };

  it('runs the circuit as it stands, or with its controls put another way', () => {
    const { sw, r, circuit } = loop();
    const work = new Work(circuit);
    expect(work.run().amps(r.id)).toBeLessThan(1e-6);
    expect(work.run([{ componentId: sw.id, parameter: 'closed', value: 1 }]).amps(r.id)).toBeCloseTo(0.009, 5);
  });

  it('measures a circuit once: the same circuit asked again is not run again', () => {
    const { circuit } = loop();
    const first = new Work(circuit).run();
    expect(new Work(circuit).run()).toBe(first);
    // An edit is another circuit
    const edited = circuit.updateComponent(circuit.getComponents()[3].id, { position: { x: 5, y: 5 } });
    expect(new Work(edited).run()).not.toBe(first);
  });

  it('reads nothing, rather than failing, from a canvas with nothing on it', () => {
    const run = new Work(new Circuit('empty')).run();
    expect(run.amps('anything')).toBe(0);
    expect(run.sound.hertz).toBeNull();
  });
});

describe('the course', () => {
  it('has 14 classes in 5 units, numbered in order', () => {
    const all = SYLLABUS.flatMap((unit) => unit.classes);
    expect(SYLLABUS).toHaveLength(5);
    expect(all.map((c) => c.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it('every class that is built is in the course under its own number and title', () => {
    const all = SYLLABUS.flatMap((unit) => unit.classes);
    for (const definition of CLASSES) {
      const entry = all.find((c) => c.id === definition.id)!;
      expect(entry).toBeDefined();
      expect(entry.number).toBe(definition.number);
      expect(entry.title).toBe(definition.title);
      expect(classById(definition.id)).toBe(definition);
      expect(classCircuit(definition).name).toBe(classCircuitName(definition));
    }
    expect(classById('no-such-class')).toBeUndefined();
    expect(classById(null)).toBeUndefined();
  });

  it('a class has the same six parts, in the same order, every time', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['build', 'why', 'try', 'check', 'keep', 'words']);
  });

  it('class text keeps to plain punctuation: no dashes', () => {
    for (const definition of CLASSES) {
      const text = JSON.stringify(definition, (_key, value) => (typeof value === 'function' ? undefined : value));
      expect(text).not.toMatch(/[—–]/);
    }
  });
});

describe('progress', () => {
  beforeEach(() => localStorage.clear());

  it('starts with no class open and none begun', () => {
    expect(readProgress()).toEqual({ open: null, classes: {} });
  });

  it('remembers which class is open and how far it has got', () => {
    const progress = { open: 'the-loop', classes: { 'the-loop': { ...NEW_CLASS, section: 2, done: ['supply'], guesses: { backwards: 1 }, results: { backwards: 'Dark.' }, finished: true } } };
    writeProgress(progress);
    expect(readProgress()).toEqual(progress);
  });

  it('makes sense of whatever it finds stored', () => {
    localStorage.setItem('circuit_bender_classes', 'not json');
    expect(readProgress()).toEqual({ open: null, classes: {} });
    localStorage.setItem('circuit_bender_classes', JSON.stringify({ open: 7, classes: { a: { section: 'x', done: [1, 'ok'], finished: 'yes' }, b: null } }));
    expect(readProgress()).toEqual({ open: null, classes: { a: { ...NEW_CLASS, done: ['ok'] } } });
    localStorage.setItem('circuit_bender_classes', JSON.stringify([1, 2]));
    expect(readProgress()).toEqual({ open: null, classes: {} });
  });
});
