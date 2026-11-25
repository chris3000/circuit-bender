import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { junctionArt, solderBlob } from '@/components/art/partArt';

export const junctionDefinition: ComponentDefinition = {
  type: 'junction',
  metadata: {
    name: 'Junction',
    category: 'passive',
    description: 'A dot that joins wires where they meet. Dropping a wire onto a wire puts one in',
  },
  pins: [
    { id: generatePinId('junction', 0), label: 'J', type: 'bidirectional', position: { x: 0, y: 0 } },
  ],
  defaultParameters: {},
  shelf: { caption: 'Joins wires', keywords: ['dot', 'node', 'solder', 'tie'], art: junctionArt },
  schematic: {
    symbol: { width: 12, height: 12, render: () => <circle cx="0" cy="0" r="5" fill="#333" /> },
    dimensions: { width: 12, height: 12 },
  },
  board: {
    symbol: { width: 12, height: 12, render: solderBlob },
    dimensions: { width: 12, height: 12 },
  },
};
