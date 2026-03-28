import { describe, it, expect } from 'vitest';
import { groundDefinition } from '@/components/definitions/Ground';

describe('Ground Component', () => {
  it('should have correct metadata', () => {
    expect(groundDefinition.type).toBe('ground');
    expect(groundDefinition.metadata.name).toBe('Ground');
    expect(groundDefinition.metadata.category).toBe('power');
    expect(groundDefinition.metadata.description).toBe('0V reference point');
  });

  it('should have 1 ground pin', () => {
    expect(groundDefinition.pins).toHaveLength(1);
    expect(groundDefinition.pins[0].label).toBe('GND');
    expect(groundDefinition.pins[0].type).toBe('ground');
  });

  it('should render schematic ground symbol with three lines', () => {
    const params = groundDefinition.defaultParameters;
    const rendered = groundDefinition.schematic.symbol.render(params);
    expect(rendered).toBeDefined();
  });

  it('should always output 0V', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0.1 },
    };

    const outputs = groundDefinition.simulate(inputs, {});

    expect(outputs.pin_0.voltage).toBe(0);
    expect(outputs.pin_0.current).toBe(0);
  });
});
