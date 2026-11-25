import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { resistorArt } from '@/components/art/partArt';
import { resistorBoard } from '@/components/art/boardArt';
import { standardValues } from '@/utils/partValue';

export const resistorDefinition: ComponentDefinition = {
  type: 'resistor',
  metadata: {
    name: 'Resistor',
    category: 'passive',
    description: 'Holds current back: the more ohms, the less gets through. It sets how bright an LED is, how fast a capacitor fills and how a voltage is shared out',
  },
  pins: [
    {
      id: generatePinId('resistor', 0),
      label: '1',
      type: 'bidirectional',
      position: { x: -30, y: 0 },
    },
    {
      id: generatePinId('resistor', 1),
      label: '2',
      type: 'bidirectional',
      position: { x: 30, y: 0 },
    },
  ],
  overload: 'More than a quarter of a watt: a real resistor this size would be too hot to touch.',
  defaultParameters: {
    resistance: 1000, // ohms
    value: '1kΩ',
  },
  value: { parameter: 'resistance', kind: 'resistance', label: 'Resistance', example: '4.7k' },
  shelf: {
    keywords: ['ohm', 'ohms', 'r'],
    art: resistorArt,
    // The E12 series from 10 Ω to 10 MΩ
    alike: ['resistance'],
    stock: [...standardValues(10, 8.2e6), 10e6],
    common: [100, 220, 470, 1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3, 470e3, 1e6],
  },
  schematic: {
    symbol: {
      width: 60,
      height: 20,
      render: (params) => {
        return (
          <g>
            <line x1="-30" y1="0" x2="-15" y2="0" stroke="black" strokeWidth="2" />
            <path
              d="M -15 0 L -10 -5 L -5 5 L 0 -5 L 5 5 L 10 -5 L 15 0"
              stroke="black"
              strokeWidth="2"
              fill="none"
            />
            <line x1="15" y1="0" x2="30" y2="0" stroke="black" strokeWidth="2" />
            <text
              x="0"
              y="-10"
              textAnchor="middle"
              fontSize="10"
              fill="black"
            >
              {params.value}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 60, height: 20 },
    overhang: { top: 12 },
  },
  board: {
    symbol: {
      width: 60,
      height: 20,
      render: resistorBoard,
    },
    dimensions: { width: 60, height: 20 },
    overhang: { bottom: 14 },
  },
};
