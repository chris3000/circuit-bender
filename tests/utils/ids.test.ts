import { describe, it, expect } from 'vitest';
import {
  generateComponentId,
  generateConnectionId,
  generateNetId,
  generatePinId,
} from '@/utils/ids';

describe('ID Utilities', () => {
  it('should generate unique component IDs', () => {
    const id1 = generateComponentId();
    const id2 = generateComponentId();

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(id1.startsWith('comp_')).toBe(true);
  });

  it('should generate unique connection IDs', () => {
    const id1 = generateConnectionId();
    const id2 = generateConnectionId();

    expect(id1).not.toBe(id2);
    expect(id1.startsWith('conn_')).toBe(true);
  });

  it('should generate unique net IDs', () => {
    const id1 = generateNetId();
    const id2 = generateNetId();

    expect(id1).not.toBe(id2);
    expect(id1.startsWith('net_')).toBe(true);
  });

  it('should generate pin IDs with component prefix', () => {
    const id = generatePinId('comp1', 0);
    expect(id).toBe('comp1_pin_0');
  });
});
