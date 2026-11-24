import type { NodeTypes } from 'reactflow';
import { CircuitNode } from './CircuitNode';
import { LEDNode } from './LEDNode';
import { PotentiometerNode } from './PotentiometerNode';
import { SwitchNode } from './SwitchNode';
import { JunctionNode } from './JunctionNode';
import { ControlNode } from './ControlNode';

export const nodeTypes: NodeTypes = {
  resistor: CircuitNode,
  capacitor: CircuitNode,
  potentiometer: PotentiometerNode,
  led: LEDNode,
  cd40106: CircuitNode,
  lm741: CircuitNode,
  power: ControlNode,
  ground: CircuitNode,
  'audio-output': CircuitNode,
  '1n914': CircuitNode,
  '2n3904': CircuitNode,
  switch: SwitchNode,
  junction: JunctionNode,
  ne555: CircuitNode,
  cd4093: CircuitNode,
  cd4040: CircuitNode,
  cd4017: CircuitNode,
  lm386: CircuitNode,
  speaker: CircuitNode,
  ldr: ControlNode,
  pushbutton: ControlNode,
  'body-contact': ControlNode,
  'audio-input': ControlNode,
  cd4049: CircuitNode,
  cd4013: CircuitNode,
  lm324: CircuitNode,
  tl072: CircuitNode,
  lm13700: CircuitNode,
  spdt: SwitchNode,
  optocoupler: CircuitNode,
  piezo: ControlNode,
  '1n4004': CircuitNode,
  '2n5457': CircuitNode,
  '2n3906': CircuitNode,
};
