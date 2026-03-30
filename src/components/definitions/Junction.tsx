import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const junctionDefinition: ComponentDefinition = {
  type: 'junction',
  metadata: {
    name: 'Junction',
    category: 'passive',
    description: 'Wire junction — connects crossing wires electrically',
  },
  pins: [
    { id: generatePinId('junction', 0), label: 'J', type: 'bidirectional', position: { x: 0, y: 0 } },
  ],
  defaultParameters: {},
  schematic: {
    symbol: { width: 20, height: 20, render: () => <circle cx="0" cy="0" r="5" fill="#333" /> },
    dimensions: { width: 20, height: 20 },
  },
  board: {
    symbol: { width: 20, height: 20, render: () => <circle cx="0" cy="0" r="5" fill="#c4a24e" /> },
    dimensions: { width: 20, height: 20 },
  },
  simulate: (inputs) => ({
    pin_0: inputs.pin_0 || { voltage: 0, current: 0 },
  }),
};
