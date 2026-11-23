/**
 * The bend tool's reckoning: what on the canvas a jumper can be clipped to,
 * what is under the pointer, and what a bend becomes when it is kept.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { exampleCircuits } from '@/examples/circuits';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import type { Component, Connection } from '@/types/circuit';
import {
  BEND_KINDS, bendScene, bendTargetAt, canBend, freeSpotNear, keptBend, netsOfPins, type BendScene,
} from '@/views/CircuitCanvas/bend';
import { componentObstacles } from '@/views/CircuitCanvas/routing/layout';
import { computeWireRoutes } from '@/views/CircuitCanvas/routing/useWireRoutes';
import { ALL_PARTS } from './allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

function example(name: string, viewMode: 'schematic' | 'board' = 'schematic') {
  const { components, connections } = exampleCircuits.find((e) => e.name === name)!.build();
  const routes = computeWireRoutes(components.map((c) => ({ component: c, position: c.position })), connections, viewMode);
  const scene = bendScene(components, connections, routes, viewMode);
  const part = (type: string, label?: string) => components.find((c) => c.type === type && (label === undefined || c.label === label))!;
  /** The scene's entry for a pin of a part. */
  const pin = (component: Component, index: number) =>
    scene.pins.find((p) => p.point.componentId === component.id && p.point.pinId === component.pins[index].id)!;
  return { components, connections, routes, scene, part, pin };
}

describe('which pins are joined', () => {
  it('puts wired pins on one net and unwired ones on their own', () => {
    const { components, connections, part } = example('Light Theremin');
    const netOf = netsOfPins(components, connections);
    const chip = part('cd4093'), cap = part('capacitor'), cell = part('ldr');
    // Input 1B, the capacitor and the photocell meet
    expect(netOf(chip.id, chip.pins[1].id)).toBe(netOf(cap.id, cap.pins[0].id));
    expect(netOf(chip.id, chip.pins[1].id)).toBe(netOf(cell.id, cell.pins[0].id));
    expect(netOf(chip.id, chip.pins[1].id)).not.toBe(netOf(chip.id, chip.pins[8].id));
    // Two legs nothing is wired to are not each other
    expect(netOf(chip.id, chip.pins[4].id)).not.toBe(netOf(chip.id, chip.pins[5].id));
  });

  it('counts every ground symbol as the same place, as the simulation does', () => {
    const { components, connections } = example('Light Theremin');
    const netOf = netsOfPins(components, connections);
    const grounds = components.filter((c) => c.type === 'ground');
    expect(grounds.length).toBeGreaterThan(2);
    expect(new Set(grounds.map((g) => netOf(g.id, g.pins[0].id))).size).toBe(1);
  });
});

describe('what a jumper can be clipped to', () => {
  it('lists every pin where it is drawn, by name', () => {
    const { components, scene, part, pin } = example('Light Theremin');
    expect(scene.pins).toHaveLength(components.reduce((n, c) => n + c.pins.length, 0));
    const chip = part('cd4093');
    expect(pin(chip, 8)).toMatchObject({ label: 'CD4093 1Y', x: chip.position.x + 30, y: chip.position.y - 70, dead: false });
    // A part with a name of its own goes by it; a ground has only the one pin to name
    expect(pin(part('ldr'), 0).label).toMatch(/^LIGHT /);
    expect(pin(part('ground'), 0).label).toBe('Ground');
  });

  it('follows a turned part', () => {
    const { part, pin } = example('Light Theremin');
    const pullDown = part('resistor'); // the 100k, standing on end
    expect(pullDown.rotation).toBe(90);
    expect(pin(pullDown, 0).x).toBeCloseTo(pullDown.position.x);
    expect(Math.abs(pin(pullDown, 0).y - pullDown.position.y)).toBeGreaterThan(10);
  });

  it('marks the unused legs of a logic chip as dead, and no others', () => {
    const { scene, part, pin } = example('Light Theremin');
    const chip = part('cd4093');
    expect(pin(chip, 0).dead).toBe(false);
    expect(pin(chip, 5).dead).toBe(true);   // an input of an unused gate
    expect(pin(chip, 9).dead).toBe(true);   // and its output
    expect(scene.pins.filter((p) => p.dead).every((p) => p.point.componentId === chip.id)).toBe(true);
  });

  it('has a wire for every connection, on the net of the pins it joins', () => {
    const { connections, scene, part, pin } = example('Light Theremin');
    expect(scene.wires).toHaveLength(connections.length);
    const chip = part('cd4093');
    const out = scene.wires.filter((w) => w.target.net === pin(chip, 8).net);
    expect(out.length).toBeGreaterThanOrEqual(2); // to the 4.7k and to the output
    for (const wire of out) expect(wire.target.dead).toBe(false);
  });

  it('works on every example in both views', () => {
    for (const { name } of exampleCircuits) {
      for (const viewMode of ['schematic', 'board'] as const) {
        const { scene, connections } = example(name, viewMode);
        expect(scene.wires).toHaveLength(connections.length);
        expect(scene.pins.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.label.length > 0)).toBe(true);
      }
    }
  });
});

