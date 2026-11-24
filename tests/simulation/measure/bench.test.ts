/**
 * The bench: a circuit run away from the sound card and read. It is what the
 * classes check a learner's circuit with, so it must read what the playing
 * circuit would show.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { runOnBench } from '@/simulation/measure/bench';
import { serializeCircuit } from '@/utils/serializeCircuit';
import { connect, ground, place, resistor, exampleCircuits } from '@/examples/circuits';
import type { Component, Connection } from '@/types/circuit';
import { ALL_PARTS } from '../../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

function bench(components: Component[], connections: Connection[], options?: Parameters<typeof runOnBench>[2]) {
  let circuit = new Circuit('bench');
  for (const c of components) circuit = circuit.addComponent(c);
  for (const c of connections) circuit = circuit.addConnection(c);
  const serialized = serializeCircuit(circuit);
  return runOnBench(serialized.components, serialized.connections, options);
}

describe('runOnBench', () => {
  it('reads the current through and the voltage across each part of a divider', () => {
    const supply = place('power', 0, 0), gnd = ground(0, 100);
    const top = resistor(2000, 100, 0), bottom = resistor(1000, 200, 0);
    const run = bench([supply, gnd, top, bottom], [
      connect(supply, 1, gnd, 0), connect(supply, 0, top, 0), connect(top, 1, bottom, 0), connect(bottom, 1, gnd, 0),
    ], { watch: [{ componentId: top.id, pinId: top.pins[1].id }] });
    expect(run.amps(top.id)).toBeCloseTo(0.003, 6);
    expect(run.amps(bottom.id)).toBeCloseTo(0.003, 6);
    expect(run.across(top.id)).toBeCloseTo(6, 4);
    expect(run.across(bottom.id)).toBeCloseTo(3, 4);
    expect(run.volts(top.id, top.pins[1].id)).toMatchObject({ hertz: null });
    expect(run.volts(top.id, top.pins[1].id).mean).toBeCloseTo(3, 4);
    // The supply's current runs out of its + pin, so it reads negative
    expect(run.amps(supply.id)).toBeCloseTo(-0.003, 6);
    expect(run.strain(top.id)).toBeCloseTo((6 * 0.003) / 0.25, 3);
  });

  it('says a resistor asked for more than a quarter of a watt is overloaded, and one asked for less is not', () => {
    const supply = place('power', 0, 0), gnd = ground(0, 100);
    const hot = resistor(100, 100, 0), cool = resistor(10000, 200, 0);
    const run = bench([supply, gnd, hot, cool], [
      connect(supply, 1, gnd, 0), connect(supply, 0, hot, 0), connect(hot, 1, gnd, 0),
      connect(supply, 0, cool, 0), connect(cool, 1, gnd, 0),
    ]);
    expect(run.strain(hot.id)).toBeCloseTo(0.81 / 0.25, 2);
    expect(run.strain(cool.id)).toBeLessThan(0.1);
    expect(run.strain(supply.id)).toBeLessThan(1);
  });

  it('runs the circuit with controls put another way, without changing what it was given', () => {
    const supply = place('power', 0, 0), gnd = ground(0, 100);
    const sw = place('switch', 100, 0), r = resistor(1000, 200, 0);
    const parts = [supply, gnd, sw, r];
    const wires = [connect(supply, 1, gnd, 0), connect(supply, 0, sw, 0), connect(sw, 1, r, 0), connect(r, 1, gnd, 0)];
    expect(bench(parts, wires).amps(r.id)).toBeLessThan(1e-6);
    expect(bench(parts, wires, { set: [{ componentId: sw.id, parameter: 'closed', value: 1 }] }).amps(r.id)).toBeCloseTo(0.009, 5);
    expect(sw.parameters.closed).toBeFalsy();
  });

  it('answers 0 for what it was not asked to watch or cannot know', () => {
    const supply = place('power', 0, 0), gnd = ground(0, 100);
    const run = bench([supply, gnd], [connect(supply, 1, gnd, 0)]);
    expect(run.amps('nobody')).toBe(0);
    expect(run.across('nobody')).toBe(0);
    expect(run.volts(supply.id, supply.pins[0].id)).toEqual({ mean: 0, min: 0, max: 0, hertz: null });
    expect(run.sound.hertz).toBeNull();
  });

  it('hears an oscillator, and reads the same pitch on its output pin', () => {
    const example = exampleCircuits.find((e) => e.name === 'Simple Oscillator')!;
    const built = example.build();
    const out = built.components.find((c) => c.type === 'audio-output')!;
    const run = bench(built.components, built.connections, { seconds: 0.2, watch: [{ componentId: out.id, pinId: out.pins[0].id }] });
    expect(run.sound.hertz).toBeGreaterThan(20);
    expect(run.volts(out.id, out.pins[0].id).hertz).toBeCloseTo(run.sound.hertz!, 0);
    expect(run.seconds).toBe(0.2);
  });
});
