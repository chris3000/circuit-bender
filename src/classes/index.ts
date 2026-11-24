import { Circuit } from '@/models/Circuit';
import type { ClassDefinition } from './types';
import { theLoop } from './theLoop';

/** The classes that are built, in order. The whole course is in ./syllabus. */
export const CLASSES: ClassDefinition[] = [theLoop];

export const classById = (id: string | null | undefined): ClassDefinition | undefined =>
  CLASSES.find((c) => c.id === id);

/** What a class's circuit is called on the canvas. */
export const classCircuitName = (definition: ClassDefinition) => `Class ${definition.number}: ${definition.title}`;

/** A class's own circuit, ready to put on the canvas. */
export function classCircuit(definition: ClassDefinition): Circuit {
  const { components, connections } = definition.circuit();
  let circuit = new Circuit(classCircuitName(definition));
  for (const component of components) circuit = circuit.addComponent(component);
  for (const connection of connections) circuit = circuit.addConnection(connection);
  return circuit;
}
