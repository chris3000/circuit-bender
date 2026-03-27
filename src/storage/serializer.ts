import LZString from 'lz-string';
import { Circuit } from '@/models/Circuit';
import type { ComponentId, Component, SerializedCircuit } from '@/types/circuit';

interface CompressedCircuit {
  version: string;
  circuit: {
    id: string;
    name: string;
    components: [ComponentId, Omit<Component, 'state'>][];
    connections: SerializedCircuit['connections'];
    metadata: SerializedCircuit['metadata'];
  };
}

export function serializeCircuit(circuit: Circuit): string {
  const data = circuit.toJSON();

  // Strip runtime state from components
  const components: [ComponentId, Omit<Component, 'state'>][] = data.components.map(
    ([id, comp]) => [
      id,
      {
        id: comp.id,
        type: comp.type,
        position: comp.position,
        rotation: comp.rotation,
        parameters: comp.parameters,
        pins: comp.pins,
      },
    ]
  );

  const serialized: CompressedCircuit = {
    version: '1.0',
    circuit: {
      id: data.id,
      name: data.name,
      components,
      connections: data.connections,
      metadata: data.metadata,
    },
  };

  const json = JSON.stringify(serialized);
  return LZString.compressToUTF16(json);
}

export function deserializeCircuit(compressed: string): Circuit {
  const json = LZString.decompressFromUTF16(compressed);
  if (!json) {
    throw new Error('Failed to decompress circuit data');
  }

  const data: CompressedCircuit = JSON.parse(json);

  if (data.version !== '1.0') {
    throw new Error(`Unsupported circuit version: ${data.version}`);
  }

  // Reconstruct components with runtime state (empty Maps)
  const components: [ComponentId, Component][] = data.circuit.components.map(
    ([id, comp]) => [
      id,
      {
        ...comp,
        state: {
          voltages: new Map(),
          currents: new Map(),
        },
      } as Component,
    ]
  );

  return Circuit.fromJSON({
    id: data.circuit.id,
    name: data.circuit.name,
    components,
    connections: data.circuit.connections,
    metadata: data.circuit.metadata,
  });
}
