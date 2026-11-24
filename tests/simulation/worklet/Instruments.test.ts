/**
 * What the worklet watches in the running circuit: how bright the LEDs are,
 * which parts are overloaded, and the meter.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { createStandardModels } from '@/simulation/models/standardModels';
import { Instruments, type InstrumentReport } from '@/simulation/worklet/Instruments';
import { serializeCircuit } from '@/utils/serializeCircuit';
import { connect, ground, place, resistor, exampleCircuits } from '@/examples/circuits';
import type { Component, Connection } from '@/types/circuit';
import { ALL_PARTS } from '../../views/allParts';

const RATE = 48000;

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

/** A circuit in a solver with its instruments, as the worklet holds them. */
function running(components: Component[], connections: Connection[]) {
  let circuit = new Circuit('t');
  for (const c of components) circuit = circuit.addComponent(c);
  for (const c of connections) circuit = circuit.addConnection(c);
  const serialized = serializeCircuit(circuit);
  const solver = new MNASolver(createStandardModels());
  solver.loadCircuit(serialized.components, serialized.connections);
  const instruments = new Instruments(solver, RATE);
  instruments.load(serialized.components);
  /** Run for a time, a block of 128 samples at a go; everything reported meanwhile. */
  const play = (seconds: number): InstrumentReport[] => {
    const reports: InstrumentReport[] = [];
    for (let done = 0; done < seconds * RATE; done += 128) {
      for (let i = 0; i < 128; i++) { solver.step(1 / RATE); instruments.sample(); }
      const report = instruments.report();
      if (report) reports.push(report);
    }
    return reports;
  };
  return { solver, instruments, play };
}

/** Supply, switch, resistor and LED in a loop: class 1's circuit. */
function ledLoop(ohms: number | null, closed = true) {
  const supply = place('power', 0, 0), gnd = ground(0, 100);
  const sw = place('switch', 100, 0, { parameters: { closed: closed ? 1 : 0 } });
  const led = place('led', 300, 0);
  const r = ohms === null ? null : resistor(ohms, 200, 0);
  const wires = [connect(supply, 1, gnd, 0), connect(supply, 0, sw, 0), connect(led, 1, gnd, 0)];
  if (r) wires.push(connect(sw, 1, r, 0), connect(r, 1, led, 0)); else wires.push(connect(sw, 1, led, 0));
  return { supply, gnd, sw, led, r, ...running(r ? [supply, gnd, sw, r, led] : [supply, gnd, sw, led], wires) };
}

const last = <K extends keyof InstrumentReport>(reports: InstrumentReport[], key: K) =>
  reports.filter((r) => r[key] !== undefined).at(-1)?.[key];

describe('lights', () => {
  it('reports the current through each LED about sixty times a second', () => {
    const { led, play } = ledLoop(470);
    const reports = play(0.5).filter((r) => r.lights);
    expect(reports.length).toBeGreaterThan(25);
    expect(reports.length).toBeLessThanOrEqual(31);
    expect(reports.at(-1)!.lights![led.id] * 1000).toBeCloseTo(14.5, 1);
  });

  it('follows a switch', () => {
    const { led, sw, solver, play } = ledLoop(470, false);
    expect(last(play(0.1), 'lights')![led.id]).toBeLessThan(1e-6);
    solver.updateParam(sw.id, 'closed', 1);
    expect(last(play(0.1), 'lights')![led.id] * 1000).toBeCloseTo(14.5, 1);
  });

  it('says nothing about lights in a circuit without any', () => {
    const supply = place('power', 0, 0), gnd = ground(0, 100), r = resistor(1000, 100, 0);
    const { play } = running([supply, gnd, r], [connect(supply, 1, gnd, 0), connect(supply, 0, r, 0), connect(r, 1, gnd, 0)]);
    expect(play(0.2).some((report) => report.lights)).toBe(false);
  });
});

