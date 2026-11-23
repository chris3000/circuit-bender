/**
 * Working out what a bend touches: every bare piece of metal on the canvas —
 * the pins of the parts and the wires between them — and which of them is
 * under the pointer.
 *
 * A bend is a jumper held between two of these while the circuit plays. It
 * is not part of the circuit: nothing is stored and nothing can be undone.
 */
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component, ComponentDefinition, ComponentId, Connection, PinId } from '@/types/circuit';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import { formatValue } from '@/utils/parameterParser';
import { componentObstacles, pinKey, pinLayout, type ViewMode } from './routing/layout';
import type { WireRoutes } from './routing/useWireRoutes';

/** One end of a bend: a pin of a part. */
export interface BendPoint { componentId: string; pinId: string }

/** Something a jumper can be clipped to. */
export interface BendTarget {
  point: BendPoint;
  /** Where the clip goes, in canvas coordinates. */
  x: number;
  y: number;
  /** Everything joined to it has the same one: a jumper within a net does nothing. */
  net: string;
  /** What it is called: "CD40106 1Y". */
  label: string;
  /** Not connected to anything, inside or out (an unused leg of a logic chip): nothing to bend. */
  dead: boolean;
}

interface BendWire { points: Array<{ x: number; y: number }>; target: Omit<BendTarget, 'x' | 'y'> }

export interface BendScene { pins: BendTarget[]; wires: BendWire[] }

type Lookup = (type: string) => ComponentDefinition | undefined;
const fromRegistry: Lookup = (type) => ComponentRegistry.getInstance().get(type);

/**
 * Which net every pin is on. Pins joined by wires are one net, and so is
 * every ground symbol, wired together or not (as in the simulation).
 */
export function netsOfPins(components: readonly Component[], connections: readonly Connection[]): (componentId: string, pinId: string) => string {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    if (root !== key) parent.set(key, root);
    return root;
  };
  const join = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const c of connections) join(pinKey(c.from.componentId, c.from.pinId), pinKey(c.to.componentId, c.to.pinId));
  for (const component of components) {
    if (component.type !== 'ground') continue;
    for (const pin of component.pins) join(pinKey(component.id, pin.id), 'ground');
  }
  return (componentId, pinId) => find(pinKey(componentId, pinId));
}

/** Everything on the canvas a jumper can be clipped to. */
export function bendScene(
  components: readonly Component[], connections: readonly Connection[], routes: WireRoutes, viewMode: ViewMode,
  lookup: Lookup = fromRegistry,
): BendScene {
  const netOf = netsOfPins(components, connections);
  const wired = new Set<string>();
  for (const c of connections) {
    wired.add(pinKey(c.from.componentId, c.from.pinId));
    wired.add(pinKey(c.to.componentId, c.to.pinId));
  }
  const byId = new Map(components.map((c) => [c.id as string, c]));
  const nameOf = (component: Component) => component.label || lookup(component.type)?.metadata.name || component.type;

  const pins: BendTarget[] = [];
  for (const component of components) {
    const floats = lookup(component.type)?.floatingPins === true;
    pinLayout(component, viewMode).forEach((pin, index) => {
      const label = component.type === 'junction' || component.type === 'ground'
        ? nameOf(component) : `${nameOf(component)} ${component.pins[index].label}`;
      pins.push({
        point: { componentId: component.id, pinId: pin.id },
        x: component.position.x + pin.x, y: component.position.y + pin.y,
        net: netOf(component.id, pin.id), label,
        dead: floats && !wired.has(pinKey(component.id, pin.id)),
      });
    });
  }

  const wires: BendWire[] = [];
  for (const connection of connections) {
    const route = routes.get(connection.id);
    const from = byId.get(connection.from.componentId);
    const pin = from?.pins.find((p) => p.id === connection.from.pinId);
    if (!route || route.points.length < 2 || !from || !pin) continue;
    wires.push({
      points: route.points,
      target: {
        point: { componentId: connection.from.componentId, pinId: connection.from.pinId },
        net: netOf(connection.from.componentId, connection.from.pinId),
        label: `the wire from ${nameOf(from)}${from.type === 'junction' || from.type === 'ground' ? '' : ` ${pin.label}`}`,
        dead: false,
      },
    });
  }
  return { pins, wires };
}

/**
 * What is within `radius` of a point: the nearest pin if there is one,
 * otherwise the nearest wire, at the place on it nearest the point.
 */
export function bendTargetAt(scene: BendScene, x: number, y: number, radius: number): BendTarget | null {
  let pin: BendTarget | null = null;
  let best = radius;
  for (const candidate of scene.pins) {
    const distance = Math.hypot(candidate.x - x, candidate.y - y);
    if (distance <= best) { best = distance; pin = candidate; }
  }
  if (pin) return pin;

  let onWire: BendTarget | null = null;
  best = radius;
  for (const wire of scene.wires) {
    for (let i = 1; i < wire.points.length; i++) {
      const a = wire.points[i - 1], b = wire.points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length));
      const px = a.x + t * dx, py = a.y + t * dy;
      const distance = Math.hypot(x - px, y - py);
      if (distance <= best) { best = distance; onWire = { ...wire.target, x: px, y: py }; }
    }
  }
  return onWire;
}

