import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { transistorArt } from '@/components/art/partArt';
import { transistorBoard } from '@/components/art/boardArt';

export const transistor2N3904Definition: ComponentDefinition = {
  type: '2n3904',
  metadata: {
    name: '2N3904 NPN Transistor',
    category: 'active',
    description: 'General-purpose NPN bipolar junction transistor',
  },
  pins: [
    {
      id: generatePinId('2n3904', 0),
      label: 'B',
      type: 'input',
      position: { x: -25, y: 0 },
    },
    {
      id: generatePinId('2n3904', 1),
      label: 'C',
      type: 'bidirectional',
      position: { x: 0, y: -25 },
    },
    {
      id: generatePinId('2n3904', 2),
      label: 'E',
      type: 'bidirectional',
      position: { x: 0, y: 25 },
    },
  ],
  defaultParameters: {
    beta: 100,
    vbeThreshold: 0.7,
  },
  through: [1, 2], // collector to emitter, the path it switches
  shelf: { title: '2N3904', caption: 'Transistor', keywords: ['npn', 'bjt', '3904', 'noise'], art: transistorArt(['2N', '3904']), alike: ['transistor'] },
  schematic: {
    symbol: {
      width: 50,
      height: 50,
      render: () => {
        return (
          <g>
            {/* Base lead */}
            <line x1="-25" y1="0" x2="-5" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Vertical bar (base region) */}
            <line x1="-5" y1="-15" x2="-5" y2="15" stroke="currentColor" strokeWidth="3" />
            {/* Collector line */}
            <line x1="-5" y1="-8" x2="0" y2="-25" stroke="currentColor" strokeWidth="2" />
            {/* Emitter line with arrow */}
            <line x1="-5" y1="8" x2="0" y2="25" stroke="currentColor" strokeWidth="2" />
            {/* Arrow on emitter */}
            <polygon points="-2,18 0,25 -6,22" fill="currentColor" />
            {/* Label */}
            <text x="8" y="0" fontSize="9" fill="currentColor">2N3904</text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 50 },
    overhang: { right: 18 },
  },
  board: {
    symbol: {
      width: 50,
      height: 50,
      render: transistorBoard(['2N', '3904']),
    },
    dimensions: { width: 50, height: 50 },
  },
};
