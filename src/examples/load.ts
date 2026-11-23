import { Circuit } from '@/models/Circuit';
import type { ExampleCircuit } from './circuits';

/** Build an example as a circuit ready to put on the canvas. */
export function exampleToCircuit(example: ExampleCircuit): Circuit {
  const { components, connections } = example.build();
  let circuit = new Circuit(example.name);
  for (const component of components) circuit = circuit.addComponent(component);
  for (const connection of connections) circuit = circuit.addConnection(connection);
  return circuit;
}
