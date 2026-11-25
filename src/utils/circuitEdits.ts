/**
 * Edits that keep a circuit wired while a part comes or goes: a part dropped
 * into a wire, a wire joined to a wire, a part taken out of one, a part swapped
 * for another. Each takes a circuit and returns the next one, so each is a
 * single undo step.
 *
 * Nothing here knows any particular part. What it needs to know about a kind
 * of part is in its definition: the two pins a wire runs through it by
 * (`through`), and what it is alike (`shelf.alike`).
 */
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Circuit } from '@/models/Circuit';
import type {
  Component, ComponentDefinition, ComponentId, ComponentParameters, Connection, ConnectionId, PinId,
} from '@/types/circuit';
import { createComponentFromDefinition } from './componentFactory';
import { generateConnectionId, generateNetId } from './ids';

type End = Connection['from'];

const definitionOf = (type: string) => ComponentRegistry.getInstance().get(type);
const endKey = (end: End) => `${end.componentId}::${end.pinId}`;
const sameEnd = (a: End, b: End) => a.componentId === b.componentId && a.pinId === b.pinId;

function wire(from: End, to: End, color: string | undefined): Connection {
  return { id: generateConnectionId(), from, to, net: generateNetId(), ...(color ? { color } : {}) };
}

/**
 * The two pins (by position among the part's pins) that a wire goes in and
 * out by when the part sits in it: a part with two legs has only those; a
 * part with more says which in its definition. Null for a part that cannot
 * sit in a wire (one leg, or a supply).
 */
export function throughPins(definition: ComponentDefinition | undefined): [number, number] | null {
  if (!definition) return null;
  if (definition.through) return definition.through;
  if (definition.pins.length !== 2) return null;
  // The supply's legs are where the current comes from and goes back to, not a way through
  if (definition.pins.some((pin) => pin.type === 'power' || pin.type === 'ground')) return null;
  return [0, 1];
}

/** Which net every pin is on: joined by wire, and every ground symbol is the same one. */
function netFinder(components: readonly Component[], connections: readonly Connection[]): (end: End) => string {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    if (root !== key) parent.set(key, root);
    return root;
  };
  for (const c of connections) parent.set(find(endKey(c.from)), find(endKey(c.to)));
  for (const component of components) {
    if (component.type !== 'ground') continue;
    for (const pin of component.pins) parent.set(find(`${component.id}::${pin.id}`), find('ground'));
  }
  return (end) => find(endKey(end));
}

// --- A part dropped into a wire ---

/**
 * Put `part` into a wire: the wire is cut, and its two ends go to the part's
 * two through pins (the wire's `from` end to the first of them, or to the
 * second when `swap` says the part lies the other way round). The part is
 * added if it is not on the canvas yet, and moved or turned to match `part`
 * if it is. The circuit comes back unchanged when the part cannot sit in a wire.
 */
export function spliceIntoWire(circuit: Circuit, part: Component, connectionId: ConnectionId, swap = false): Circuit {
  const through = throughPins(definitionOf(part.type));
  const cut = circuit.getConnections().find((c) => c.id === connectionId);
  if (!through || !cut) return circuit;
  const [first, second] = swap ? [through[1], through[0]] : through;
  const pinA = part.pins[first], pinB = part.pins[second];
  if (!pinA || !pinB) return circuit;
  // A wire that already ends on the part cannot have the part put into it
  if (cut.from.componentId === part.id || cut.to.componentId === part.id) return circuit;

  let next = circuit.getComponent(part.id)
    ? circuit.updateComponent(part.id, { position: { ...part.position }, rotation: part.rotation })
    : circuit.addComponent(part);
  next = next.removeConnection(cut.id);
  // Both halves keep the wire's color
  next = next.addConnection(wire(cut.from, { componentId: part.id, pinId: pinA.id }, cut.color));
  next = next.addConnection(wire({ componentId: part.id, pinId: pinB.id }, cut.to, cut.color));
  return next;
}

// --- A wire joined to a wire, parts turned ---

