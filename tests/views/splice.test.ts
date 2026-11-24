/**
 * Where a part lands when it is let go of on a wire: which wire, turned
 * which way, and which end of the wire takes which leg.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { connect, place, resistor } from '@/examples/circuits';
import type { Component, Connection } from '@/types/circuit';
import { placeOnWire, SPLICE_REACH } from '@/views/CircuitCanvas/splice';
import { rotatePin } from '@/views/CircuitCanvas/routing/layout';
import { computeWireRoutes } from '@/views/CircuitCanvas/routing/useWireRoutes';
import { ALL_PARTS } from './allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

const routesOf = (components: Component[], connections: Connection[]) =>
  computeWireRoutes(components.map((c) => ({ component: c, position: c.position })), connections, 'schematic');

/** Two resistors with one wire between them: level (left to right) or one above the other. */
function wire(way: 'level' | 'upright' | 'level-backwards') {
  const a = way === 'upright' ? resistor(1000, 200, 100, 90) : resistor(1000, 100, 200);
  const b = way === 'upright' ? resistor(1000, 200, 500, 90) : resistor(1000, 500, 200);
  // a's second leg faces b's first
  const w = way === 'level-backwards' ? connect(b, 0, a, 1) : connect(a, 1, b, 0);
  return { a, b, w, routes: routesOf([a, b], [w]) };
}

/** Where a leg of the part ends up, on the canvas. */
function leg(part: Component, index: number, at: { position: { x: number; y: number }; rotation: number }) {
  const p = rotatePin(part.pins[index].position.x, part.pins[index].position.y, at.rotation);
  return { x: at.position.x + p.x, y: at.position.y + p.y };
}

describe('a part let go of on a wire', () => {
  it('lands in the wire when it is near enough, and not when it is not', () => {
    const { w, routes } = wire('level');
    const led = place('led', 0, 0);
    expect(placeOnWire(led, { x: 300, y: 200 }, routes)?.connectionId).toBe(w.id);
    expect(placeOnWire(led, { x: 300, y: 200 + SPLICE_REACH - 1 }, routes)?.connectionId).toBe(w.id);
    expect(placeOnWire(led, { x: 300, y: 200 + SPLICE_REACH + 2 }, routes)).toBeNull();
    expect(placeOnWire(led, { x: 300, y: 400 }, routes)).toBeNull();
  });

  it('is put exactly on the wire, on the grid along it', () => {
    const { routes } = wire('level');
    const led = place('led', 0, 0);
    const at = placeOnWire(led, { x: 293, y: 209 }, routes)!;
    expect(at.position).toEqual({ x: 300, y: 200 });
    expect(at.rotation).toBe(0);
    expect(leg(led, 0, at).y).toBe(200);
    expect(leg(led, 1, at).y).toBe(200);
  });

  it('is turned to lie along a wire that runs the other way', () => {
    const { routes } = wire('upright');
    const led = place('led', 0, 0);
    const at = placeOnWire(led, { x: 207, y: 296 }, routes)!;
    expect(at.rotation).toBe(90);
    expect(at.position).toEqual({ x: 200, y: 300 });
    expect(leg(led, 0, at).x).toBe(200);
    expect(leg(led, 1, at).x).toBe(200);
    // A part already turned that way stays as it is
    const turned = place('led', 0, 0, { rotation: 270 });
    expect(placeOnWire(turned, { x: 200, y: 300 }, routes)!.rotation).toBe(270);
  });

  it('gives each end of the wire the leg on its side', () => {
    const led = place('led', 0, 0);
    // The wire runs left to right and so does the part: first leg to the wire's start
    expect(placeOnWire(led, { x: 300, y: 200 }, wire('level').routes)!.swap).toBe(false);
    // The same wire made from the other end: its start is on the right
    expect(placeOnWire(led, { x: 300, y: 200 }, wire('level-backwards').routes)!.swap).toBe(true);
    // The part turned round
    const round = place('led', 0, 0, { rotation: 180 });
    expect(placeOnWire(round, { x: 300, y: 200 }, wire('level').routes)!.swap).toBe(true);
  });

  it('never crosses the two halves over, whatever the part and however it is turned', () => {
    for (const way of ['level', 'upright', 'level-backwards'] as const) {
      const { routes, w } = wire(way);
      const points = routes.get(w.id)!.points;
      const first = points[0], last = points[points.length - 1];
      const drop = way === 'upright' ? { x: 200, y: 300 } : { x: 300, y: 200 };
      for (const type of ['resistor', 'led', 'switch', 'potentiometer', '2n3904', 'speaker', 'cd40106', 'lm386']) {
        for (const rotation of [0, 90, 180, 270]) {
          const part = place(type, 0, 0, { rotation });
          const at = placeOnWire(part, drop, routes)!;
          expect(at, `${type} ${rotation}`).not.toBeNull();
          const through = ALL_PARTS.find((d) => d.type === type)!.through ?? [0, 1];
          const [toFirst, toLast] = at.swap ? [through[1], through[0]] : through;
          const gap = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
          const made = gap(leg(part, toFirst, at), first) + gap(leg(part, toLast, at), last);
          const other = gap(leg(part, toLast, at), first) + gap(leg(part, toFirst, at), last);
          expect(made, `${way} ${type} ${rotation}`).toBeLessThanOrEqual(other);
        }
      }
    }
  });

  it('leaves a part with more than two legs the way it is turned, where it was dropped', () => {
    const { routes } = wire('upright');
    const pot = place('potentiometer', 0, 0);
    const at = placeOnWire(pot, { x: 207, y: 296 }, routes)!;
    expect(at.rotation).toBe(0);
    expect(at.position).toEqual({ x: 200, y: 300 });
  });

  it('is nothing for a part that cannot sit in a wire', () => {
    const { routes } = wire('level');
    for (const type of ['ground', 'power', 'audio-output', 'junction']) {
      expect(placeOnWire(place(type, 0, 0), { x: 300, y: 200 }, routes), type).toBeNull();
    }
  });

  it('picks the nearer of two wires', () => {
    const a = resistor(1000, 100, 200), b = resistor(1000, 500, 200), c = resistor(1000, 100, 220), d = resistor(1000, 500, 220);
    const top = connect(a, 1, b, 0), bottom = connect(c, 1, d, 0);
    const routes = routesOf([a, b, c, d], [top, bottom]);
    const led = place('led', 0, 0);
    expect(placeOnWire(led, { x: 300, y: 203 }, routes)!.connectionId).toBe(top.id);
    expect(placeOnWire(led, { x: 300, y: 216 }, routes)!.connectionId).toBe(bottom.id);
  });
});
