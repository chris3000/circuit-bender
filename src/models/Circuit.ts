import { nanoid } from 'nanoid';
import type {
  SerializedCircuit,
  Component,
  Connection,
  ComponentId,
  ConnectionId,
  CircuitMetadata,
} from '@/types/circuit';

export class Circuit {
  readonly id: string;
  readonly name: string;
  private readonly components: Map<ComponentId, Component>;
  private readonly connections: Connection[];
  readonly metadata: CircuitMetadata;

  constructor(name: string, id?: string) {
    this.id = id || nanoid();
    this.name = name;
    this.components = new Map();
    this.connections = [];
    this.metadata = {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      componentLibraryVersion: '1.0',
    };
  }

  static fromJSON(data: SerializedCircuit): Circuit {
    const circuit = Object.create(Circuit.prototype);
    // Use Object.defineProperty to set readonly properties
    Object.defineProperty(circuit, 'id', { value: data.id, writable: false });
    Object.defineProperty(circuit, 'name', { value: data.name, writable: false });
    Object.defineProperty(circuit, 'components', {
      value: new Map(data.components), // Convert array of entries back to Map
      writable: false,
    });
    Object.defineProperty(circuit, 'connections', {
      value: [...data.connections],
      writable: false,
    });
    Object.defineProperty(circuit, 'metadata', {
      value: { ...data.metadata },
      writable: false,
    });
    return circuit;
  }

  // Immutable operations that return new Circuit instances
  addComponent(component: Component): Circuit {
    const newComponents = new Map(this.components);
    newComponents.set(component.id, component);

    return this.clone({
      components: newComponents,
      metadata: this.updateMetadata(),
    });
  }

  removeComponent(componentId: ComponentId): Circuit {
    const newComponents = new Map(this.components);
    newComponents.delete(componentId);

    // Remove connections involving this component
    const newConnections = this.connections.filter(
      (conn) =>
        conn.from.componentId !== componentId &&
        conn.to.componentId !== componentId
    );

    return this.clone({
      components: newComponents,
      connections: newConnections,
      metadata: this.updateMetadata(),
    });
  }

  /**
   * Updates a component with new values.
   * Note: This performs a shallow merge. To update nested properties (parameters, position, state),
   * provide the complete nested object with all existing values plus the changes.
   *
   * @example
   * // To update resistance while keeping other parameters:
   * const component = circuit.getComponent(id);
   * circuit.updateComponent(id, {
   *   parameters: { ...component.parameters, resistance: 2000 }
   * });
   */
  updateComponent(
    componentId: ComponentId,
    updates: Partial<Component>
  ): Circuit {
    const component = this.components.get(componentId);
    if (!component) {
      throw new Error(`Component ${componentId} not found`);
    }

    const updated = { ...component, ...updates };
    const newComponents = new Map(this.components);
    newComponents.set(componentId, updated);

    return this.clone({
      components: newComponents,
      metadata: this.updateMetadata(),
    });
  }

  addConnection(connection: Connection): Circuit {
    // Validate components exist
    if (!this.components.has(connection.from.componentId)) {
      throw new Error(`Component ${connection.from.componentId} not found`);
    }
    if (!this.components.has(connection.to.componentId)) {
      throw new Error(`Component ${connection.to.componentId} not found`);
    }

    const newConnections = [...this.connections, connection];

    return this.clone({
      connections: newConnections,
      metadata: this.updateMetadata(),
    });
  }

  removeConnection(connectionId: ConnectionId): Circuit {
    const newConnections = this.connections.filter(
      (conn) => conn.id !== connectionId
    );

    return this.clone({
      connections: newConnections,
      metadata: this.updateMetadata(),
    });
  }

  // Getters
  getComponent(componentId: ComponentId): Component | undefined {
    return this.components.get(componentId);
  }

  getComponents(): Component[] {
    return Array.from(this.components.values());
  }

  getConnections(): Connection[] {
    return [...this.connections];
  }

  // Serialization
  toJSON(): SerializedCircuit {
    return {
      id: this.id,
      name: this.name,
      components: Array.from(this.components.entries()), // Convert Map to array of [key, value] pairs
      connections: [...this.connections],
      metadata: { ...this.metadata },
    };
  }

  // Private helpers
  private clone(updates: Partial<{
    id: string;
    name: string;
    components: Map<ComponentId, Component>;
    connections: Connection[];
    metadata: CircuitMetadata;
  }>): Circuit {
    const serialized = this.toJSON();
    const serializedUpdates: Partial<SerializedCircuit> = {};

    if (updates.components) {
      serializedUpdates.components = Array.from(updates.components.entries());
    }
    if (updates.id) serializedUpdates.id = updates.id;
    if (updates.name) serializedUpdates.name = updates.name;
    if (updates.connections) serializedUpdates.connections = updates.connections;
    if (updates.metadata) serializedUpdates.metadata = updates.metadata;

    return Circuit.fromJSON({
      ...serialized,
      ...serializedUpdates,
    });
  }

  private updateMetadata(): CircuitMetadata {
    return {
      ...this.metadata,
      modified: new Date().toISOString(),
    };
  }
}
