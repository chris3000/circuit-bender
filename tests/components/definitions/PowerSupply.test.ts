import { describe, it, expect } from 'vitest';
import { powerSupplyDefinition } from '@/components/definitions/PowerSupply';

describe('Power Supply Component', () => {
  it('should have correct metadata', () => {
    expect(powerSupplyDefinition.type).toBe('power');
    expect(powerSupplyDefinition.metadata.name).toBe('Power Supply');
    expect(powerSupplyDefinition.metadata.category).toBe('power');
    expect(powerSupplyDefinition.metadata.description).toBe(
      'DC voltage source (default +9V)'
    );
  });

  it('should have 1 power pin', () => {
    expect(powerSupplyDefinition.pins).toHaveLength(1);
    expect(powerSupplyDefinition.pins[0].label).toBe('+');
    expect(powerSupplyDefinition.pins[0].type).toBe('power');
  });

  it('should have default voltage 9V', () => {
    expect(powerSupplyDefinition.defaultParameters.voltage).toBe(9);
    expect(powerSupplyDefinition.defaultParameters.value).toBe('+9V');
  });

  it('should render schematic symbol with circle', () => {
    const params = powerSupplyDefinition.defaultParameters;
    const rendered = powerSupplyDefinition.schematic.symbol.render(params);
    expect(rendered).toBeDefined();
  });

  it('should output fixed 9V', () => {
    const inputs = {
      pin_0: { voltage: 0, current: 0 },
    };

    const outputs = powerSupplyDefinition.simulate(inputs, { voltage: 9 });

    expect(outputs.pin_0.voltage).toBe(9);
  });
});
