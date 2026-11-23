import { nanoid } from 'nanoid';
import type {
  Component,
  ComponentDefinition,
  ComponentId,
  ComponentParameters,
  Position2D,
} from '@/types/circuit';

/** A new part of the given kind. `parameters` are those it should not take from the kind's defaults (its value, say). */
export const createComponentFromDefinition = (
  definition: ComponentDefinition,
  position: Position2D,
  parameters?: ComponentParameters,
): Component => {
  return {
    id: `comp_${nanoid(10)}` as ComponentId,
    type: definition.type,
    position,
    rotation: 0,
    parameters: { ...definition.defaultParameters, ...parameters },
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