/** Whether a jumper between the two would do anything. */
export function canBend(from: BendTarget | null, to: BendTarget | null): boolean {
  return Boolean(from && to && !from.dead && !to.dead && from.net !== to.net);
}

/** What a jumper is made of. */
export const BEND_KINDS = [
  { id: 'wire', label: 'WIRE', ohms: 1, hint: 'A bare jumper wire: a dead short' },
  { id: '10k', label: '10K', ohms: 10e3, hint: 'A jumper with a 10 kΩ resistor in it: a gentler bend' },
  { id: 'finger', label: 'FINGER', ohms: 500e3, hint: 'A licked finger across the two points: about half a megohm' },
] as const;

export type BendKind = typeof BEND_KINDS[number]['id'];

/** Parts sit on this grid. */
const GRID = 20;
/** Room left between a kept bend and the parts around it. */
const CLEARANCE = 20;
/** How far apart the switch and the resistor of a kept bend are. */
const KEPT_SPACING = 80;

/**
 * Where to put new parts, as near (x, y) as there is room: `offsets` are
 * where each goes relative to the spot. Looks outwards ring by ring on the
 * grid for a spot where none of them touches a part that is already there.
 */
export function freeSpotNear(
  existing: readonly Component[], parts: readonly Component[], offsets: ReadonlyArray<{ x: number; y: number }>,
  x: number, y: number, viewMode: ViewMode,
): { x: number; y: number } {
  const taken = existing.flatMap((c) => componentObstacles(c, c.position, viewMode));
  const fits = (spot: { x: number; y: number }) => parts.every((part, i) => {
    const at = { x: spot.x + offsets[i].x, y: spot.y + offsets[i].y };
    return componentObstacles(part, at, viewMode).every((mine) => taken.every((theirs) =>
      mine.x - CLEARANCE >= theirs.x + theirs.width || mine.x + mine.width + CLEARANCE <= theirs.x
      || mine.y - CLEARANCE >= theirs.y + theirs.height || mine.y + mine.height + CLEARANCE <= theirs.y));
  });
  const start = { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID };
  for (let ring = 0; ring <= 40; ring++) {
    let best: { x: number; y: number } | null = null;
    let nearest = Infinity;
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const spot = { x: start.x + dx * GRID, y: start.y + dy * GRID };
        const distance = Math.hypot(spot.x - x, spot.y - y);
        if (distance < nearest && fits(spot)) { nearest = distance; best = spot; }
      }
    }
    if (best) return best;
  }
  return start;
}

/**
 * A bend made permanent: a switch (closed, so it sounds as the bend did) or a
 * push button between the two points, with a resistor in line if the jumper
 * had one. Returns the parts and wires to add to the circuit.
 */
export function keptBend(
  from: BendTarget, to: BendTarget, ohms: number, type: 'switch' | 'pushbutton',
  existing: readonly Component[], viewMode: ViewMode, lookup: Lookup = fromRegistry,
): { components: Component[]; connections: Connection[] } | null {
  const definition = lookup(type);
  const resistorDefinition = ohms > BEND_KINDS[0].ohms ? lookup('resistor') : undefined;
  if (!definition) return null;
  const control = createComponentFromDefinition(definition, { x: 0, y: 0 }, type === 'switch' ? { closed: 1 } : undefined);
  control.label = 'BEND';
  const resistor = resistorDefinition
    ? createComponentFromDefinition(resistorDefinition, { x: 0, y: 0 }, { resistance: ohms, value: formatValue(ohms, 'resistance') })
    : null;
  const parts = resistor ? [control, resistor] : [control];
  const offsets = resistor ? [{ x: -KEPT_SPACING / 2, y: 0 }, { x: KEPT_SPACING / 2, y: 0 }] : [{ x: 0, y: 0 }];
  const spot = freeSpotNear(existing, parts, offsets, (from.x + to.x) / 2, (from.y + to.y) / 2, viewMode);
  parts.forEach((part, i) => { part.position = { x: spot.x + offsets[i].x, y: spot.y + offsets[i].y }; });

  const wire = (a: BendPoint, b: BendPoint): Connection => ({
    id: generateConnectionId(),
    from: { componentId: a.componentId as ComponentId, pinId: a.pinId as PinId },
    to: { componentId: b.componentId as ComponentId, pinId: b.pinId as PinId },
    net: generateNetId(),
  });
  const pinOf = (part: Component, index: number): BendPoint => ({ componentId: part.id, pinId: part.pins[index].id });
  // Whichever end is on the left gets the part's left pin, so the wires do not cross
  const [left, right] = from.x <= to.x ? [from, to] : [to, from];
  const last = parts[parts.length - 1];
  const connections = [wire(left.point, pinOf(control, 0)), wire(pinOf(last, 1), right.point)];
  if (resistor) connections.push(wire(pinOf(control, 1), pinOf(resistor, 0)));
  return { components: parts, connections };
}
