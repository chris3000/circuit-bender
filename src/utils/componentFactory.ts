import { nanoid } from 'nanoid';
import type {
  Component,
  ComponentDefinition,
  ComponentId,
  Position2D,
} from '@/types/circuit';

export const createComponentFromDefinition = (
  definition: ComponentDefinition,
  position: Position2D
): Component => {
  return {
    id: `comp_${nanoid(10)}` as ComponentId,
    type: definition.type,
    position,
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
