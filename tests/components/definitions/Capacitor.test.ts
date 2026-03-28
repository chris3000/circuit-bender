import { describe, it, expect } from 'vitest';
import { capacitorDefinition } from '@/components/definitions/Capacitor';

describe('Capacitor Component', () => {
  it('should have correct metadata', () => {
    expect(capacitorDefinition.type).toBe('capacitor');
    expect(capacitorDefinition.metadata.name).toBe('Capacitor');
    expect(capacitorDefinition.metadata.category).toBe('passive');
  });

  it('should have two bidirectional pins', () => {
    expect(capacitorDefinition.pins).toHaveLength(2);
    expect(capacitorDefinition.pins[0].label).toBe('1');
    expect(capacitorDefinition.pins[1].label).toBe('2');
    expect(capacitorDefinition.pins[0].type).toBe('bidirectional');
    expect(capacitorDefinition.pins[1].type).toBe('bidirectional');
  });

  it('should have default capacitance parameter', () => {
    expect(capacitorDefinition.defaultParameters.capacitance).toBe(0.0000001);
    expect(capacitorDefinition.defaultParameters.value).toBe('100nF');
  });

  it('should render schematic symbol without errors', () => {
    const params = { capacitance: 0.0000001, value: '100nF' };
    const rendered = capacitorDefinition.schematic.symbol.render(params);
    expect(rendered).toBeDefined();
  });

  it('should simulate as pass-through (outputs equal inputs)', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0.01 },
      pin_1: { voltage: 0, current: -0.01 },
    };

    const outputs = capacitorDefinition.simulate(inputs, { capacitance: 0.0000001 });

    expect(outputs.pin_0.voltage).toBe(5);
    expect(outputs.pin_0.current).toBe(0.01);
    expect(outputs.pin_1.voltage).toBe(0);
    expect(outputs.pin_1.current).toBe(-0.01);
  });
});