/**
 * Cut a wire at a junction dot (`junction`, not on the canvas yet) and bring
 * `from` to the dot as well, if given: a wire dragged from a pin and let go
 * on this one. Without it the wire just gains a dot to wire from. The pieces
 * keep the wire's color.
 */
export function joinAtWire(circuit: Circuit, connectionId: ConnectionId, junction: Component, from?: End): Circuit {
  const cut = circuit.getConnections().find((c) => c.id === connectionId);
  const pin = junction.pins[0];
  if (!cut || !pin) return circuit;
  if (from && (sameEnd(from, cut.from) || sameEnd(from, cut.to))) return circuit; // it is on this wire already
  const dot: End = { componentId: junction.id, pinId: pin.id };
  let next = circuit.addComponent(junction).removeConnection(cut.id);
  next = next.addConnection(wire(cut.from, dot, cut.color));
  next = next.addConnection(wire(dot, cut.to, cut.color));
  if (from) next = next.addConnection(wire(from, dot, cut.color));
  return next;
}

/** Turn parts by `by` degrees, each about its own middle. A junction dot looks the same any way up and is left. */
export function rotateParts(circuit: Circuit, partIds: readonly ComponentId[], by: number): Circuit {
  let next = circuit;
  for (const id of partIds) {
    const part = next.getComponent(id);
    if (!part || part.type === 'junction') continue;
    next = next.updateComponent(id, { rotation: (((part.rotation || 0) + by) % 360 + 360) % 360 });
  }
  return next;
}

// --- A part taken out ---

/**
 * Whether taking this part out should close the wire it sat in: its through
 * pins are both wired, nothing else on it is (bar its supply pins), and no
 * other part reaches both sides. That last is what tells a part in a wire
 * from a part across something: a resistor from a gate's output back to its
 * input, a capacitor from a chip's pin to ground, one of two parts side by
 * side. Joining those would short what they sat across. A part that runs to
 * ground or the supply from a point where two or more other parts meet is
 * across something too.
 */
function sitsInWire(circuit: Circuit, part: Component): [PinId, PinId] | null {
  const through = throughPins(definitionOf(part.type));
  if (!through) return null;
  const a = part.pins[through[0]], b = part.pins[through[1]];
  if (!a || !b) return null;
  const connections = circuit.getConnections();
  const wired = new Set<string>();
  for (const c of connections) {
    if (c.from.componentId === part.id) wired.add(c.from.pinId);
    if (c.to.componentId === part.id) wired.add(c.to.pinId);
  }
  if (!wired.has(a.id) || !wired.has(b.id)) return null;
  for (const pin of part.pins) {
    if (pin.id === a.id || pin.id === b.id || !wired.has(pin.id)) continue;
    if (pin.type !== 'power' && pin.type !== 'ground') return null;
  }

  // The two sides as they would be without the part
  const others = circuit.getComponents().filter((c) => c.id !== part.id);
  const rest = connections.filter((c) => c.from.componentId !== part.id && c.to.componentId !== part.id);
  const netOf = netFinder(others, rest);
  const sides = [a.id, b.id].map((pinId) => new Set(
    connections.flatMap((c) => {
      if (c.from.componentId === part.id && c.from.pinId === pinId && c.to.componentId !== part.id) return [netOf(c.to)];
      if (c.to.componentId === part.id && c.to.pinId === pinId && c.from.componentId !== part.id) return [netOf(c.from)];
      return [];
    }),
  ));
  if (sides[0].size === 0 || sides[1].size === 0) return null;
  // Already one piece of wire without the part: nothing to close
  if ([...sides[0]].some((net) => sides[1].has(net))) return null;
  for (const other of others) {
    const nets = other.pins.map((pin) => netOf({ componentId: other.id, pinId: pin.id }));
    if (nets.some((net) => sides[0].has(net)) && nets.some((net) => sides[1].has(net))) return null;
  }
  // A part from a point to ground or to the supply is in a wire only when it
  // is that point's one way on (an LED's resistor). From a point where other
  // parts meet (a filter's capacitor, a pull-down) it is a branch: closing
  // the wire would short everything on that point to the rail.
  const rails = new Set(others
    .filter((c) => c.type === 'ground' || c.type === 'power')
    .flatMap((c) => c.pins.map((pin) => netOf({ componentId: c.id, pinId: pin.id }))));
  for (const [rail, point] of [[sides[0], sides[1]], [sides[1], sides[0]]]) {
    if (![...rail].some((net) => rails.has(net)) || [...point].some((net) => rails.has(net))) continue;
    const pinsThere = others
      .filter((c) => c.type !== 'junction')
      .reduce((count, c) => count + c.pins.filter((pin) => point.has(netOf({ componentId: c.id, pinId: pin.id }))).length, 0);
    if (pinsThere > 1) return null;
  }
  return [a.id, b.id];
}