describe('overloaded parts', () => {
  it('clears the list when a circuit is loaded, and says nothing more while all is well', () => {
    const { play } = ledLoop(470);
    const lists = play(1).filter((r) => r.overloaded).map((r) => r.overloaded);
    expect(lists).toEqual([[]]);
  });

  it('names an LED with no resistor and the supply feeding it, after a moment', () => {
    const { led, supply, play } = ledLoop(null);
    const lists = play(1).filter((r) => r.overloaded).map((r) => r.overloaded!);
    expect(lists[0]).toEqual([]);
    expect(new Set(lists.at(-1))).toEqual(new Set([led.id, supply.id]));
  });

  it('lets go when the overload is over, and not before', () => {
    const { led, sw, solver, play } = ledLoop(null);
    expect(last(play(1), 'overloaded')).toContain(led.id);
    solver.updateParam(sw.id, 'closed', 0);
    const after = play(2).filter((r) => r.overloaded).map((r) => r.overloaded!);
    expect(after.at(-1)).toEqual([]);
  });

  it('does not flag a blink: strain is averaged, as heat is', () => {
    const { led, sw, solver, play } = ledLoop(null, false);
    play(0.2);
    solver.updateParam(sw.id, 'closed', 1);
    play(0.002);
    solver.updateParam(sw.id, 'closed', 0);
    const lists = play(1).filter((r) => r.overloaded).map((r) => r.overloaded!);
    expect(lists.flat()).not.toContain(led.id);
  });
});

describe('the meter', () => {
  it('reads nothing until it is held on something', () => {
    const { play } = ledLoop(470);
    expect(play(0.5).some((r) => r.meter)).toBe(false);
  });

  it('held on a part with two legs, reads the current through it and the voltage across it', () => {
    const { r, led, instruments, play } = ledLoop(470);
    instruments.setTarget({ componentId: r!.id });
    const reading = last(play(0.5), 'meter')!.target!;
    expect(reading.target).toEqual({ componentId: r!.id });
    expect(reading.amps!.mean * 1000).toBeCloseTo(14.5, 1);
    expect(reading.volts!.mean).toBeCloseTo(6.84, 1);
    expect(reading.volts!.hertz).toBeNull();

    instruments.setTarget({ componentId: led.id });
    const onLed = last(play(0.5), 'meter')!.target!;
    expect(onLed.target).toEqual({ componentId: led.id });
    expect(onLed.volts!.mean).toBeCloseTo(2.16, 1);
  });

  it('held on a pin, reads its voltage from ground and no current', () => {
    const { r, instruments, play } = ledLoop(470);
    instruments.setTarget({ componentId: r!.id, pinId: r!.pins[0].id });
    const reading = last(play(0.5), 'meter')!.target!;
    expect(reading.volts!.mean).toBeCloseTo(9, 3);
    expect(reading.amps).toBeNull();
  });

  it('reports about eight times a second, and stops when it is taken away', () => {
    const { r, instruments, play } = ledLoop(470);
    instruments.setTarget({ componentId: r!.id });
    const count = play(1).filter((report) => report.meter).length;
    expect(count).toBeGreaterThanOrEqual(7);
    expect(count).toBeLessThanOrEqual(8);
    instruments.setTarget(null);
    expect(play(0.5).some((report) => report.meter)).toBe(false);
  });

  it('keeps hold across a reload of the circuit', () => {
    const { r, instruments, play } = ledLoop(470);
    instruments.setTarget({ componentId: r!.id });
    instruments.reset();
    expect(last(play(0.5), 'meter')!.target!.amps!.mean * 1000).toBeCloseTo(14.5, 1);
  });

  it('reads nothing off a part that is not there or has more than two legs', () => {
    const { instruments, play } = ledLoop(470);
    instruments.setTarget({ componentId: 'gone' });
    expect(last(play(0.5), 'meter')!.target).toEqual({ target: { componentId: 'gone' }, volts: null, amps: null });
  });

  it('reads each of the scope\'s probes: level, swing and pitch', () => {
    const built = exampleCircuits.find((e) => e.name === 'Simple Oscillator')!.build();
    const out = built.components.find((c) => c.type === 'audio-output')!;
    const { solver, instruments, play } = running(built.components, built.connections);
    solver.setProbes([{ componentId: out.id, pinId: out.pins[0].id }]);
    instruments.setProbes(1);
    const meter = last(play(1), 'meter')!;
    expect(meter.target).toBeNull();
    expect(meter.probes).toHaveLength(1);
    expect(meter.probes[0].hertz).toBeGreaterThan(20);
    expect(meter.probes[0].max - meter.probes[0].min).toBeGreaterThan(1);
  });
});
