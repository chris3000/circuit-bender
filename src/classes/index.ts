import { Circuit } from '@/models/Circuit';
import type { Built, ClassDefinition } from './types';
import { theLoop } from './theLoop';
import { sharingVoltage } from './sharingVoltage';
import { storingCharge } from './storingCharge';
import { simplestOscillator } from './simplestOscillator';
import { playingIt } from './playingIt';
import { moreVoices } from './moreVoices';
import { gates } from './gates';
import { counting } from './counting';
import { the555 } from './the555';
import { steps } from './steps';
import { smallControlsBig } from './smallControlsBig';
import { amplifiers } from './amplifiers';
import { tone } from './tone';
import { bending } from './bending';

/** The classes that are built, in order. The whole course is in ./syllabus. */
export const CLASSES: ClassDefinition[] = [
  theLoop, sharingVoltage, storingCharge,
  simplestOscillator, playingIt, moreVoices,
  gates, counting, the555, steps,
  smallControlsBig, amplifiers, tone,
  bending,
];

export const classById = (id: string | null | undefined): ClassDefinition | undefined =>
  CLASSES.find((c) => c.id === id);

/** What a class's circuit is called on the canvas. */
export const classCircuitName = (definition: ClassDefinition) => `Class ${definition.number}: ${definition.title}`;

function circuitOf(definition: ClassDefinition, built: Built): Circuit {
  let circuit = new Circuit(classCircuitName(definition));
  for (const component of built.components) circuit = circuit.addComponent(component);
  for (const connection of built.connections) circuit = circuit.addConnection(connection);
  return circuit;
}

/** A class's own circuit as it stands when the build is done, ready to put on the canvas. */
export const classCircuit = (definition: ClassDefinition): Circuit => circuitOf(definition, definition.circuit());

/** What a class starts from: what an earlier class kept, or an empty canvas. */
export const classStart = (definition: ClassDefinition): Circuit =>
  circuitOf(definition, definition.start?.() ?? { components: [], connections: [] });

/**
 * The circuit for whoever is stuck on a step: as it stands when the part of
 * the build that step belongs to is done. `done` is the steps done so far.
 */
export function classStage(definition: ClassDefinition, done: readonly string[]): Circuit {
  const order = definition.build.map((step) => step.id);
  const next = order.findIndex((id) => !done.includes(id));
  const stage = next < 0 ? undefined : definition.stages?.find((s) => order.indexOf(s.upTo) >= next);
  return circuitOf(definition, (stage ?? definition).circuit());
}
