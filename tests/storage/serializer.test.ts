import { describe, it, expect } from 'vitest';
import { Circuit } from '@/models/Circuit';
import { serializeCircuit, deserializeCircuit } from '@/storage/serializer';
import type { Component, ComponentId } from '@/types/circuit';

describe('Circuit Serializer', () => {
  it('should serialize circuit to JSON string', () => {
    const circuit = new Circuit('Test Circuit');
    const json = serializeCircuit(circuit);

    expect(typeof json).toBe('string');
    expect(json.length).toBeGreaterThan(0);
  });

  it('should deserialize circuit from JSON string', () => {
    const original = new Circuit('Test Circuit');
    const json = serializeCircuit(original);
    const restored = deserializeCircuit(json);

    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
  });

  it('should handle circuit with components', () => {
    const circuit = new Circuit('Test');
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 100, y: 200 },
        breadboard: { row: 5, column: 10 },
      },
      rotation: 90,
      parameters: { resistance: 1000 },
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const withComponent = circuit.addComponent(component);
    const json = serializeCircuit(withComponent);
    const restored = deserializeCircuit(json);

    expect(restored.getComponents()).toHaveLength(1);
    const restoredComp = restored.getComponent(component.id);
    expect(restoredComp?.type).toBe('resistor');
    expect(restoredComp?.rotation).toBe(90);
  });

  it('should compress data', () => {
    const circuit = new Circuit('Test');
    const json = serializeCircuit(circuit);
    const uncompressed = JSON.stringify(circuit.toJSON());

    // Compressed should be shorter (or same for small data)
    expect(json.length).toBeLessThanOrEqual(uncompressed.length * 1.1);
  });

  it('should throw on invalid compressed data', () => {
    expect(() => deserializeCircuit('invalid data')).toThrow();
  });

  it('should throw on unsupported version', () => {
    // Manually create compressed data with wrong version
    const LZString = require('lz-string');
    const badData = JSON.stringify({ version: '99.0', circuit: {} });
    const compressed = LZString.compressToUTF16(badData);
    expect(() => deserializeCircuit(compressed)).toThrow('Unsupported circuit version');
  });

  it('should restore component state with empty Maps', () => {
    const circuit = new Circuit('Test');
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: { resistance: 470 },
      pins: [],
      state: { voltages: new Map([['pin1' as any, 5.0]]), currents: new Map() },
    };

    const withComponent = circuit.addComponent(component);
    const json = serializeCircuit(withComponent);
    const restored = deserializeCircuit(json);

    const restoredComp = restored.getComponent(component.id);
    // Runtime state should be reset (empty Maps)
    expect(restoredComp?.state.voltages).toBeInstanceOf(Map);
    expect(restoredComp?.state.voltages.size).toBe(0);
    expect(restoredComp?.state.currents).toBeInstanceOf(Map);
    expect(restoredComp?.state.currents.size).toBe(0);
  });
});
