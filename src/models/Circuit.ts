import { nanoid } from 'nanoid';
import type {
  Circuit as CircuitType,
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

  static fromJSON(data: CircuitType): Circuit {
    const circuit = Object.create(Circuit.prototype);
    // Use Object.defineProperty to set readonly properties
    Object.defineProperty(circuit, 'id', { value: data.id, writable: false });
    Object.defineProperty(circuit, 'name', { value: data.name, writable: false });
    Object.defineProperty(circuit, 'components', {
      value: new Map(data.components),
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
  toJSON(): CircuitType {
    return {
      id: this.id,
      name: this.name,
      components: this.components,
      connections: this.connections,
      metadata: this.metadata,
    };
  }

  // Private helpers
  private clone(updates: Partial<CircuitType>): Circuit {
    return Circuit.fromJSON({
      ...this.toJSON(),
      ...updates,
    });
  }

  private updateMetadata(): CircuitMetadata {
    return {
      ...this.metadata,
      modified: new Date().toISOString(),
    };
  }
}
