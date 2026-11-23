/**
 * The wire router: what a route must look like for single wires, and the
 * promises it keeps on the real example circuits (no wire through a part, no
 * two nets on top of each other).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { capacitorDefinition } from '@/components/definitions/Capacitor';
import { cd40106Definition } from '@/components/definitions/CD40106';
import { lm741Definition } from '@/components/definitions/LM741';
import { potentiometerDefinition } from '@/components/definitions/Potentiometer';
import { powerSupplyDefinition } from '@/components/definitions/PowerSupply';
import { groundDefinition } from '@/components/definitions/Ground';
import { transistor2N3904Definition } from '@/components/definitions/Transistor2N3904';
import { diode1N914Definition } from '@/components/definitions/Diode1N914';
import { audioOutputJackDefinition } from '@/components/definitions/AudioOutputJack';
import { ledDefinition } from '@/components/definitions/LED';
import { switchDefinition } from '@/components/definitions/Switch';
import { junctionDefinition } from '@/components/definitions/Junction';
import { exampleCircuits } from '@/examples/circuits';
import { ALL_PARTS } from '../allParts';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import type { Component, Connection } from '@/types/circuit';
import {
  routeWires, type Point, type RoutedWire, type RouterObstacle, type RouterPin, type RouterWire,
} from '@/views/CircuitCanvas/routing/router';
import {
  componentObstacles, componentPins, labelPlacement, pinKey, pinLayout, type ViewMode,
} from '@/views/CircuitCanvas/routing/layout';
import { computeWireRoutes } from '@/views/CircuitCanvas/routing/useWireRoutes';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  for (const def of ALL_PARTS) registry.register(def);
});

interface Segment { a: Point; b: Point }

function segments(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i++) out.push({ a: points[i - 1], b: points[i] });
  return out;
}

function length(points: Point[]): number {
  return segments(points).reduce((sum, s) => sum + Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y), 0);
}

/** Length two segments run on top of each other, 0 if they only cross or touch at a point. */
function sharedLength(p: Segment, q: Segment): number {
  const horizontal = (s: Segment) => Math.abs(s.a.y - s.b.y) < 0.5;
  const vertical = (s: Segment) => Math.abs(s.a.x - s.b.x) < 0.5;
  if (horizontal(p) && horizontal(q) && Math.abs(p.a.y - q.a.y) < 2.5) {
    return Math.max(0, Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x)) - Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x)));
  }
  if (vertical(p) && vertical(q) && Math.abs(p.a.x - q.a.x) < 2.5) {
    return Math.max(0, Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y)) - Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y)));
  }
  return 0;
}

/** Whether a segment passes through the inside of a box (running along its edge does not count). */
function passesThrough(s: Segment, box: RouterObstacle): boolean {
  const x0 = Math.min(s.a.x, s.b.x), x1 = Math.max(s.a.x, s.b.x);
  const y0 = Math.min(s.a.y, s.b.y), y1 = Math.max(s.a.y, s.b.y);
  return x1 > box.x + 1 && x0 < box.x + box.width - 1 && y1 > box.y + 1 && y0 < box.y + box.height - 1;
}

function isOrthogonal(points: Point[]): boolean {
  // The router may draw one slightly slanted line between two pins a pixel or two out of line
  return segments(points).every(s => Math.abs(s.a.x - s.b.x) <= 2 || Math.abs(s.a.y - s.b.y) <= 2);
}

const pin = (id: string, x: number, y: number, side: RouterPin['side']): RouterPin => ({ id, x, y, side });
const wire = (id: string, from: string, to: string): RouterWire => ({ id, from, to });

