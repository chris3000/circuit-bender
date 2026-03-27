import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { ComponentDefinition } from '@/types/circuit';

describe('ComponentRegistry', () => {
  let registry: ComponentRegistry;

  const mockDefinition: ComponentDefinition = {
    type: 'resistor',
    metadata: {
      name: 'Resistor',
      category: 'passive',
      description: 'A basic resistor',
    },
    pins: [],
    defaultParameters: { resistance: 1000 },
    schematic: {
      symbol: {
        width: 60,
        height: 20,
        render: () => null,
      },
      dimensions: { width: 60, height: 20 },
    },
    breadboard: {
      renderer: () => {},
      dimensions: { rows: 1, columns: 4 },
    },
    simulate: () => ({}),
  };

  beforeEach(() => {
    registry = ComponentRegistry.getInstance();
    registry.clear();
  });

  it('should be a singleton', () => {
    const registry1 = ComponentRegistry.getInstance();
    const registry2 = ComponentRegistry.getInstance();

    expect(registry1).toBe(registry2);
  });

  it('should register a component definition', () => {
    registry.register(mockDefinition);

    const retrieved = registry.get('resistor');
    expect(retrieved).toEqual(mockDefinition);
  });

  it('should throw error when registering duplicate', () => {
    registry.register(mockDefinition);

    expect(() => registry.register(mockDefinition)).toThrow(
      'Component type "resistor" is already registered'
    );
  });

  it('should return undefined for non-existent component', () => {
    const retrieved = registry.get('non-existent');
    expect(retrieved).toBeUndefined();
  });

  it('should get components by category', () => {
    registry.register(mockDefinition);

    const passives = registry.getByCategory('passive');
    expect(passives).toHaveLength(1);
    expect(passives[0].type).toBe('resistor');
  });

  it('should search components by name', () => {
    registry.register(mockDefinition);

    const results = registry.search('resist');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('resistor');
  });

  it('should search case-insensitively', () => {
    registry.register(mockDefinition);

    const results = registry.search('RESIST');
    expect(results).toHaveLength(1);
  });

  it('should list all registered components', () => {
    registry.register(mockDefinition);

    const all = registry.listAll();
    expect(all).toHaveLength(1);
  });
});