/** Take one part out, joining up what should stay joined. */
function removePart(circuit: Circuit, partId: ComponentId): Circuit {
  const part = circuit.getComponent(partId);
  if (!part) return circuit;
  const connections = circuit.getConnections();
  const onPart = connections.filter((c) => c.from.componentId === partId || c.to.componentId === partId);

  // The ends that were joined through the part, and so are to stay joined:
  // through a part that sat in a wire, both sides of it; through a junction
  // dot with two wires, those two
  let pins: PinId[] | null = sitsInWire(circuit, part);
  if (!pins && part.type === 'junction' && onPart.length === 2) pins = part.pins.map((pin) => pin.id);

  let next = circuit.removeComponent(partId);
  if (!pins) return next;

  const ends: End[] = [];
  for (const pinId of pins) {
    for (const c of onPart) {
      const here = c.from.componentId === partId && c.from.pinId === pinId ? c.to
        : c.to.componentId === partId && c.to.pinId === pinId ? c.from : null;
      if (here && here.componentId !== partId && !ends.some((end) => sameEnd(end, here))) ends.push(here);
    }
  }
  const color = onPart.find((c) => c.color)?.color;
  // One wire where there were two; more ends than that (a pin with several
  // wires on it) each get a wire to the first, unless they are joined already
  for (let i = 1; i < ends.length; i++) {
    const netOf = netFinder(next.getComponents(), next.getConnections());
    if (netOf(ends[i]) === netOf(ends[0])) continue;
    next = next.addConnection(wire(ends[0], ends[i], color));
  }
  return next;
}

/**
 * Delete parts and wires. A part that sat in a wire leaves the wire whole:
 * what was on its two sides is wired together, so the current still has its
 * way round. The wires given are taken off first, so a part deleted along
 * with one of its own wires closes nothing.
 */
export function removeFromCircuit(circuit: Circuit, partIds: readonly ComponentId[], wireIds: readonly ConnectionId[] = []): Circuit {
  let next = circuit;
  const there = new Set(circuit.getConnections().map((c) => c.id));
  for (const id of wireIds) if (there.has(id)) next = next.removeConnection(id);
  for (const id of partIds) next = removePart(next, id);
  return next;
}

// --- A part swapped for another ---

/** The pins of a part that have a wire on them, in pin order. */
function wiredPins(circuit: Circuit, part: Component): number[] {
  const wired = new Set<string>();
  for (const c of circuit.getConnections()) {
    if (c.from.componentId === part.id) wired.add(c.from.pinId);
    if (c.to.componentId === part.id) wired.add(c.to.pinId);
  }
  return part.pins.flatMap((pin, index) => (wired.has(pin.id) ? [index] : []));
}

/**
 * Where each wired pin of `part` goes on a part of another kind, or null if
 * that kind has too few legs to take the wires. A pin goes to the pin of the
 * same name if there is one (VDD to VDD, A to A), a through pin to the
 * matching through pin (a resistor's two legs to a pot's end and wiper), and
 * anything else to the first leg still free, one of its own type for choice.
 */