describe('routeWires', () => {
  it('joins two facing pins with one straight line', () => {
    const routes = routeWires([], [pin('a', 100, 100, 'right'), pin('b', 300, 100, 'left')], [wire('w', 'a', 'b')]);
    expect(routes.get('w')!.points).toEqual([{ x: 100, y: 100 }, { x: 300, y: 100 }]);
  });

  it('uses a single bend when the pins are not in line', () => {
    const routes = routeWires([], [pin('a', 100, 100, 'right'), pin('b', 300, 200, 'top')], [wire('w', 'a', 'b')]);
    expect(routes.get('w')!.points).toEqual([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }]);
  });

  it('leaves a pin straight out of its part before turning', () => {
    // The target is directly above a pin that points right
    const routes = routeWires([], [pin('a', 100, 300, 'right'), pin('b', 100, 100, 'right')], [wire('w', 'a', 'b')]);
    const points = routes.get('w')!.points;
    expect(points[1].y).toBe(300);
    expect(points[1].x).toBeGreaterThanOrEqual(110);
    const n = points.length;
    expect(points[n - 2].y).toBe(100);
    expect(points[n - 2].x).toBeGreaterThanOrEqual(110);
    expect(isOrthogonal(points)).toBe(true);
  });

  it('goes around a part that is in the way', () => {
    const block: RouterObstacle = { x: 170, y: 60, width: 60, height: 80 };
    const routes = routeWires([block], [pin('a', 100, 100, 'right'), pin('b', 300, 100, 'left')], [wire('w', 'a', 'b')]);
    const points = routes.get('w')!.points;
    expect(points.length).toBeGreaterThan(2);
    expect(segments(points).some(s => passesThrough(s, block))).toBe(false);
    // ...and keeps a little clear of it rather than hugging its edge
    for (const s of segments(points)) {
      expect(passesThrough(s, { x: block.x - 5, y: block.y - 5, width: block.width + 10, height: block.height + 10 })).toBe(false);
    }
  });

  it('ends exactly on pins that are off the routing grid', () => {
    const routes = routeWires([], [pin('a', 103, 109, 'right'), pin('b', 297, 251, 'left')], [wire('w', 'a', 'b')]);
    const points = routes.get('w')!.points;
    expect(points[0]).toEqual({ x: 103, y: 109 });
    expect(points[points.length - 1]).toEqual({ x: 297, y: 251 });
    expect(isOrthogonal(points)).toBe(true);
  });

  it('never runs two different nets on top of each other', () => {
    // Two wires that would both like the same straight track
    const pins = [
      pin('a1', 100, 100, 'right'), pin('a2', 400, 100, 'left'),
      pin('b1', 150, 60, 'bottom'), pin('b2', 350, 60, 'bottom'),
    ];
    const routes = routeWires([], pins, [wire('a', 'a1', 'a2'), wire('b', 'b1', 'b2')]);
    const a = segments(routes.get('a')!.points), b = segments(routes.get('b')!.points);
    for (const p of a) for (const q of b) expect(sharedLength(p, q)).toBe(0);
  });

  it('lets different nets cross at right angles, without a dot', () => {
    const pins = [
      pin('a1', 100, 200, 'right'), pin('a2', 400, 200, 'left'),
      pin('b1', 250, 100, 'bottom'), pin('b2', 250, 300, 'top'),
    ];
    const routes = routeWires([], pins, [wire('a', 'a1', 'a2'), wire('b', 'b1', 'b2')]);
    expect(routes.get('a')!.points).toHaveLength(2);
    expect(routes.get('b')!.points).toHaveLength(2);
    expect(routes.get('a')!.dots).toHaveLength(0);
    expect(routes.get('b')!.dots).toHaveLength(0);
  });

  it('draws a net as a trunk with branches and marks each branch with a dot', () => {
    // One pin feeding two others that lie further along the same way
    const pins = [pin('src', 100, 200, 'right'), pin('up', 400, 100, 'left'), pin('down', 400, 300, 'left')];
    const routes = routeWires([], pins, [wire('w1', 'src', 'up'), wire('w2', 'src', 'down')]);
    const w1 = routes.get('w1')!, w2 = routes.get('w2')!;
    let shared = 0;
    for (const p of segments(w1.points)) for (const q of segments(w2.points)) shared += sharedLength(p, q);
    expect(shared).toBeGreaterThan(100);
    const dots = [...w1.dots, ...w2.dots];
    expect(dots).toHaveLength(1);
    expect(dots[0].y).toBe(200);
  });

  it('does not let another net pass over a pin', () => {
    // Net b has to get past the pins of net a, which sit in its straight path
    const pins = [
      pin('a1', 200, 100, 'bottom'), pin('a2', 200, 300, 'top'),
      pin('b1', 100, 100, 'right'), pin('b2', 300, 100, 'left'),
    ];
    const routes = routeWires([], pins, [wire('a', 'a1', 'a2'), wire('b', 'b1', 'b2')]);
    for (const s of segments(routes.get('b')!.points)) {
      expect(passesThrough(s, { x: 195, y: 95, width: 10, height: 10 })).toBe(false);
    }
  });

  it('gives the same routes whatever order the wires are listed in', () => {
    const pins = [
      pin('a', 100, 100, 'right'), pin('b', 400, 100, 'left'), pin('c', 400, 300, 'left'),
      pin('d', 100, 300, 'right'), pin('e', 250, 40, 'bottom'), pin('f', 250, 360, 'top'),
    ];
    const wires = [wire('w1', 'a', 'b'), wire('w2', 'a', 'c'), wire('w3', 'd', 'c'), wire('w4', 'e', 'f')];
    const forward = routeWires([], pins, wires);
    const backward = routeWires([], pins, [...wires].reverse());
    for (const w of wires) expect(backward.get(w.id)).toEqual(forward.get(w.id));
  });

  it('skips wires whose pins it does not know', () => {
    const routes = routeWires([], [pin('a', 0, 0, 'right')], [wire('w', 'a', 'missing')]);
    expect(routes.size).toBe(0);
  });
});

