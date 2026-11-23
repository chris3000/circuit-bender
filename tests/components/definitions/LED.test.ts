import { describe, it, expect } from 'vitest';
import { ledDefinition } from '@/components/definitions/LED';

describe('LED Component', () => {
  it('should have correct metadata', () => {
    expect(ledDefinition.type).toBe('led');
    expect(ledDefinition.metadata.name).toBe('LED');
    expect(ledDefinition.metadata.category).toBe('active');
  });

  it('should have two pins: A and K', () => {
    expect(ledDefinition.pins).toHaveLength(2);
    expect(ledDefinition.pins[0].label).toBe('A');
    expect(ledDefinition.pins[0].type).toBe('bidirectional');
    expect(ledDefinition.pins[0].position).toEqual({ x: -20, y: 0 });
    expect(ledDefinition.pins[1].label).toBe('K');
    expect(ledDefinition.pins[1].type).toBe('bidirectional');
    expect(ledDefinition.pins[1].position).toEqual({ x: 20, y: 0 });
  });

  it('should have default color and forwardVoltage parameters', () => {
    expect(ledDefinition.defaultParameters.color).toBe('red');
    expect(ledDefinition.defaultParameters.forwardVoltage).toBe(2.0);
  });
});
