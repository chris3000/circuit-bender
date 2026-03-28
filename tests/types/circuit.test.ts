import { describe, it, expect } from 'vitest';
import type {
  ComponentId,
  PinId,
  ConnectionId,
  NetId,
  Pin,
  ComponentParameters,
  ComponentState,
  Component,
  Connection,
  CircuitMetadata,
  Circuit,
} from '@/types/circuit';

describe('Circuit Types', () => {
  it('should allow creating a valid Component', () => {
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: { x: 100, y: 200 },
      rotation: 0,
      parameters: { resistance: 1000, value: '1k' },
      pins: [
        {
          id: 'pin1' as PinId,
          label: 'A',
          type: 'input',
          position: { x: 0, y: 0 },
        },
      ],
      state: {
        voltages: new Map(),
        currents: new Map(),
      },
    };

    expect(component.id).toBe('comp1');
    expect(component.type).toBe('resistor');
    expect(component.rotation).toBe(0);
  });

  it('should allow creating a valid Connection', () => {
    const connection: Connection = {
      id: 'conn1' as ConnectionId,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as NetId,
    };

    expect(connection.id).toBe('conn1');
    expect(connection.net).toBe('net1');
  });

  it('should allow creating a valid Circuit', () => {
    const circuit: Circuit = {
      id: 'circuit1',
      name: 'Test Circuit',
      components: new Map(),
      connections: [],
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        componentLibraryVersion: '1.0',
      },
    };

    expect(circuit.id).toBe('circuit1');
    expect(circuit.components.size).toBe(0);
    expect(circuit.connections.length).toBe(0);
  });
});
