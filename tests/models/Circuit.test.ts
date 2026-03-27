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

  it('should add a connection', () => {
    const connection: Connection = {
      id: 'conn1' as any,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as any,
    };

    const newCircuit = circuit.addConnection(connection);

    expect(newCircuit.getConnections()).toHaveLength(1);
    expect(circuit.getConnections()).toHaveLength(0);
  });

  it('should remove a connection', () => {
    const connection: Connection = {
      id: 'conn1' as any,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as any,
    };

    const withConnection = circuit.addConnection(connection);
    const withoutConnection = withConnection.removeConnection(connection.id);

    expect(withoutConnection.getConnections()).toHaveLength(0);
  });

  it('should serialize to JSON', () => {
    const json = circuit.toJSON();

    expect(json.id).toBe(circuit.id);
    expect(json.name).toBe('Test Circuit');
    expect(json.components).toEqual(new Map());
    expect(json.connections).toEqual([]);
    expect(json.metadata).toBeDefined();
  });
});
