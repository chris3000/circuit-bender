/**
 * Where a part goes when it is let go of on a wire: which wire, where on it
 * the part sits, how it is turned, and which of the wire's ends takes which
 * leg. The pure part of dropping a part into a wire; `spliceIntoWire`
 * (utils/circuitEdits) does the rewiring.
 */
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component, ConnectionId, Position2D } from '@/types/circuit';
import { throughPins } from '@/utils/circuitEdits';
import { rotatePin } from './routing/layout';
import type { WireRoutes } from './routing/useWireRoutes';

/** How near a wire (in canvas px) a part must be let go of to land in it. */
export const SPLICE_REACH = 15;

/** The grid parts sit on. */
const GRID = 20;
const snap = (value: number) => Math.round(value / GRID) * GRID;

export interface WirePlace {
  connectionId: ConnectionId;
  /** Where the part's centre goes, and how it is turned, to lie along the wire. */
  position: Position2D;
  rotation: number;
  /** The wire's `from` end takes the second through pin, not the first. */
  swap: boolean;
}

/**
 * The wire a part let go of at `at` lands in, or null if it is not on one
 * (or cannot sit in a wire at all). A part with two legs is turned to lie
 * along the wire and put exactly on it, so the wire runs straight through;
 * a part with more keeps the way it is turned and goes where it was dropped.
 */
export function placeOnWire(part: Component, at: Position2D, routes: WireRoutes, reach = SPLICE_REACH): WirePlace | null {
  const through = throughPins(ComponentRegistry.getInstance().get(part.type));
  if (!through) return null;
  const pinA = part.pins[through[0]], pinB = part.pins[through[1]];
  if (!pinA || !pinB) return null;

  // The stretch of wire nearest the drop, as the wires are drawn
  let nearest: { id: string; from: Position2D; to: Position2D; point: Position2D; distance: number } | null = null;
  for (const [id, route] of routes) {
    for (let i = 1; i < route.points.length; i++) {
      const from = route.points[i - 1], to = route.points[i];
      const dx = to.x - from.x, dy = to.y - from.y;
      const length2 = dx * dx + dy * dy;
      if (length2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((at.x - from.x) * dx + (at.y - from.y) * dy) / length2));
      const point = { x: from.x + t * dx, y: from.y + t * dy };
      const distance = Math.hypot(at.x - point.x, at.y - point.y);
      if (distance <= reach && (!nearest || distance < nearest.distance)) nearest = { id, from, to, point, distance };
    }
  }
  if (!nearest) return null;
  const route = routes.get(nearest.id)!.points;

  // Which way the wire runs here, from its `from` end towards its `to` end
  const length = Math.hypot(nearest.to.x - nearest.from.x, nearest.to.y - nearest.from.y);
  const along = { x: (nearest.to.x - nearest.from.x) / length, y: (nearest.to.y - nearest.from.y) / length };

  let rotation = (((part.rotation || 0) % 360) + 360) % 360;
  const legs = (turned: number) => {
    const a = rotatePin(pinA.position.x, pinA.position.y, turned);
    const b = rotatePin(pinB.position.x, pinB.position.y, turned);
    const axis = { x: b.x - a.x, y: b.y - a.y };
    return { a, b, with: axis.x * along.x + axis.y * along.y, across: axis.x * along.y - axis.y * along.x };
  };
  let lie = legs(rotation);
  // Two legs across the wire: turn the part a quarter so they lie along it
  if (part.pins.length === 2 && Math.abs(lie.with) < Math.abs(lie.across)) {
    rotation = (rotation + 90) % 360;
    lie = legs(rotation);
  }

  let position = { x: snap(at.x), y: snap(at.y) };
  if (Math.abs(lie.across) < 0.5) {
    // Legs in line with the wire: slide the part across until they are on it
    if (Math.abs(along.y) < 1e-6) position = { x: snap(at.x), y: nearest.point.y - lie.a.y };
    else if (Math.abs(along.x) < 1e-6) position = { x: nearest.point.x - lie.a.x, y: snap(at.y) };
  }

  // Each end of the wire takes the leg on its side...
  let swap = lie.with < 0;
  if (Math.abs(lie.with) < 0.5) {
    // ...or, for legs that are side by side, the leg it is nearer to
    const a = { x: position.x + lie.a.x, y: position.y + lie.a.y };
    const b = { x: position.x + lie.b.x, y: position.y + lie.b.y };
    const first = route[0], last = route[route.length - 1];
    const gap = (p: Position2D, q: Position2D) => Math.hypot(p.x - q.x, p.y - q.y);
    swap = gap(b, first) + gap(a, last) < gap(a, first) + gap(b, last);
  }

  return { connectionId: nearest.id as ConnectionId, position, rotation, swap };
}
