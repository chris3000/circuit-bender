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
 *
 * The path routes: horizontal to midpoint -> vertical -> horizontal to end.
 * This matches the PreviewWire routing for consistency.
 */
export function generateOrthogonalPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1},${y1} H ${midX} V ${y2} H ${x2}`;
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
