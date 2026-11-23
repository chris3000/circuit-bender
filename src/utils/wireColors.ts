import type { Connection, ConnectionId } from '@/types/circuit';

/**
 * Colors a wire can be given. Each has a shade for the white schematic and
 * one for the green board, since no single shade reads well on both.
 */
export interface WireColor {
  id: string;
  name: string;
  schematic: string;
  board: string;
}

export const WIRE_COLORS: readonly WireColor[] = [
  { id: 'red', name: 'Red', schematic: '#D92B2B', board: '#FF6B6B' },
  { id: 'orange', name: 'Orange', schematic: '#E07B00', board: '#FFA940' },
  { id: 'yellow', name: 'Yellow', schematic: '#B58900', board: '#FFE04D' },
  { id: 'green', name: 'Green', schematic: '#1E9E4A', board: '#8CF5A6' },
  { id: 'blue', name: 'Blue', schematic: '#1F6FD6', board: '#7CC0FF' },
  { id: 'purple', name: 'Purple', schematic: '#8A3FD1', board: '#CFA6FF' },
  { id: 'grey', name: 'Grey', schematic: '#7A7A7A', board: '#F2F2F2' },
];

export function wireColor(id: string | undefined): WireColor | undefined {
  return id === undefined ? undefined : WIRE_COLORS.find((c) => c.id === id);
}

const pinKey = (end: Connection['from']) => `${end.componentId}::${end.pinId}`;

/**
 * Which wires are joined: wires that share a pin (directly or through other
 * wires) are one net. Returns a net number for every wire.
 */
export function wireNets(connections: readonly Connection[]): Map<ConnectionId, number> {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(key, root);
    return root;
  };
  for (const c of connections) {
    const a = find(pinKey(c.from)), b = find(pinKey(c.to));
    parent.set(a, a);
    parent.set(b, a);
  }
  const numbers = new Map<string, number>();
  const nets = new Map<ConnectionId, number>();
  for (const c of connections) {
    const root = find(pinKey(c.from));
    if (!numbers.has(root)) numbers.set(root, numbers.size);
    nets.set(c.id, numbers.get(root)!);
  }
  return nets;
}

/**
 * The color each wire is drawn in. A color belongs to a whole net: joined
 * wires are one conductor and are drawn sharing track, so they cannot differ.
 * A wire added to a colored net takes its color; where two colored nets have
 * been joined, the earlier wire's color wins.
 */
export function resolveWireColors(connections: readonly Connection[]): Map<ConnectionId, WireColor> {
  const nets = wireNets(connections);
  const netColor = new Map<number, WireColor>();
  for (const c of connections) {
    const net = nets.get(c.id)!;
    const color = wireColor(c.color);
    if (color && !netColor.has(net)) netColor.set(net, color);
  }
  const resolved = new Map<ConnectionId, WireColor>();
  for (const c of connections) {
    const color = netColor.get(nets.get(c.id)!);
    if (color) resolved.set(c.id, color);
  }
  return resolved;
}
