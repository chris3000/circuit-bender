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

/** A circuit as plain data: everything that is saved, without the simulation's runtime state. */
function toStored(circuit: Circuit): CompressedCircuit {
  const data = circuit.toJSON();
  const components: [ComponentId, Omit<Component, 'state'>][] = data.components.map(([id, comp]) => {
    // Everything but the runtime state: a field added to a part later (its
    // name, say) must not need remembering here to survive a save
    const { state: _state, ...saved } = comp;
    void _state;
    return [id, saved];
  });
  return {
    version: '1.0',
    circuit: {
      id: data.id,
      name: data.name,
      components,
      connections: data.connections,
      metadata: data.metadata,
    },
  };
}

function fromStored(data: CompressedCircuit): Circuit {
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

export function serializeCircuit(circuit: Circuit): string {
  return LZString.compressToUTF16(JSON.stringify(toStored(circuit)));
}

export function deserializeCircuit(compressed: string): Circuit {
  const json = LZString.decompressFromUTF16(compressed);
  if (!json) {
    throw new Error('Failed to decompress circuit data');
  }
  return fromStored(JSON.parse(json));
}

// --- Circuit files: readable JSON, for keeping a circuit outside this browser ---

const FILE_FORMAT = 'circuit-bender';

/** The contents of a circuit file. */
export function exportCircuitFile(circuit: Circuit): string {
  return JSON.stringify({ format: FILE_FORMAT, ...toStored(circuit) }, null, 2);
}

/** A file name for a circuit: "MFOS Weird Sound Generator" → "mfos-weird-sound-generator.circuit.json". */
export function circuitFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'circuit'}.circuit.json`;
}

const isPoint = (p: unknown): boolean =>
  typeof p === 'object' && p !== null
  && Number.isFinite((p as { x: unknown }).x) && Number.isFinite((p as { y: unknown }).y);

/**
 * Read a circuit file. Throws an Error whose message can be shown to the
 * person who chose the file. `knownTypes` is the parts this app can draw and
 * simulate; a file using any other is refused rather than half loaded.
 */
export function importCircuitFile(text: string, knownTypes: ReadonlySet<string>): Circuit {
  let data: Partial<CompressedCircuit> & { format?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This is not a circuit file (it is not valid JSON).');
  }
  const circuit = data?.circuit;
  if (data?.format !== FILE_FORMAT || typeof circuit !== 'object' || circuit === null) {
    throw new Error('This is not a Circuit Bender file.');
  }
  if (data.version !== '1.0') {
    throw new Error(`This file is from a version of Circuit Bender this one cannot read (${String(data.version)}).`);
  }
  if (typeof circuit.id !== 'string' || typeof circuit.name !== 'string'
    || !Array.isArray(circuit.components) || !Array.isArray(circuit.connections)) {
    throw new Error('This circuit file is damaged.');
  }

  const pins = new Set<string>();
  for (const entry of circuit.components) {
    const comp = Array.isArray(entry) ? entry[1] : null;
    if (!comp || entry[0] !== comp.id || typeof comp.id !== 'string' || typeof comp.type !== 'string'
      || !isPoint(comp.position) || !Array.isArray(comp.pins)
      || typeof comp.parameters !== 'object' || comp.parameters === null) {
      throw new Error('This circuit file is damaged (a part is incomplete).');
    }
    if (!knownTypes.has(comp.type)) {
      throw new Error(`This circuit uses a part this version does not have: "${comp.type}".`);
    }
    for (const pin of comp.pins) {
      if (!pin || typeof pin.id !== 'string' || !isPoint(pin.position)) {
        throw new Error('This circuit file is damaged (a pin is incomplete).');
      }
      pins.add(`${comp.id}::${pin.id}`);
    }
  }
  for (const conn of circuit.connections) {
    const ends = [conn?.from, conn?.to];
    if (typeof conn?.id !== 'string' || ends.some(e => !e || !pins.has(`${e.componentId}::${e.pinId}`))) {
      throw new Error('This circuit file is damaged (a wire goes to a part that is not in it).');
    }
  }

  const now = new Date().toISOString();
  return fromStored({
    version: '1.0',
    circuit: {
      ...circuit,
      metadata: { created: now, modified: now, componentLibraryVersion: '1.0', ...((circuit.metadata ?? {}) as Partial<SerializedCircuit['metadata']>) },
    },
  });
}
