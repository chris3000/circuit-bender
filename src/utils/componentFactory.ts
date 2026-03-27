import { nanoid } from 'nanoid';
import type {
  Component,
  ComponentDefinition,
  ComponentId,
  Position2D,
} from '@/types/circuit';

export const createComponentFromDefinition = (
  definition: ComponentDefinition,
  schematicPosition: Position2D
): Component => {
  return {
    id: `comp_${nanoid(10)}` as ComponentId,
    type: definition.type,
    position: {
      schematic: schematicPosition,
      breadboard: { row: 0, column: 0 }, // Placeholder for Phase 3
    },
    rotation: 0,
    parameters: { ...definition.defaultParameters },
    pins: definition.pins.map(pin => ({ ...pin })),
    state: {
      voltages: new Map(),
      currents: new Map(),
    },
  };
};
