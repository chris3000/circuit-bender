import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

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
      render: () => {
        return (
          <g>
            <rect x="-10" y="-10" width="20" height="14" rx="2" fill="#2a2a2a" stroke="#555" strokeWidth="0.6" />
            <line x1="-6" y1="0" x2="6" y2="0" stroke="#888" strokeWidth="1.5" />
            <line x1="-4" y1="3" x2="4" y2="3" stroke="#888" strokeWidth="1.2" />
            <line x1="-2" y1="6" x2="2" y2="6" stroke="#888" strokeWidth="0.8" />
            <text x="0" y="18" textAnchor="middle" fontSize="7" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">GND</text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 40 },
  },
  simulate: () => {
    return {
      pin_0: { voltage: 0, current: 0 },
    };
  },
};
