import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { ledArt } from '@/components/art/partArt';
import { ledBoard } from '@/components/art/boardArt';

export const ledDefinition: ComponentDefinition = {
  type: 'led',
  metadata: {
    name: 'LED',
    category: 'active',
    description: 'Light-emitting diode - emits light when forward biased',
  },
  pins: [
    {
      id: generatePinId('led', 0),
      label: 'A',
      type: 'bidirectional',
      position: { x: -20, y: 0 },
    },
    {
      id: generatePinId('led', 1),
      label: 'K',
      type: 'bidirectional',
      position: { x: 20, y: 0 },
    },
  ],
  defaultParameters: {
    color: 'red',
    forwardVoltage: 2.0,
  },
  shelf: { caption: 'Red', keywords: ['light', 'lamp', 'indicator'], art: ledArt, alike: ['diode'] },
  cover: { control: 'lamp', name: 'LED' },
  overload: 'Too much current: a real LED would burn out. Put a resistor in line with it.',
  schematic: {
    symbol: {
      width: 40,
      height: 30,
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
            {/* Emission arrows */}
            <line x1="2" y1="-10" x2="6" y2="-16" stroke="currentColor" strokeWidth="1.5" />
            <polygon points="6,-16 4,-13 7,-13" fill="currentColor" />
            <line x1="6" y1="-8" x2="10" y2="-14" stroke="currentColor" strokeWidth="1.5" />
            <polygon points="10,-14 8,-11 11,-11" fill="currentColor" />
            {/* Label */}
            <text x="0" y="16" textAnchor="middle" fontSize="9" fill="currentColor">LED</text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 30 },
    overhang: { bottom: 6 },
  },
  board: {
    symbol: {
      width: 50,
      height: 40,
      render: ledBoard,
    },
    dimensions: { width: 50, height: 40 },
  },
};
