import { Circuit } from '@/models/Circuit';
import { serializeCircuit, deserializeCircuit } from './serializer';
import type { CircuitMetadata } from '@/types/circuit';

const STORAGE_KEY_PREFIX = 'circuit_bender_';
const CIRCUITS_INDEX_KEY = `${STORAGE_KEY_PREFIX}index`;

interface CircuitListItem {
  id: string;
  name: string;
  metadata: CircuitMetadata;
}

export class StorageManager {
  saveCircuit(circuit: Circuit): void {
    const key = this.getCircuitKey(circuit.id);
    const serialized = serializeCircuit(circuit);

    localStorage.setItem(key, serialized);
    this.updateIndex(circuit);
  }

  loadCircuit(id: string): Circuit | null {
    const key = this.getCircuitKey(id);
    const data = localStorage.getItem(key);

    if (!data) {
      return null;
    }

    try {
      return deserializeCircuit(data);
    } catch (error) {
      console.error('Failed to load circuit:', error);
      return null;
    }
  }

  listCircuits(): CircuitListItem[] {
    const indexData = localStorage.getItem(CIRCUITS_INDEX_KEY);
    if (!indexData) {
      return [];
    }

    try {
      return JSON.parse(indexData);
    } catch {
      return [];
    }
  }

  deleteCircuit(id: string): void {
    const key = this.getCircuitKey(id);
    localStorage.removeItem(key);
    this.removeFromIndex(id);
  }

  private getCircuitKey(id: string): string {
    return `${STORAGE_KEY_PREFIX}${id}`;
  }

  private updateIndex(circuit: Circuit): void {
    const circuits = this.listCircuits();
    const existing = circuits.findIndex((c) => c.id === circuit.id);

    const item: CircuitListItem = {
      id: circuit.id,
      name: circuit.name,
      metadata: circuit.metadata,
    };

    if (existing >= 0) {
      circuits[existing] = item;
    } else {
      circuits.push(item);
    }

    localStorage.setItem(CIRCUITS_INDEX_KEY, JSON.stringify(circuits));
  }

  private removeFromIndex(id: string): void {
    const circuits = this.listCircuits().filter((c) => c.id !== id);
    localStorage.setItem(CIRCUITS_INDEX_KEY, JSON.stringify(circuits));
  }
}
