import type { ComponentId, PinId } from '@/types/circuit';
import { Circuit } from '@/models/Circuit';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates whether a connection between two pins is allowed.
 *
 * Rules:
 * 1. Cannot connect a pin to itself (same component AND same pin)
 * 2. Cannot create duplicate connections (bidirectional check: A->B equals B->A)
 * 3. Both components must exist in the circuit
 * 4. Both pins must exist on their respective components
 */
export function validateConnection(
  fromCompId: ComponentId,
  fromPinId: PinId,
  toCompId: ComponentId,
  toPinId: PinId,
  circuit: Circuit
): ValidationResult {
  // Rule 3: Verify components exist
  const fromComponent = circuit.getComponent(fromCompId);
  if (!fromComponent) {
    return { valid: false, error: `Source component not found: ${fromCompId}` };
  }

  const toComponent = circuit.getComponent(toCompId);
  if (!toComponent) {
    return { valid: false, error: `Target component not found: ${toCompId}` };
  }

  // Rule 4: Verify pins exist on their components
  const fromPin = fromComponent.pins.find((p) => p.id === fromPinId);
  if (!fromPin) {
    return {
      valid: false,
      error: `Pin not found: ${fromPinId} on component ${fromCompId}`,
    };
  }

  const toPin = toComponent.pins.find((p) => p.id === toPinId);
  if (!toPin) {
    return {
      valid: false,
      error: `Pin not found: ${toPinId} on component ${toCompId}`,
    };
  }

  // Rule 1: Cannot connect a pin to itself
  if (fromCompId === toCompId && fromPinId === toPinId) {
    return { valid: false, error: 'Cannot connect a pin to the same pin' };
  }

  // Rule 2: Cannot create duplicate connections (bidirectional check)
  const connections = circuit.getConnections();
  const isDuplicate = connections.some(
    (conn) =>
      (conn.from.componentId === fromCompId &&
        conn.from.pinId === fromPinId &&
        conn.to.componentId === toCompId &&
        conn.to.pinId === toPinId) ||
      (conn.from.componentId === toCompId &&
        conn.from.pinId === toPinId &&
        conn.to.componentId === fromCompId &&
        conn.to.pinId === fromPinId)
  );

  if (isDuplicate) {
    return { valid: false, error: 'A connection already exists between these pins' };
  }

  return { valid: true };
}

/**
 * Generates an orthogonal (Manhattan-style) SVG path between two points.
 * Simple midpoint routing — used as fallback.
 */
