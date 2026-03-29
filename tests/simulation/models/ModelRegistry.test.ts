import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import type { ComponentModel } from '@/simulation/models/ComponentModel';

class StubModel implements ComponentModel {
  readonly type = 'stub';
  getInternalNodeCount() { return 0; }
  getBranchCount() { return 0; }
  init() {}
  stamp() {}
  postStep() {}
  convergenceError() { return 0; }
  reset() {}
}

describe('ModelRegistry', () => {
  it('registers and creates models', () => {
    const registry = new ModelRegistry();
    registry.register('stub', () => new StubModel());
    expect(registry.has('stub')).toBe(true);
    const model = registry.create('stub');
    expect(model).not.toBeNull();
    expect(model!.type).toBe('stub');
  });

  it('returns null for unknown types', () => {
    const registry = new ModelRegistry();
    expect(registry.create('unknown')).toBeNull();
    expect(registry.has('unknown')).toBe(false);
  });

  it('creates independent instances each call', () => {
    const registry = new ModelRegistry();
    registry.register('stub', () => new StubModel());
    const a = registry.create('stub');
    const b = registry.create('stub');
    expect(a).not.toBe(b);
  });
});