describe('what is under the pointer', () => {
  it('finds a pin within reach, and the nearer of two', () => {
    const { scene, part, pin } = example('Light Theremin');
    const chip = part('cd4093');
    const a = pin(chip, 0), b = pin(chip, 1); // 20 apart
    expect(bendTargetAt(scene, a.x + 3, a.y - 4, 10)).toBe(a);
    expect(bendTargetAt(scene, a.x, a.y + 9, 10)).toBe(a);
    expect(bendTargetAt(scene, a.x, a.y + 11, 10)).toBe(b);
  });

  it('finds a wire away from its pins, at the place on it nearest the pointer', () => {
    const { scene, routes, connections, part } = example('Light Theremin');
    const output = part('audio-output');
    const wire = connections.find((c) => c.to.componentId === output.id)!;
    const points = routes.get(wire.id)!.points;
    // The middle of its longest run
    let best = 1;
    for (let i = 1; i < points.length; i++) {
      const length = (k: number) => Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
      if (length(i) > length(best)) best = i;
    }
    const mid = { x: (points[best].x + points[best - 1].x) / 2, y: (points[best].y + points[best - 1].y) / 2 };
    const horizontal = points[best].y === points[best - 1].y;
    const found = bendTargetAt(scene, mid.x + (horizontal ? 0 : 6), mid.y + (horizontal ? 6 : 0), 10)!;
    expect(found.label).toBe('the wire from CD4093 1Y');
    expect(found.x).toBeCloseTo(mid.x);
    expect(found.y).toBeCloseTo(mid.y);
  });

  it('prefers a pin to the wire that ends on it', () => {
    const { scene, part, pin } = example('Light Theremin');
    const out = pin(part('cd4093'), 8);
    expect(bendTargetAt(scene, out.x + 5, out.y, 10)).toBe(out);
  });

  it('finds nothing on bare board', () => {
    const { scene } = example('Light Theremin');
    expect(bendTargetAt(scene, -500, -500, 10)).toBeNull();
    const empty: BendScene = { pins: [], wires: [] };
    expect(bendTargetAt(empty, 0, 0, 10)).toBeNull();
  });
});

describe('whether a jumper does anything', () => {
  it('needs two different nets, neither of them a dead leg', () => {
    const { part, pin } = example('Light Theremin');
    const chip = part('cd4093'), cap = part('capacitor');
    expect(canBend(pin(chip, 8), pin(chip, 1))).toBe(true);
    expect(canBend(pin(chip, 1), pin(cap, 0))).toBe(false);          // already joined
    expect(canBend(pin(chip, 8), pin(chip, 5))).toBe(false);         // an unused leg
    expect(canBend(pin(chip, 8), null)).toBe(false);
    expect(canBend(null, pin(chip, 8))).toBe(false);
    const grounds = example('Light Theremin');
    const [g1, g2] = grounds.components.filter((c) => c.type === 'ground');
    expect(canBend(grounds.pin(g1, 0), grounds.pin(g2, 0))).toBe(false); // ground to ground
  });

  it('offers a bare wire, a resistor and a finger', () => {
    expect(BEND_KINDS.map((k) => k.ohms)).toEqual([1, 10e3, 500e3]);
  });
});