describe('part geometry', () => {
  it('points the pins of a chip out of the side they are on', () => {
    const ic = createComponentFromDefinition(cd40106Definition, { x: 0, y: 0 });
    const sides = pinLayout(ic, 'schematic').map(p => p.side);
    // 1A–6A down the left, 1Y–6Y down the right, VDD and VSS on top
    expect(sides.slice(0, 6)).toEqual(Array(6).fill('left'));
    expect(sides.slice(6, 12)).toEqual(Array(6).fill('right'));
    expect(sides.slice(12)).toEqual(['top', 'top']);
  });

  it('turns pin directions with the part', () => {
    const pot = createComponentFromDefinition(potentiometerDefinition, { x: 0, y: 0 });
    expect(pinLayout(pot, 'schematic').map(p => p.side)).toEqual(['left', 'top', 'right']);
    pot.rotation = 90;
    expect(pinLayout(pot, 'schematic').map(p => p.side)).toEqual(['top', 'right', 'bottom']);
    pot.rotation = 180;
    expect(pinLayout(pot, 'schematic').map(p => p.side)).toEqual(['right', 'bottom', 'left']);
  });

  it('puts a name on a side of the part that has no pins', () => {
    const pot = createComponentFromDefinition(potentiometerDefinition, { x: 0, y: 0 });
    // Pins left, top and right: the name goes underneath
    expect(labelPlacement(pot, 'schematic', 'CUTOFF')!.box.top).toBeGreaterThan(20);
    pot.rotation = 180;
    expect(labelPlacement(pot, 'schematic', 'CUTOFF')!.box.bottom).toBeLessThan(-20);
    pot.rotation = 90;
    expect(labelPlacement(pot, 'schematic', 'CUTOFF')!.box.right).toBeLessThan(-20);
  });

  it('keeps wires off a part\'s name', () => {
    const pot = createComponentFromDefinition(potentiometerDefinition, { x: 200, y: 200 });
    expect(componentObstacles(pot, pot.position, 'schematic')).toHaveLength(1);
    pot.label = 'CUTOFF';
    const obstacles = componentObstacles(pot, pot.position, 'schematic');
    expect(obstacles).toHaveLength(2);
    expect(obstacles[1].soft).toBe(true);
  });
});

