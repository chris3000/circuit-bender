import type { Circuit } from '@/models/Circuit';
import type { MeterTarget } from '@/simulation/worklet/Instruments';

/**
 * What the meter reads for a selection: the voltage of a single wire (or
 * junction), or the current through and the voltage across a single part
 * with two legs. Anything else is not something one number can be read off.
 */
export function meterTargetOf(circuit: Circuit, parts: readonly string[], wires: readonly string[]): MeterTarget | null {
  if (parts.length === 0 && wires.length === 1) {
    const wire = circuit.getConnections().find((c) => c.id === wires[0]);
    return wire ? { componentId: wire.from.componentId, pinId: wire.from.pinId } : null;
  }
  if (parts.length !== 1 || wires.length !== 0) return null;
  const part = circuit.getComponents().find((c) => c.id === parts[0]);
  if (!part) return null;
  if (part.type === 'junction') return { componentId: part.id, pinId: part.pins[0].id };
  return part.pins.length === 2 ? { componentId: part.id } : null;
}

export const sameTarget = (a: MeterTarget | null, b: MeterTarget | null): boolean =>
  a === b || (a !== null && b !== null && a.componentId === b.componentId && a.pinId === b.pinId);
