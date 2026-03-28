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

  it('should conduct when forward biased (Va - Vk > 2V)', () => {
    const inputs = {
      pin_0: { voltage: 5.0, current: 0 }, // Anode
      pin_1: { voltage: 0.0, current: 0 }, // Cathode
    };

    const outputs = ledDefinition.simulate(inputs, { color: 'red', forwardVoltage: 2.0 });

    // Forward biased: cathode = anode - 2.0V = 3.0V
    expect(outputs.pin_1.voltage).toBeCloseTo(3.0, 5);
  });

  it('should not conduct when Va - Vk <= 2V', () => {
    const inputs = {
      pin_0: { voltage: 1.5, current: 0 }, // Anode
      pin_1: { voltage: 0.0, current: 0 }, // Cathode
    };

    const outputs = ledDefinition.simulate(inputs, { color: 'red', forwardVoltage: 2.0 });

    // Va - Vk = 1.5V <= 2.0V → no change
    expect(outputs.pin_1.voltage).toBe(0.0);
  });

  it('should not conduct when reverse biased', () => {
    const inputs = {
      pin_0: { voltage: 0.0, current: 0 }, // Anode
      pin_1: { voltage: 5.0, current: 0 }, // Cathode
    };

    const outputs = ledDefinition.simulate(inputs, { color: 'red', forwardVoltage: 2.0 });

    expect(outputs.pin_1.voltage).toBe(5.0);
  });

  it('should handle missing inputs gracefully', () => {
    const inputs = {};
    const outputs = ledDefinition.simulate(inputs, { color: 'red', forwardVoltage: 2.0 });

    expect(outputs.pin_0).toBeDefined();
    expect(outputs.pin_1).toBeDefined();
  });
});
