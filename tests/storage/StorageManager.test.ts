import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageManager } from '@/storage/StorageManager';
import { Circuit } from '@/models/Circuit';

describe('StorageManager', () => {
  let storage: StorageManager;

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageManager();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should save circuit to localStorage', () => {
    const circuit = new Circuit('Test Circuit');
    storage.saveCircuit(circuit);

    const loaded = storage.loadCircuit(circuit.id);
    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe(circuit.id);
    expect(loaded?.name).toBe('Test Circuit');
  });

  it('should list all saved circuits', () => {
    const circuit1 = new Circuit('Circuit 1');
    const circuit2 = new Circuit('Circuit 2');

    storage.saveCircuit(circuit1);
    storage.saveCircuit(circuit2);

    const list = storage.listCircuits();
    expect(list).toHaveLength(2);
  });

  it('should delete a circuit', () => {
    const circuit = new Circuit('Test');
    storage.saveCircuit(circuit);

    storage.deleteCircuit(circuit.id);

    const loaded = storage.loadCircuit(circuit.id);
    expect(loaded).toBeNull();
  });

  it('should return null for non-existent circuit', () => {
    const loaded = storage.loadCircuit('non-existent');
    expect(loaded).toBeNull();
  });

  it('should update index when saving same circuit twice', () => {
    const circuit = new Circuit('Test');
    storage.saveCircuit(circuit);
    storage.saveCircuit(circuit);

    const list = storage.listCircuits();
    expect(list).toHaveLength(1);
  });

  it('should remove from index on delete', () => {
    const circuit1 = new Circuit('Circuit 1');
    const circuit2 = new Circuit('Circuit 2');
    storage.saveCircuit(circuit1);
    storage.saveCircuit(circuit2);

    storage.deleteCircuit(circuit1.id);

    const list = storage.listCircuits();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Circuit 2');
  });

  it('should list circuits with metadata', () => {
    const circuit = new Circuit('My Circuit');
    storage.saveCircuit(circuit);

    const list = storage.listCircuits();
    expect(list[0].id).toBe(circuit.id);
    expect(list[0].name).toBe('My Circuit');
    expect(list[0].metadata).toBeDefined();
    expect(list[0].metadata.created).toBeDefined();
  });

  it('should handle corrupted localStorage data gracefully', () => {
    // Manually set corrupted data
    localStorage.setItem('circuit_bender_bad-id', 'not valid compressed data');

    const loaded = storage.loadCircuit('bad-id');
    expect(loaded).toBeNull();
  });

  it('should handle corrupted index gracefully', () => {
    localStorage.setItem('circuit_bender_index', 'not valid json');

    const list = storage.listCircuits();
    expect(list).toEqual([]);
  });
});
