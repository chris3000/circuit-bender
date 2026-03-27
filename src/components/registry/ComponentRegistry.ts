import type { ComponentDefinition } from '@/types/circuit';

export class ComponentRegistry {
  private static instance: ComponentRegistry;
  private definitions: Map<string, ComponentDefinition>;

  private constructor() {
    this.definitions = new Map();
  }

  static getInstance(): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      ComponentRegistry.instance = new ComponentRegistry();
    }
    return ComponentRegistry.instance;
  }

  register(definition: ComponentDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(
        `Component type "${definition.type}" is already registered`
      );
    }
    this.definitions.set(definition.type, definition);
  }

  get(type: string): ComponentDefinition | undefined {
    return this.definitions.get(type);
  }

  getByCategory(category: string): ComponentDefinition[] {
    return Array.from(this.definitions.values()).filter(
      (def) => def.metadata.category === category
    );
  }

  search(query: string): ComponentDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.definitions.values()).filter(
      (def) =>
        def.metadata.name.toLowerCase().includes(lowerQuery) ||
        def.type.toLowerCase().includes(lowerQuery) ||
        def.metadata.description.toLowerCase().includes(lowerQuery)
    );
  }

  listAll(): ComponentDefinition[] {
    return Array.from(this.definitions.values());
  }

  clear(): void {
    this.definitions.clear();
  }
}