function pinMapping(circuit: Circuit, part: Component, definition: ComponentDefinition): Map<number, number> | null {
  const wired = wiredPins(circuit, part);
  if (wired.length > definition.pins.length) return null;
  const mapping = new Map<number, number>();
  const taken = new Set<number>();
  const give = (from: number, to: number) => { mapping.set(from, to); taken.add(to); };

  const oldThrough = throughPins(definitionOf(part.type));
  const newThrough = throughPins(definition);
  for (const index of wired) {
    const to = definition.pins.findIndex((pin, i) => !taken.has(i) && pin.label === part.pins[index].label);
    if (to >= 0) give(index, to);
  }
  if (oldThrough && newThrough) {
    oldThrough.forEach((index, side) => {
      if (wired.includes(index) && !mapping.has(index) && !taken.has(newThrough[side])) give(index, newThrough[side]);
    });
    // ...and the other way round, when only that way is free (the name took the first)
    oldThrough.forEach((index, side) => {
      if (wired.includes(index) && !mapping.has(index) && !taken.has(newThrough[1 - side])) give(index, newThrough[1 - side]);
    });
  }
  for (const index of wired) {
    if (mapping.has(index)) continue;
    const free = definition.pins.map((_, i) => i).filter((i) => !taken.has(i));
    const to = free.find((i) => definition.pins[i].type === part.pins[index].type) ?? free[0];
    if (to === undefined) return null;
    give(index, to);
  }
  return mapping;
}

/** Whether a part of this kind could take the place of `partId`: it has a leg for every wire. */
export function fitsInPlaceOf(circuit: Circuit, partId: ComponentId, definition: ComponentDefinition): boolean {
  const part = circuit.getComponent(partId);
  if (!part) return false;
  return part.type === definition.type || pinMapping(circuit, part, definition) !== null;
}

/**
 * Swap a part for another kind, or for another value of its own kind. It
 * stays where it is, the way it is turned and with its name, and its wires
 * move to the new part's legs. Returns the circuit and the id the part now
 * has (a new one when its kind changed: `newId` if given), or the same
 * circuit if it will not fit.
 */
export function replacePart(
  circuit: Circuit, partId: ComponentId, definition: ComponentDefinition, parameters: ComponentParameters = {},
  newId?: ComponentId,
): { circuit: Circuit; id: ComponentId } {
  const part = circuit.getComponent(partId);
  if (!part) return { circuit, id: partId };

  // Another value of the same part: only what it was asked to be changes
  if (part.type === definition.type) {
    const changed = Object.entries(parameters).some(([key, value]) => part.parameters[key] !== value);
    if (!changed) return { circuit, id: partId };
    return { circuit: circuit.updateComponent(partId, { parameters: { ...part.parameters, ...parameters } }), id: partId };
  }

  const mapping = pinMapping(circuit, part, definition);
  if (!mapping) return { circuit, id: partId };
  const replacement: Component = {
    ...createComponentFromDefinition(definition, { ...part.position }, parameters),
    ...(newId ? { id: newId } : {}),
    rotation: part.rotation,
    ...(part.label ? { label: part.label } : {}),
  };
  const moved = (end: End): End => {
    if (end.componentId !== partId) return end;
    const from = part.pins.findIndex((pin) => pin.id === end.pinId);
    return { componentId: replacement.id, pinId: replacement.pins[mapping.get(from)!].id };
  };

  const wires = circuit.getConnections();
  let next = circuit.removeComponent(partId).addComponent(replacement);
  for (const c of wires) {
    if (c.from.componentId !== partId && c.to.componentId !== partId) continue;
    next = next.addConnection({ ...c, from: moved(c.from), to: moved(c.to) });
  }
  return { circuit: next, id: replacement.id };
}

/**
 * The parts that are like this one: those that share one of the kinds it
 * says it is (`shelf.alike`), in the order they are registered.
 */
export function similarParts(definition: ComponentDefinition, definitions: readonly ComponentDefinition[]): ComponentDefinition[] {
  const kinds = definition.shelf?.alike ?? [];
  if (kinds.length === 0) return [];
  return definitions.filter((other) => other.type !== definition.type
    && (other.shelf?.alike ?? []).some((kind) => kinds.includes(kind)));
}
