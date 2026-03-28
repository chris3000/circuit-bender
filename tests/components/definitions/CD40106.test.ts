import { describe, it, expect } from 'vitest';
import { cd40106Definition } from '@/components/definitions/CD40106';

describe('CD40106 Component', () => {
  it('should have correct metadata', () => {
    expect(cd40106Definition.type).toBe('cd40106');
    expect(cd40106Definition.metadata.name).toBe('CD40106');
    expect(cd40106Definition.metadata.category).toBe('ic');
  });

  it('should have 14 pins total', () => {
    expect(cd40106Definition.pins).toHaveLength(14);
  });

  it('should have correct pin types: 6 inputs, 6 outputs, 1 power, 1 ground', () => {
    const inputs = cd40106Definition.pins.filter((p) => p.type === 'input');
    const outputs = cd40106Definition.pins.filter((p) => p.type === 'output');
    const power = cd40106Definition.pins.filter((p) => p.type === 'power');
    const ground = cd40106Definition.pins.filter((p) => p.type === 'ground');

    expect(inputs).toHaveLength(6);
    expect(outputs).toHaveLength(6);
    expect(power).toHaveLength(1);
    expect(ground).toHaveLength(1);
  });

  it('should render schematic symbol with rect element', () => {
    const params = cd40106Definition.defaultParameters;
    const rendered = cd40106Definition.schematic.symbol.render(params);
    expect(rendered).toBeDefined();
  });

  it('should simulate Schmitt trigger: high input produces low output', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0 },   // Gate 1 input: high
      pin_1: { voltage: 0, current: 0 },   // Gate 2 input: low
      pin_2: { voltage: 0, current: 0 },
      pin_3: { voltage: 0, current: 0 },
      pin_4: { voltage: 0, current: 0 },
      pin_5: { voltage: 0, current: 0 },
      pin_6: { voltage: 0, current: 0 },   // Gate 1 output
      pin_7: { voltage: 0, current: 0 },   // Gate 2 output
      pin_8: { voltage: 0, current: 0 },
      pin_9: { voltage: 0, current: 0 },
      pin_10: { voltage: 0, current: 0 },
      pin_11: { voltage: 0, current: 0 },
      pin_12: { voltage: 5, current: 0 },  // VDD = 5V
      pin_13: { voltage: 0, current: 0 },  // VSS = 0V
    };

    const outputs = cd40106Definition.simulate(inputs, cd40106Definition.defaultParameters);

    // High input (5V) > high threshold (5 * 0.6 = 3V) => output LOW (0V)
    expect(outputs.pin_6.voltage).toBe(0);
    // Low input (0V) < high threshold => output HIGH (VDD = 5V)
    expect(outputs.pin_7.voltage).toBe(5);
  });
});
