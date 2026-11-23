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

  it('has a positive and a negative terminal', () => {
    expect(powerSupplyDefinition.pins.map((p) => [p.label, p.type])).toEqual([['+', 'power'], ['−', 'ground']]);
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
});
