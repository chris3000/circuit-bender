import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { diodeArt } from '@/components/art/partArt';
import { diodeBoard } from '@/components/art/boardArt';

export const diode1N914Definition: ComponentDefinition = {
  type: '1n914',
  metadata: {
    name: '1N914 Signal Diode',
    category: 'active',
    description: 'Small signal switching diode',
  },
  pins: [
    {
      id: generatePinId('1n914', 0),
      label: 'A',
      type: 'bidirectional',
      position: { x: -20, y: 0 },
    },
    {
      id: generatePinId('1n914', 1),
      label: 'K',
      type: 'bidirectional',
      position: { x: 20, y: 0 },
    },
  ],
  defaultParameters: {
    forwardVoltage: 0.7,
  },
  shelf: { title: '1N914', caption: 'Diode', keywords: ['914', '1n4148', 'rectifier'], art: diodeArt },
  schematic: {
    symbol: {
      width: 40,
      height: 20,
      render: () => {
        return (
          <g>
            {/* Left lead */}
            <line x1="-20" y1="0" x2="-8" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Triangle (anode) */}
            <polygon points="-8,-8 -8,8 8,0" fill="none" stroke="currentColor" strokeWidth="2" />
            {/* Bar (cathode) */}
            <line x1="8" y1="-8" x2="8" y2="8" stroke="currentColor" strokeWidth="2" />
            {/* Right lead */}
            <line x1="8" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Label */}
            <text x="0" y="-14" textAnchor="middle" fontSize="9" fill="currentColor">1N914</text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 20 },
    overhang: { top: 14 },
  },
  board: {
    symbol: {
      width: 40,
      height: 20,
      render: diodeBoard,
    },
    dimensions: { width: 40, height: 20 },
    overhang: { bottom: 10 },
  },
};