/** Nets of a circuit: pin key → net id. */
function netsOf(connections: Connection[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  for (const c of connections) {
    parent.set(find(pinKey(c.from.componentId, c.from.pinId)), find(pinKey(c.to.componentId, c.to.pinId)));
  }
  const nets = new Map<string, string>();
  for (const k of parent.keys()) nets.set(k, find(k));
  return nets;
}

function checkCircuit(components: Component[], connections: Connection[], viewMode: ViewMode) {
  const placed = components.map(c => ({ component: c, position: c.position }));
  const routes = computeWireRoutes(placed, connections, viewMode);
  const nets = netsOf(connections);
  const parts = components.map(c => ({
    id: c.id,
    box: componentObstacles(c, c.position, viewMode).find(o => !o.soft),
    pins: componentPins(c, c.position, viewMode),
  }));

  const through: string[] = [];
  const overlaps: string[] = [];
  const detached: string[] = [];
  const routed: Array<{ conn: Connection; route: RoutedWire; net: string }> = [];

  for (const conn of connections) {
    const route = routes.get(conn.id);
    if (!route) { detached.push(conn.id); continue; }
    routed.push({ conn, route, net: nets.get(pinKey(conn.from.componentId, conn.from.pinId))! });

    // Starts and ends on its pins
    const from = parts.find(p => p.id === conn.from.componentId)!.pins.find(p => p.id === pinKey(conn.from.componentId, conn.from.pinId))!;
    const to = parts.find(p => p.id === conn.to.componentId)!.pins.find(p => p.id === pinKey(conn.to.componentId, conn.to.pinId))!;
    const first = route.points[0], last = route.points[route.points.length - 1];
    if (first.x !== from.x || first.y !== from.y || last.x !== to.x || last.y !== to.y) detached.push(conn.id);

    // Passes through no part, apart from the stub out of its own pin
    const segs = segments(route.points);
    segs.forEach((s, i) => {
      for (const part of parts) {
        if (!part.box) continue;
        const ownStub = (i === 0 && part.id === conn.from.componentId) || (i === segs.length - 1 && part.id === conn.to.componentId);
        if (!ownStub && passesThrough(s, part.box)) through.push(`${conn.id} through ${part.id}`);
      }
    });
  }

  for (let i = 0; i < routed.length; i++) {
    for (let j = i + 1; j < routed.length; j++) {
      if (routed[i].net === routed[j].net) continue;
      for (const p of segments(routed[i].route.points)) {
        for (const q of segments(routed[j].route.points)) {
          if (sharedLength(p, q) > 0.5) overlaps.push(`${routed[i].conn.id} on ${routed[j].conn.id}`);
        }
      }
    }
  }
  return { routes, through, overlaps, detached };
}

describe('routing the example circuits', () => {
  for (const viewMode of ['schematic', 'board'] as ViewMode[]) {
    for (const example of exampleCircuits) {
      it(`${example.name} (${viewMode}): every wire reaches its pins, clear of parts and of other nets`, () => {
        const { components, connections } = example.build();
        const { routes, through, overlaps, detached } = checkCircuit(components, connections, viewMode);
        expect(routes.size).toBe(connections.length);
        expect(detached).toEqual([]);
        expect(through).toEqual([]);
        expect(overlaps).toEqual([]);
        for (const route of routes.values()) expect(isOrthogonal(route.points)).toBe(true);
      });
    }
  }

  it('routes the Weird Sound Generator fast enough to follow a part being dragged', () => {
    const wsg = exampleCircuits.find(e => e.name.includes('Weird'))!.build();
    const placed = wsg.components.map(c => ({ component: c, position: c.position }));
    computeWireRoutes(placed, wsg.connections, 'schematic');
    const start = performance.now();
    for (let i = 0; i < 5; i++) computeWireRoutes(placed, wsg.connections, 'schematic');
    // About 8 ms on a laptop; a frame is 16
    expect((performance.now() - start) / 5).toBeLessThan(60);
  });

  it('keeps the Weird Sound Generator easy to read', () => {
    const wsg = exampleCircuits.find(e => e.name.includes('Weird'))!.build();
    const { routes } = checkCircuit(wsg.components, wsg.connections, 'schematic');
    const nets = netsOf(wsg.connections);
    const all = wsg.connections.map(c => ({
      net: nets.get(pinKey(c.from.componentId, c.from.pinId))!,
      segs: segments(routes.get(c.id)!.points),
    }));
    // Count places where wires of different nets cross
    const crossings = new Set<string>();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (all[i].net === all[j].net) continue;
        for (const p of all[i].segs) for (const q of all[j].segs) {
          const [h, v] = Math.abs(p.a.y - p.b.y) < 0.5 ? [p, q] : [q, p];
          if (Math.abs(h.a.y - h.b.y) > 0.5 || Math.abs(v.a.x - v.b.x) > 0.5) continue;
          const x = v.a.x, y = h.a.y;
          if (x > Math.min(h.a.x, h.b.x) && x < Math.max(h.a.x, h.b.x) && y > Math.min(v.a.y, v.b.y) && y < Math.max(v.a.y, v.b.y)) {
            crossings.add(`${x},${y}`);
          }
        }
      }
    }
    expect(crossings.size).toBeLessThanOrEqual(12);
    expect(length([...routes.values()].flatMap(r => r.points))).toBeGreaterThan(0);
  });
});
