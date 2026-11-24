import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { transistorArt } from '@/components/art/partArt';
import { transistorBoard } from '@/components/art/boardArt';

export const transistor2N3906Definition: ComponentDefinition = {
  type: '2n3906',
  metadata: {
    name: '2N3906 PNP Transistor',
    category: 'active',
    description: 'General-purpose PNP transistor: it turns on when its base is taken below its emitter, and passes current from emitter to collector',
  },
  pins: [
    { id: generatePinId('2n3906', 0), label: 'B', type: 'input', position: { x: -25, y: 0 } },
    { id: generatePinId('2n3906', 1), label: 'C', type: 'bidirectional', position: { x: 0, y: -25 } },
    { id: generatePinId('2n3906', 2), label: 'E', type: 'bidirectional', position: { x: 0, y: 25 } },
  ],
  defaultParameters: {},
  through: [1, 2], // collector to emitter, the path it switches
  shelf: { title: '2N3906', caption: 'PNP transistor', keywords: ['pnp', 'bjt', '3906', 'transistor'], art: transistorArt(['2N', '3906']), alike: ['transistor'] },
  schematic: {
    symbol: {
      width: 50, height: 50,
      render: () => (
        <g>
          <line x1="-25" y1="0" x2="-5" y2="0" stroke="currentColor" strokeWidth="2" />
          <line x1="-5" y1="-15" x2="-5" y2="15" stroke="currentColor" strokeWidth="3" />
          <line x1="-5" y1="-8" x2="0" y2="-25" stroke="currentColor" strokeWidth="2" />
          <line x1="-5" y1="8" x2="0" y2="25" stroke="currentColor" strokeWidth="2" />
          {/* The arrow on the emitter points in: PNP */}
          <polygon points="-4.2,10.6 -0.4,15.4 -5.6,16.6" fill="currentColor" />
          <text x="8" y="0" fontSize="9" fill="currentColor">2N3906</text>
        </g>
      ),
    },
    dimensions: { width: 50, height: 50 },
    overhang: { right: 18 },
  },
  board: {
    symbol: { width: 50, height: 50, render: transistorBoard(['2N', '3906']) },
    dimensions: { width: 50, height: 50 },
  },
};
