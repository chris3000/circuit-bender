import { describe, it, expect } from 'vitest';
import { transistor2N3904Definition } from '@/components/definitions/Transistor2N3904';

describe('2N3904 NPN Transistor Component', () => {
  it('should have correct metadata', () => {
    expect(transistor2N3904Definition.type).toBe('2n3904');
    expect(transistor2N3904Definition.metadata.name).toBe('2N3904 NPN Transistor');
    expect(transistor2N3904Definition.metadata.category).toBe('active');
  });

  it('should have three pins: B, C, E', () => {
    expect(transistor2N3904Definition.pins).toHaveLength(3);
    expect(transistor2N3904Definition.pins[0].label).toBe('B');
    expect(transistor2N3904Definition.pins[0].type).toBe('input');
    expect(transistor2N3904Definition.pins[0].position).toEqual({ x: -25, y: 0 });
    expect(transistor2N3904Definition.pins[1].label).toBe('C');
    expect(transistor2N3904Definition.pins[1].type).toBe('bidirectional');
    expect(transistor2N3904Definition.pins[1].position).toEqual({ x: 0, y: -25 });
    expect(transistor2N3904Definition.pins[2].label).toBe('E');
    expect(transistor2N3904Definition.pins[2].type).toBe('bidirectional');
    expect(transistor2N3904Definition.pins[2].position).toEqual({ x: 0, y: 25 });
  });

  it('should have default beta parameter', () => {
    expect(transistor2N3904Definition.defaultParameters.beta).toBe(100);
  });

  it('should saturate when Vbe > 0.7V', () => {
    const inputs = {
      pin_0: { voltage: 1.0, current: 0 }, // Base
      pin_1: { voltage: 5.0, current: 0 }, // Collector
      pin_2: { voltage: 0.0, current: 0 }, // Emitter
    };

    const outputs = transistor2N3904Definition.simulate(inputs, { beta: 100 });

    // Vbe = 1.0 - 0.0 = 1.0V > 0.7V → saturation
    // Collector pulled to emitter + 0.2V = 0.2V
    expect(outputs.pin_1.voltage).toBeCloseTo(0.2, 5);
  });

  it('should not change collector when Vbe <= 0.7V', () => {
    const inputs = {
      pin_0: { voltage: 0.3, current: 0 }, // Base
      pin_1: { voltage: 5.0, current: 0 }, // Collector
      pin_2: { voltage: 0.0, current: 0 }, // Emitter
    };

    const outputs = transistor2N3904Definition.simulate(inputs, { beta: 100 });

    // Vbe = 0.3V <= 0.7V → collector unchanged
    expect(outputs.pin_1.voltage).toBe(5.0);
  });

  it('should handle missing inputs gracefully', () => {
    const inputs = {};
    const outputs = transistor2N3904Definition.simulate(inputs, { beta: 100 });

    expect(outputs.pin_0).toBeDefined();
    expect(outputs.pin_1).toBeDefined();
    expect(outputs.pin_2).toBeDefined();
  });
});
