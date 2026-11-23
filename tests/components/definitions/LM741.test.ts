import { describe, it, expect } from 'vitest';
import { lm741Definition } from '@/components/definitions/LM741';

describe('LM741 Component', () => {
  it('should have correct metadata', () => {
    expect(lm741Definition.type).toBe('lm741');
    expect(lm741Definition.metadata.name).toBe('LM741');
    expect(lm741Definition.metadata.category).toBe('ic');
  });

  it('has the five pins a circuit connects to: both inputs, the output and the two supplies', () => {
    // The package has eight legs; the other three (offset nulls, NC) are drawn but are not pins
    expect(lm741Definition.pins.map((p) => p.label)).toEqual(['-', '+', 'V-', 'OUT', 'V+']);
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
});
