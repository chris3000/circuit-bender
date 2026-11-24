import type { Circuit } from '@/models/Circuit';
import type { SerializedComponent, SerializedConnection } from '@/simulation/solver/MNASolver';

/**
 * A circuit as the simulation takes it: the parts, their pins and
 * parameters, and what is wired to what. Where things are on the canvas,
 * what they are called and what color the wires are stay behind.
 */
export function serializeCircuit(circuit: Circuit): { components: SerializedComponent[]; connections: SerializedConnection[] } {
  const components = circuit.getComponents().map((comp) => ({
    id: comp.id,
    type: comp.type,
    pins: comp.pins.map((p) => ({ id: p.id, label: p.label, type: p.type })),
    parameters: { ...comp.parameters },
  }));
  const connections = circuit.getConnections().map((conn) => ({
    id: conn.id,
    from: { componentId: conn.from.componentId, pinId: conn.from.pinId },
    to: { componentId: conn.to.componentId, pinId: conn.to.pinId },
  }));
  return { components, connections };
}
