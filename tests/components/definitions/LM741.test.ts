import { describe, it, expect } from 'vitest';
import { lm741Definition } from '@/components/definitions/LM741';

describe('LM741 Component', () => {
  it('should have correct metadata', () => {
    expect(lm741Definition.type).toBe('lm741');
    expect(lm741Definition.metadata.name).toBe('LM741');
    expect(lm741Definition.metadata.category).toBe('ic');
  });

  it('should have 8 pins total', () => {
    expect(lm741Definition.pins).toHaveLength(8);
  });

  it('should have inverting and non-inverting inputs both typed as input', () => {
    const invertingPin = lm741Definition.pins.find((p) => p.label === '-');
    const nonInvertingPin = lm741Definition.pins.find((p) => p.label === '+');

    expect(invertingPin).toBeDefined();
    expect(nonInvertingPin).toBeDefined();
    expect(invertingPin!.type).toBe('input');
    expect(nonInvertingPin!.type).toBe('input');
  });

  it('should render schematic symbol with triangle path', () => {
    const params = lm741Definition.defaultParameters;
    const rendered = lm741Definition.schematic.symbol.render(params);
    expect(rendered).toBeDefined();
  });

  it('should simulate voltage follower with output clamped to rails', () => {
    const inputs = {
      pin_0: { voltage: 0, current: 0 },   // NC
      pin_1: { voltage: 0, current: 0 },   // Inverting input (-)
      pin_2: { voltage: 3, current: 0 },   // Non-inverting input (+)
      pin_3: { voltage: -12, current: 0 },  // V- (negative supply)
      pin_4: { voltage: 0, current: 0 },   // NC
      pin_5: { voltage: 0, current: 0 },   // Output
      pin_6: { voltage: 12, current: 0 },  // V+ (positive supply)
      pin_7: { voltage: 0, current: 0 },   // NC
    };

    const outputs = lm741Definition.simulate(inputs, lm741Definition.defaultParameters);

    // (vPlus - vMinus) * 100000 = (3 - 0) * 100000 = 300000
    // Clamped to V+ rail = 12V
    expect(outputs.pin_5.voltage).toBe(12);
    expect(outputs.pin_5.current).toBe(0);
  });
});