describe('keeping a bend', () => {
  const overlaps = (a: Component, b: Component) =>
    componentObstacles(a, a.position, 'schematic').some((p) => componentObstacles(b, b.position, 'schematic').some((q) =>
      p.x < q.x + q.width && p.x + p.width > q.x && p.y < q.y + q.height && p.y + p.height > q.y));

  it('adds a closed switch between the two points, so it goes on sounding as the bend did', () => {
    const { components, part, pin } = example('Light Theremin');
    const chip = part('cd4093');
    const kept = keptBend(pin(chip, 8), pin(chip, 1), 1, 'switch', components, 'schematic')!;
    expect(kept.components.map((c) => c.type)).toEqual(['switch']);
    const [added] = kept.components;
    expect(added.label).toBe('BEND');
    expect(added.parameters.closed).toBe(1);
    expect(kept.connections).toHaveLength(2);
    const ends = kept.connections.flatMap((c) => [c.from, c.to]).filter((end) => end.componentId === chip.id).map((end) => end.pinId);
    expect(new Set(ends)).toEqual(new Set([chip.pins[8].id, chip.pins[1].id]));
    const own = kept.connections.flatMap((c) => [c.from, c.to]).filter((end) => end.componentId === added.id).map((end) => end.pinId);
    expect(new Set(own)).toEqual(new Set(added.pins.map((p) => p.id)));
  });

  it('adds a push button that is up until it is pressed', () => {
    const { components, part, pin } = example('Light Theremin');
    const chip = part('cd4093');
    const kept = keptBend(pin(chip, 8), pin(chip, 1), 1, 'pushbutton', components, 'schematic')!;
    expect(kept.components.map((c) => c.type)).toEqual(['pushbutton']);
    expect(Number(kept.components[0].parameters.closed ?? 0)).toBe(0);
  });

  it('keeps the resistor of a jumper that had one, in line with the switch', () => {
    const { components, part, pin } = example('Light Theremin');
    const chip = part('cd4093');
    const kept = keptBend(pin(chip, 8), pin(chip, 1), 10e3, 'switch', components, 'schematic')!;
    expect(kept.components.map((c) => c.type)).toEqual(['switch', 'resistor']);
    const [control, resistor] = kept.components;
    expect(resistor.parameters.resistance).toBe(10e3);
    expect(resistor.parameters.value).toBe('10kΩ');
    expect(kept.connections).toHaveLength(3);
    // One wire runs from the switch to the resistor; neither end of the bend reaches both
    const between = kept.connections.filter((c) => [c.from.componentId, c.to.componentId].sort().join() === [control.id, resistor.id].sort().join());
    expect(between).toHaveLength(1);
    const finger = keptBend(pin(chip, 8), pin(chip, 1), 500e3, 'pushbutton', components, 'schematic')!;
    expect(finger.components[1].parameters.resistance).toBe(500e3);
  });

  it('puts what it adds on the grid, clear of every part already there and of each other', () => {
    for (const name of ['Light Theremin', 'Atari Punk Console', 'MFOS Weird Sound Generator']) {
      const { components, scene } = example(name);
      const live = scene.pins.filter((p) => !p.dead);
      // A handful of bends across the circuit
      for (let i = 0; i + 7 < live.length; i += 5) {
        if (!canBend(live[i], live[i + 7])) continue;
        const kept = keptBend(live[i], live[i + 7], 10e3, 'switch', components, 'schematic')!;
        for (const added of kept.components) {
          expect(added.position.x % 20).toBe(0);
          expect(added.position.y % 20).toBe(0);
          for (const other of components) expect(overlaps(added, other)).toBe(false);
        }
        expect(overlaps(kept.components[0], kept.components[1])).toBe(false);
      }
    }
  });

  it('stays where the bend was when there is room', () => {
    const resistor = ComponentRegistry.getInstance().get('resistor')!;
    const far = createComponentFromDefinition(resistor, { x: 1000, y: 1000 });
    const part = createComponentFromDefinition(ComponentRegistry.getInstance().get('switch')!, { x: 0, y: 0 });
    expect(freeSpotNear([far], [part], [{ x: 0, y: 0 }], 205, 98, 'schematic')).toEqual({ x: 200, y: 100 });
    // ...and moves off a part that is in the way, no further than it must
    const inTheWay = createComponentFromDefinition(resistor, { x: 200, y: 100 });
    const spot = freeSpotNear([inTheWay], [part], [{ x: 0, y: 0 }], 205, 98, 'schematic');
    expect(spot).not.toEqual({ x: 200, y: 100 });
    expect(Math.hypot(spot.x - 200, spot.y - 100)).toBeLessThanOrEqual(120);
  });

  it('gives up politely on a part that does not exist', () => {
    const { components, part, pin } = example('Light Theremin');
    const chip = part('cd4093');
    expect(keptBend(pin(chip, 8), pin(chip, 1), 1, 'switch', components, 'schematic', () => undefined)).toBeNull();
  });

  it('does not change the circuit it is given', () => {
    const { components, connections, part, pin } = example('Light Theremin');
    const before = JSON.stringify([components.map((c) => [c.id, c.position]), connections.map((c: Connection) => c.id)]);
    const chip = part('cd4093');
    keptBend(pin(chip, 8), pin(chip, 1), 10e3, 'switch', components, 'schematic');
    expect(JSON.stringify([components.map((c) => [c.id, c.position]), connections.map((c: Connection) => c.id)])).toBe(before);
  });
});
