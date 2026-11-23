import { describe, it, expect } from 'vitest';
import { transistor2N3904Definition } from '@/components/definitions/Transistor2N3904';

describe('2N3904 NPN Transistor Component', () => {
  it('should have correct metadata', () => {
    expect(transistor2N3904Definition.type).toBe('2n3904');
    expect(transistor2N3904Definition.metadata.name).toBe('2N3904 NPN Transistor');
    expect(transistor2N3904Definition.metadata.category).toBe('active');
  });

  it('should have three pins: B, C, E', () => {
    expect(transistor2N3904Definition.pins).toHaveLength(3);
    expect(transistor2N3904Definition.pins[0].label).toBe('B');
    expect(transistor2N3904Definition.pins[0].type).toBe('input');
    expect(transistor2N3904Definition.pins[0].position).toEqual({ x: -25, y: 0 });
    expect(transistor2N3904Definition.pins[1].label).toBe('C');
    expect(transistor2N3904Definition.pins[1].type).toBe('bidirectional');
    expect(transistor2N3904Definition.pins[1].position).toEqual({ x: 0, y: -25 });
    expect(transistor2N3904Definition.pins[2].label).toBe('E');
    expect(transistor2N3904Definition.pins[2].type).toBe('bidirectional');
    expect(transistor2N3904Definition.pins[2].position).toEqual({ x: 0, y: 25 });
  });

  it('should have default beta parameter', () => {
    expect(transistor2N3904Definition.defaultParameters.beta).toBe(100);
  });
});
