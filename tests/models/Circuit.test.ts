import { describe, it, expect, beforeEach } from 'vitest';
import { Circuit } from '@/models/Circuit';
import type { Component, Connection, ComponentId, PinId } from '@/types/circuit';

describe('Circuit', () => {
  let circuit: Circuit;

  beforeEach(() => {
    circuit = new Circuit('Test Circuit');
  });

  it('should create a new circuit with empty state', () => {
    expect(circuit.id).toBeTruthy();
    expect(circuit.name).toBe('Test Circuit');
    expect(circuit.getComponents()).toHaveLength(0);
    expect(circuit.getConnections()).toHaveLength(0);
  });

  it('should add a component', () => {
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const newCircuit = circuit.addComponent(component);

    expect(newCircuit.getComponents()).toHaveLength(1);
    expect(newCircuit.getComponent(component.id)).toEqual(component);
    expect(circuit.getComponents()).toHaveLength(0); // Original unchanged
  });

  it('should remove a component', () => {
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const withComponent = circuit.addComponent(component);
    const withoutComponent = withComponent.removeComponent(component.id);

    expect(withoutComponent.getComponents()).toHaveLength(0);
    expect(withComponent.getComponents()).toHaveLength(1);
  });

  it('should cascade delete connections when removing a component', () => {
    const component1: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const component2: Component = {
      id: 'comp2' as ComponentId,
      type: 'led',
      position: {
        schematic: { x: 10, y: 10 },
        breadboard: { row: 1, column: 1 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const connection: Connection = {
      id: 'conn1' as any,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as any,
    };

    // Add both components and a connection between them
    const withComponents = circuit
      .addComponent(component1)
      .addComponent(component2);
    const withConnection = withComponents.addConnection(connection);

    // Verify setup
    expect(withConnection.getComponents()).toHaveLength(2);
    expect(withConnection.getConnections()).toHaveLength(1);

    // Remove one component
    const afterRemoval = withConnection.removeComponent(component1.id);

    // Verify both component and connection are removed
    expect(afterRemoval.getComponents()).toHaveLength(1);
    expect(afterRemoval.getConnections()).toHaveLength(0);
    expect(afterRemoval.getComponent(component1.id)).toBeUndefined();
  });

  it('should update a component', () => {
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: { resistance: 1000 },
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const withComponent = circuit.addComponent(component);
    const updated = withComponent.updateComponent(component.id, {
      parameters: { resistance: 2000 },
    });

    const updatedComponent = updated.getComponent(component.id);
    expect(updatedComponent?.parameters.resistance).toBe(2000);
  });

  it('should throw error when updating non-existent component', () => {
    expect(() => {
      circuit.updateComponent('nonexistent' as ComponentId, {
        parameters: { resistance: 2000 },
      });
    }).toThrow('Component nonexistent not found');
  });

  it('should add a connection', () => {
    const component1: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const component2: Component = {
      id: 'comp2' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const connection: Connection = {
      id: 'conn1' as any,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as any,
    };

    const withComponents = circuit.addComponent(component1).addComponent(component2);
    const newCircuit = withComponents.addConnection(connection);

    expect(newCircuit.getConnections()).toHaveLength(1);
    expect(circuit.getConnections()).toHaveLength(0);
  });

  it('should remove a connection', () => {
    const component1: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const component2: Component = {
      id: 'comp2' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const connection: Connection = {
      id: 'conn1' as any,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as any,
    };

    const withComponents = circuit.addComponent(component1).addComponent(component2);
    const withConnection = withComponents.addConnection(connection);
    const withoutConnection = withConnection.removeConnection(connection.id);

    expect(withoutConnection.getConnections()).toHaveLength(0);
  });

  it('should serialize to JSON', () => {
    const json = circuit.toJSON();

    expect(json.id).toBe(circuit.id);
    expect(json.name).toBe('Test Circuit');
    expect(Array.isArray(json.components)).toBe(true);
    expect(json.components).toHaveLength(0);
    expect(json.connections).toEqual([]);
    expect(json.metadata).toBeDefined();
  });

  it('should deserialize from JSON and match original circuit', () => {
    const component1: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: { resistance: 1000 },
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const component2: Component = {
      id: 'comp2' as ComponentId,
      type: 'led',
      position: {
        schematic: { x: 10, y: 10 },
        breadboard: { row: 1, column: 1 },
      },
      rotation: 90,
      parameters: { color: 'red' },
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const connection: Connection = {
      id: 'conn1' as any,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as any,
    };

    // Create circuit with components and connections
    const original = circuit
      .addComponent(component1)
      .addComponent(component2)
      .addConnection(connection);

    // Serialize to JSON
    const json = original.toJSON();

    // Deserialize from JSON
    const deserialized = Circuit.fromJSON(json);

    // Verify structure matches
    expect(deserialized.id).toBe(original.id);
    expect(deserialized.name).toBe(original.name);
    expect(deserialized.getComponents()).toHaveLength(2);
    expect(deserialized.getConnections()).toHaveLength(1);

    // Verify components match
    const deserializedComp1 = deserialized.getComponent(component1.id);
    expect(deserializedComp1).toBeDefined();
    expect(deserializedComp1?.type).toBe('resistor');
    expect(deserializedComp1?.parameters.resistance).toBe(1000);
    expect(deserializedComp1?.rotation).toBe(0);

    const deserializedComp2 = deserialized.getComponent(component2.id);
    expect(deserializedComp2).toBeDefined();
    expect(deserializedComp2?.type).toBe('led');
    expect(deserializedComp2?.parameters.color).toBe('red');
    expect(deserializedComp2?.rotation).toBe(90);

    // Verify connections match
    const deserializedConnections = deserialized.getConnections();
    expect(deserializedConnections[0].id).toBe(connection.id);
    expect(deserializedConnections[0].from.componentId).toBe(component1.id);
    expect(deserializedConnections[0].to.componentId).toBe(component2.id);

    // Verify metadata
    expect(deserialized.metadata.created).toBe(original.metadata.created);
    expect(deserialized.metadata.modified).toBe(original.metadata.modified);
    expect(deserialized.metadata.componentLibraryVersion).toBe(
      original.metadata.componentLibraryVersion
    );
  });
});
