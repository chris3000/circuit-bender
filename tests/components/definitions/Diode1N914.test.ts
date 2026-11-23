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
});