export function generateOrthogonalPath(
  x1: number, y1: number,
  x2: number, y2: number
): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1},${y1} H ${midX} V ${y2} H ${x2}`;
}

const STUB = 16; // pin exit stub length
const CORNER_R = 5; // corner radius

type Dir = { dx: number; dy: number };

function posToDir(pos: string): Dir {
  switch (pos) {
    case 'left': return { dx: -1, dy: 0 };
    case 'right': return { dx: 1, dy: 0 };
    case 'top': return { dx: 0, dy: -1 };
    case 'bottom': return { dx: 0, dy: 1 };
    default: return { dx: 1, dy: 0 };
  }
}

/**
 * Build an SVG path through orthogonal points with rounded corners.
 * Consecutive duplicate points are skipped. Collinear segments are merged.
 */
function buildRoundedPath(raw: { x: number; y: number }[]): string {
  // Deduplicate and remove collinear midpoints
  const pts: { x: number; y: number }[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const p = raw[i];
    const last = pts[pts.length - 1];
    if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) continue;
    // Merge collinear
    if (pts.length >= 2) {
      const prev = pts[pts.length - 2];
      const onSameH = Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5;
      const onSameV = Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5;
      if (onSameH || onSameV) { pts[pts.length - 1] = p; continue; }
    }
    pts.push(p);
  }

  if (pts.length < 2) return `M ${raw[0].x},${raw[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;

  let path = `M ${pts[0].x},${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1);
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    if (len1 < 0.5 || len2 < 0.5) { path += ` L ${curr.x},${curr.y}`; continue; }

    const r = Math.min(CORNER_R, len1 / 2, len2 / 2);
    const bx = curr.x - (dx1 / len1) * r;
    const by = curr.y - (dy1 / len1) * r;
    const ax = curr.x + (dx2 / len2) * r;
    const ay = curr.y + (dy2 / len2) * r;

    path += ` L ${bx},${by} Q ${curr.x},${curr.y} ${ax},${ay}`;
  }

  const last = pts[pts.length - 1];
  path += ` L ${last.x},${last.y}`;
  return path;
}

/**
 * Smart orthogonal routing with pin-stub exits and rounded corners.
 *
 * 1. Exits the source pin in its facing direction (stub)
 * 2. Routes orthogonally to the target's stub endpoint
 * 3. Enters the target pin from its facing direction
 * 4. All corners are rounded with CORNER_R radius
 */
export function generateSmartPath(
  sx: number, sy: number, sPos: string,
  tx: number, ty: number, tPos: string,
): string {
  const sd = posToDir(sPos);
  const td = posToDir(tPos);

  // Stub endpoints
  const s1x = sx + sd.dx * STUB;
  const s1y = sy + sd.dy * STUB;
  const t1x = tx + td.dx * STUB;
  const t1y = ty + td.dy * STUB;

  const points: { x: number; y: number }[] = [{ x: sx, y: sy }];

  // Add stub exit
  points.push({ x: s1x, y: s1y });

  // Route from stub to stub
  const bothHorizontal = sd.dx !== 0 && td.dx !== 0;
  const bothVertical = sd.dy !== 0 && td.dy !== 0;

  if (bothHorizontal) {
    // Pins face each other with room → route through midpoint
    if ((sd.dx > 0 && s1x < t1x) || (sd.dx < 0 && s1x > t1x)) {
      const midX = (s1x + t1x) / 2;
      points.push({ x: midX, y: s1y });
      points.push({ x: midX, y: t1y });
    }
    // Same direction, source stub is "behind" target stub → clean L-route
    else if ((sd.dx < 0 && s1x < t1x) || (sd.dx > 0 && s1x > t1x)) {
      points.push({ x: s1x, y: t1y });
    }
    // Same direction, stubs overlap → detour around
    else {
      const detourY = Math.abs(sy - ty) < 30
        ? Math.min(s1y, t1y) - 50
        : (s1y + t1y) / 2;
      points.push({ x: s1x, y: detourY });
      points.push({ x: t1x, y: detourY });
    }
  } else if (bothVertical) {
    if ((sd.dy > 0 && s1y < t1y) || (sd.dy < 0 && s1y > t1y)) {
      const midY = (s1y + t1y) / 2;
      points.push({ x: s1x, y: midY });
      points.push({ x: t1x, y: midY });
    } else if ((sd.dy < 0 && s1y < t1y) || (sd.dy > 0 && s1y > t1y)) {
      points.push({ x: t1x, y: s1y });
    } else {
      const detourX = Math.abs(sx - tx) < 30
        ? Math.min(s1x, t1x) - 50
        : (s1x + t1x) / 2;
      points.push({ x: detourX, y: s1y });
      points.push({ x: detourX, y: t1y });
    }
  } else {
    // Mixed: one horizontal, one vertical — L-shaped route
    if (sd.dx !== 0) {
      // Source horizontal, target vertical
      points.push({ x: t1x, y: s1y });
    } else {
      // Source vertical, target horizontal
      points.push({ x: s1x, y: t1y });
    }
  }

  // Add stub entry
  points.push({ x: t1x, y: t1y });
  points.push({ x: tx, y: ty });

  return buildRoundedPath(points);
}

/**
 * Generates an orthogonal SVG path through waypoints.
 */
export function generateWaypointPath(
  x1: number, y1: number,
  x2: number, y2: number,
  waypoints?: { x: number; y: number }[]
): string {
  if (!waypoints || waypoints.length === 0) {
    return generateOrthogonalPath(x1, y1, x2, y2);
  }

  const points = [
    { x: x1, y: y1 },
    ...waypoints,
    { x: x2, y: y2 },
  ];

  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.x !== curr.x) path += ` H ${curr.x}`;
    if (prev.y !== curr.y) path += ` V ${curr.y}`;
  }

  return path;
}

/**
 * Computes the minimum distance from a point to a line segment.
 */
export function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Get all line segments from an edge path (source -> waypoints -> target).
 */
export function getEdgeSegments(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  waypoints?: { x: number; y: number }[]
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const points = [
    { x: sourceX, y: sourceY },
    ...(waypoints || []),
    { x: targetX, y: targetY },
  ];

  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x !== b.x && a.y !== b.y) {
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: a.y });
      segments.push({ x1: b.x, y1: a.y, x2: b.x, y2: b.y });
    } else {
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return segments;
}
