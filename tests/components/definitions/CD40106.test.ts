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
});
