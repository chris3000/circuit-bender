/**
 * The example that goes with each part: a small circuit that shows what the
 * part does, with a few words about it. The shelf and the inspector offer it.
 *
 * To give a part its example, add an entry (`part` is the definition's
 * `type`) to one of the lists below. A part that comes in values can have
 * several, by value: the ones for a single value (`only`) come first, then
 * the ranges (`to`), smallest first.
 */
import { Circuit } from '@/models/Circuit';
import type { ComponentDefinition, ComponentId, ComponentParameters } from '@/types/circuit';
import { sameValue } from '@/utils/partValue';
import type { PartExample } from './types';
import { BASICS } from './basics';
import { SUPPLY_AND_SOUND } from './supplyAndSound';
import { CHIPS } from './chips';
import { SENSORS_AND_SEMICONDUCTORS } from './sensorsAndSemiconductors';

export type { ExampleBuild, PartExample } from './types';

export const PART_EXAMPLES: PartExample[] = [...BASICS, ...SUPPLY_AND_SOUND, ...CHIPS, ...SENSORS_AND_SEMICONDUCTORS];

/** The value a part is known by (a resistor's ohms), for a part that has one. */
function valueOf(definition: ComponentDefinition, parameters: ComponentParameters): number | undefined {
  if (!definition.value) return undefined;
  const value = Number(parameters[definition.value.parameter] ?? definition.defaultParameters[definition.value.parameter]);
  return value > 0 ? value : undefined;
}

export interface ChosenExample {
  example: PartExample;
  /** The value the example is built with, for a part that comes in values. */
  value?: number;
  description: string;
}

/** The example for a part with these parameters; null for a part that has none. */
export function partExampleFor(definition: ComponentDefinition, parameters: ComponentParameters = {}): ChosenExample | null {
  const own = PART_EXAMPLES.filter((example) => example.part === definition.type);
  const value = valueOf(definition, parameters);
  const example = value === undefined
    ? own[0]
    : own.find((e) => e.only !== undefined && sameValue(e.only, value))
      ?? own.find((e) => e.only === undefined && (e.to === undefined || value <= e.to * 1.0001));
  if (!example) return null;
  const description = typeof example.description === 'function' ? example.description(value ?? 0) : example.description;
  return { example, value, description };
}

/** An example as a circuit ready to put on the canvas, and the part in it to point at. */
export function partExampleCircuit(chosen: ChosenExample): { circuit: Circuit; featured: ComponentId } {
  const { components, connections, featured } = chosen.example.build(chosen.value);
  let circuit = new Circuit(chosen.example.name);
  for (const component of components) circuit = circuit.addComponent(component);
  for (const connection of connections) circuit = circuit.addConnection(connection);
  return { circuit, featured: featured.id };
}
