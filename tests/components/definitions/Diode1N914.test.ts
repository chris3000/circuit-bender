import { describe, it, expect } from 'vitest';
import { diode1N914Definition } from '@/components/definitions/Diode1N914';

describe('1N914 Signal Diode Component', () => {
  it('should have correct metadata', () => {
    expect(diode1N914Definition.type).toBe('1n914');
    expect(diode1N914Definition.metadata.name).toBe('1N914 Signal Diode');
    expect(diode1N914Definition.metadata.category).toBe('active');
  });

  it('should have two pins: A and K', () => {
    expect(diode1N914Definition.pins).toHaveLength(2);
    expect(diode1N914Definition.pins[0].label).toBe('A');
    expect(diode1N914Definition.pins[0].type).toBe('bidirectional');
    expect(diode1N914Definition.pins[0].position).toEqual({ x: -20, y: 0 });
    expect(diode1N914Definition.pins[1].label).toBe('K');
    expect(diode1N914Definition.pins[1].type).toBe('bidirectional');
    expect(diode1N914Definition.pins[1].position).toEqual({ x: 20, y: 0 });
  });

  it('should have default forwardVoltage parameter', () => {
    expect(diode1N914Definition.defaultParameters.forwardVoltage).toBe(0.7);
  });

  it('should conduct when forward biased (Va - Vk > 0.7V)', () => {
    const inputs = {
      pin_0: { voltage: 5.0, current: 0 }, // Anode
      pin_1: { voltage: 0.0, current: 0 }, // Cathode
    };

    const outputs = diode1N914Definition.simulate(inputs, { forwardVoltage: 0.7 });

    // Forward biased: cathode = anode - 0.7V = 4.3V
    expect(outputs.pin_1.voltage).toBeCloseTo(4.3, 5);
  });

  it('should not conduct when reverse biased', () => {
    const inputs = {
      pin_0: { voltage: 0.0, current: 0 }, // Anode
      pin_1: { voltage: 5.0, current: 0 }, // Cathode
    };

    const outputs = diode1N914Definition.simulate(inputs, { forwardVoltage: 0.7 });

    // Reverse biased: no change
    expect(outputs.pin_1.voltage).toBe(5.0);
  });

  it('should not conduct when Va - Vk <= 0.7V', () => {
    const inputs = {
      pin_0: { voltage: 1.0, current: 0 }, // Anode
      pin_1: { voltage: 0.5, current: 0 }, // Cathode
    };

    const outputs = diode1N914Definition.simulate(inputs, { forwardVoltage: 0.7 });

    // Va - Vk = 0.5V <= 0.7V → no change
    expect(outputs.pin_1.voltage).toBe(0.5);
  });

  it('should handle missing inputs gracefully', () => {
    const inputs = {};
    const outputs = diode1N914Definition.simulate(inputs, { forwardVoltage: 0.7 });

    expect(outputs.pin_0).toBeDefined();
    expect(outputs.pin_1).toBeDefined();
  });
});
