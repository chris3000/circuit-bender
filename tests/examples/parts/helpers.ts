import { beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { Work } from '@/classes/Work';
import { PART_EXAMPLES, partExampleFor, type ChosenExample, type ExampleBuild } from '@/examples/parts';
import type { Component } from '@/types/circuit';
import { ALL_PARTS } from '../../views/allParts';

/** Register every part, as the app does on starting. */
export function withParts() {
  beforeAll(() => {
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    for (const definition of ALL_PARTS) registry.register(definition);
  });
}

export const definition = (type: string) => ALL_PARTS.find((d) => d.type === type)!;

/** The example a part gets: of the given value, for a part that comes in values. */
export function exampleOf(type: string, value?: number): ChosenExample {
  const d = definition(type);
  const chosen = partExampleFor(d, value === undefined || !d.value ? {} : { [d.value.parameter]: value });
  if (!chosen) throw new Error(`no example for ${type}`);
  return chosen;
}

export const exampleById = (id: string) => PART_EXAMPLES.find((e) => e.id === id)!;

/** A built example as the circuit a learner would have, and as work to measure. */
export function made(build: ExampleBuild): { circuit: Circuit; work: Work; featured: Component; one: (type: string, nth?: number) => Component } {
  let circuit = new Circuit('example');
  for (const component of build.components) circuit = circuit.addComponent(component);
  for (const connection of build.connections) circuit = circuit.addConnection(connection);
  const work = new Work(circuit);
  return { circuit, work, featured: build.featured, one: (type, nth = 0) => work.parts(type)[nth] };
}

/** A circuit with one part taken out, wires and all (nothing closed behind it). */
export function without(circuit: Circuit, part: Component): Circuit {
  let next = circuit;
  for (const wire of circuit.getConnections()) {
    if (wire.from.componentId === part.id || wire.to.componentId === part.id) next = next.removeConnection(wire.id);
  }
  return next.removeComponent(part.id);
}
