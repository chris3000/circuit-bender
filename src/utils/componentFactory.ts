import { nanoid } from 'nanoid';
import type {
  Component,
  ComponentDefinition,
  ComponentId,
  Position2D,
} from '@/types/circuit';
import { BreadboardGrid } from '@/views/BreadboardView/autoPlace';

const breadboardGrid = new BreadboardGrid();

export const resetBreadboardGrid = (): void => {
  breadboardGrid.clear();
};

export const createComponentFromDefinition = (
  definition: ComponentDefinition,
  schematicPosition: Position2D
): Component => {
  return {
    id: `comp_${nanoid(10)}` as ComponentId,
    type: definition.type,
    position: {
      schematic: schematicPosition,
      breadboard: breadboardGrid.place(definition.type, definition.breadboard.dimensions),
    },
    rotation: 0,
    parameters: { ...definition.defaultParameters },
    pins: definition.pins.map(pin => ({
      ...pin,
      position: { ...pin.position },
    })),
    state: {
      voltages: new Map(),
      currents: new Map(),
    },
  };
};
