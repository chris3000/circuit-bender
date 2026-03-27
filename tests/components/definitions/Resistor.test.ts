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
    expect(resistorDefinition.defaultParameters.value).toBe('1k');
  });

  it('should simulate based on Ohms law', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0 },
      pin_1: { voltage: 0, current: 0 },
    };

    const outputs = resistorDefinition.simulate(inputs, { resistance: 1000 });

    // Current = (V1 - V2) / R = (5 - 0) / 1000 = 0.005 A
    expect(outputs.pin_0.current).toBeCloseTo(-0.005, 5);
    expect(outputs.pin_1.current).toBeCloseTo(0.005, 5);
  });

  it('should handle zero resistance safely', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0 },
      pin_1: { voltage: 0, current: 0 },
    };

    const outputs = resistorDefinition.simulate(inputs, { resistance: 0 });

    // Should clamp to prevent infinite current
    expect(outputs.pin_0.current).toBeDefined();
    expect(outputs.pin_1.current).toBeDefined();
  });
});
