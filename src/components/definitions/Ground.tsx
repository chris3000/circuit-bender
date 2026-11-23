import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { groundArt } from '@/components/art/partArt';
import { groundBoard } from '@/components/art/boardArt';

export const groundDefinition: ComponentDefinition = {
  type: 'ground',
  metadata: {
    name: 'Ground',
    category: 'power',
    description: '0V reference point',
  },
  pins: [
    {
      id: generatePinId('ground', 0),
      label: 'GND',
      type: 'ground',
      position: { x: 0, y: -20 },
    },
  ],
  defaultParameters: {},
  shelf: { caption: '0 V', keywords: ['gnd', 'earth', 'vss', 'common'], art: groundArt },
  schematic: {
    symbol: {
      width: 40,
      height: 40,
      render: () => {
        return (
          <g>
            {/* Lead from pin to ground symbol */}
            <line
              x1="0"
              y1="-20"
              x2="0"
              y2="0"
              stroke="currentColor"
              strokeWidth="2"
            />
            {/* Ground symbol - three horizontal lines */}
            <line
              x1="-15"
              y1="0"
              x2="15"
              y2="0"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="-10"
              y1="5"
              x2="10"
              y2="5"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="-5"
              y1="10"
              x2="5"
              y2="10"
              stroke="currentColor"
              strokeWidth="2"
            />
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 40 },
  },
  board: {
    symbol: {
      width: 40,
      height: 40,
      render: groundBoard,
    },
    dimensions: { width: 40, height: 40 },
  },
  simulate: () => {
    return {
      pin_0: { voltage: 0, current: 0 },
    };
  },
};
