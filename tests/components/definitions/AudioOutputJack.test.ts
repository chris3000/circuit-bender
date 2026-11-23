import { describe, it, expect } from 'vitest';
import { audioOutputJackDefinition } from '@/components/definitions/AudioOutputJack';

describe('Audio Output Jack Component', () => {
  it('should have correct metadata', () => {
    expect(audioOutputJackDefinition.type).toBe('audio-output');
    expect(audioOutputJackDefinition.metadata.name).toBe('Audio Output Jack');
    expect(audioOutputJackDefinition.metadata.category).toBe('power');
  });

  it('should have one pin: IN', () => {
    expect(audioOutputJackDefinition.pins).toHaveLength(1);
    expect(audioOutputJackDefinition.pins[0].label).toBe('IN');
    expect(audioOutputJackDefinition.pins[0].type).toBe('input');
    expect(audioOutputJackDefinition.pins[0].position).toEqual({ x: 0, y: -20 });
  });

  it('should have empty default parameters', () => {
    expect(audioOutputJackDefinition.defaultParameters).toEqual({});
  });
});
