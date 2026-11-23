import { describe, it, expect } from 'vitest';
import { resistorDefinition } from '@/components/definitions/Resistor';

describe('Resistor Component', () => {
  it('should have correct metadata', () => {
    expect(resistorDefinition.type).toBe('resistor');
    expect(resistorDefinition.metadata.name).toBe('Resistor');
    expect(resistorDefinition.metadata.category).toBe('passive');
  });

  it('should have two pins', () => {
    expect(resistorDefinition.pins).toHaveLength(2);
    expect(resistorDefinition.pins[0].label).toBe('1');
    expect(resistorDefinition.pins[1].label).toBe('2');
  });

  it('should have default resistance parameter', () => {
    expect(resistorDefinition.defaultParameters.resistance).toBe(1000);
    expect(resistorDefinition.defaultParameters.value).toBe('1kΩ');
  });
});
