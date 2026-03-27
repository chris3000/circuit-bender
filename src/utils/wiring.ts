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
