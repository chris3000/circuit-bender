import type { NodeTypes } from 'reactflow';
import { CircuitNode } from './CircuitNode';
import { LEDNode } from './LEDNode';
import { PotentiometerNode } from './PotentiometerNode';
import { EditableNode } from './EditableNode';

export const nodeTypes: NodeTypes = {
  resistor: EditableNode,
  capacitor: EditableNode,
  potentiometer: PotentiometerNode,
  led: LEDNode,
  cd40106: CircuitNode,
  lm741: CircuitNode,
  power: CircuitNode,
  ground: CircuitNode,
  'audio-output': CircuitNode,
  '1n914': CircuitNode,
  '2n3904': CircuitNode,
};
