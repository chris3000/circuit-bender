import { describe, it, expect } from 'vitest';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { resistorDefinition } from '@/components/definitions/Resistor';

describe('componentFactory', () => {
  it('should create a component from a definition with correct type', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    expect(component.type).toBe('resistor');
  });

  it('should create a component with the given position', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    expect(component.position.x).toBe(100);
    expect(component.position.y).toBe(200);
  });

  it('should create a component with rotation 0', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    expect(component.rotation).toBe(0);
  });

  it('should copy default parameters from definition', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    expect(component.parameters).toEqual(resistorDefinition.defaultParameters);
  });

  it('should not share parameter reference with definition', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    // Mutating the component parameters should not affect the definition
    component.parameters.resistance = 9999;
    expect(resistorDefinition.defaultParameters.resistance).toBe(1000);
  });

  it('should copy pins from definition', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    expect(component.pins).toHaveLength(resistorDefinition.pins.length);
    expect(component.pins[0].id).toBe(resistorDefinition.pins[0].id);
    expect(component.pins[0].label).toBe(resistorDefinition.pins[0].label);
  });

  it('should not share pin reference with definition', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    // Mutating component pins should not affect the definition
    component.pins[0].label = 'modified';
    expect(resistorDefinition.pins[0].label).toBe('1');
  });

  it('should not share pin position reference with definition', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    // Mutating component pin positions should not affect the definition
    const originalX = resistorDefinition.pins[0].position.x;
    component.pins[0].position.x = 999;
    expect(resistorDefinition.pins[0].position.x).toBe(originalX);
  });

  it('should generate a unique component ID', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    expect(component.id).toBeTruthy();
    expect(typeof component.id).toBe('string');
    expect(component.id.length).toBeGreaterThan(0);
  });

  it('should generate different IDs for each component', () => {
    const component1 = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });
    const component2 = createComponentFromDefinition(resistorDefinition, { x: 300, y: 400 });

    expect(component1.id).not.toBe(component2.id);
  });

  it('should initialize component state with empty voltages and currents', () => {
    const component = createComponentFromDefinition(resistorDefinition, { x: 100, y: 200 });

    expect(component.state.voltages).toBeInstanceOf(Map);
    expect(component.state.currents).toBeInstanceOf(Map);
    expect(component.state.voltages.size).toBe(0);
    expect(component.state.currents.size).toBe(0);
  });
});
