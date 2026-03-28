import { describe, it, expect } from 'vitest';
import { potentiometerDefinition } from '@/components/definitions/Potentiometer';

describe('Potentiometer Component', () => {
  it('should have correct metadata', () => {
    expect(potentiometerDefinition.type).toBe('potentiometer');
    expect(potentiometerDefinition.metadata.name).toBe('Potentiometer');
    expect(potentiometerDefinition.metadata.category).toBe('control');
    expect(potentiometerDefinition.metadata.description).toBe(
      'Variable resistor with adjustable wiper position'
    );
  });

  it('should have 3 bidirectional pins', () => {
    expect(potentiometerDefinition.pins).toHaveLength(3);
    expect(potentiometerDefinition.pins[0].label).toBe('1');
    expect(potentiometerDefinition.pins[0].type).toBe('bidirectional');
    expect(potentiometerDefinition.pins[1].label).toBe('2');
    expect(potentiometerDefinition.pins[1].type).toBe('bidirectional');
    expect(potentiometerDefinition.pins[2].label).toBe('3');
    expect(potentiometerDefinition.pins[2].type).toBe('bidirectional');
  });

  it('should have default parameters', () => {
    expect(potentiometerDefinition.defaultParameters.maxResistance).toBe(1000000);
    expect(potentiometerDefinition.defaultParameters.position).toBe(0.5);
    expect(potentiometerDefinition.defaultParameters.value).toBe('1M');
  });

  it('should render schematic symbol without errors', () => {
    const params = potentiometerDefinition.defaultParameters;
    const rendered = potentiometerDefinition.schematic.symbol.render(params);
    expect(rendered).toBeDefined();
  });

  it('should simulate voltage divider at 50% = 4.5V from 9V-0V', () => {
    const inputs = {
      pin_0: { voltage: 9, current: 0 },
      pin_1: { voltage: 0, current: 0 },
      pin_2: { voltage: 0, current: 0 },
    };

    const outputs = potentiometerDefinition.simulate(inputs, {
      maxResistance: 1000000,
      position: 0.5,
    });

    // wiperVoltage = v1 + (v3 - v1) * position = 9 + (0 - 9) * 0.5 = 4.5V
    expect(outputs.pin_1.voltage).toBeCloseTo(4.5, 5);
  });
});
