import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const potentiometerDefinition: ComponentDefinition = {
  type: 'potentiometer',
  metadata: {
    name: 'Potentiometer',
    category: 'control',
    description: 'Variable resistor with adjustable wiper position',
  },
  pins: [
    {
      id: generatePinId('potentiometer', 0),
      label: '1',
      type: 'bidirectional',
      position: { x: -25, y: 0 },
    },
    {
      id: generatePinId('potentiometer', 1),
      label: '2',
      type: 'bidirectional',
      position: { x: 0, y: -20 },
    },
    {
      id: generatePinId('potentiometer', 2),
      label: '3',
      type: 'bidirectional',
      position: { x: 25, y: 0 },
    },
  ],
  defaultParameters: {
    maxResistance: 1000000,
    position: 0.5,
    value: '1M',
  },
  schematic: {
    symbol: {
      width: 60,
      height: 50,
      render: (params) => {
        return (
          <g>
            {/* Zigzag resistor path */}
            <path
              d="M -20,0 l 5,-5 l 5,10 l 5,-10 l 5,10 l 5,-10 l 5,10 l 5,-5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            {/* Arrow showing wiper */}
            <line
              x1="0"
              y1="-8"
              x2="0"
              y2="-20"
              stroke="currentColor"
              strokeWidth="2"
            />
            {/* Arrowhead */}
            <polygon
              points="-3,-11 3,-11 0,-8"
              fill="currentColor"
            />
            {/* Value label below */}
            <text
              x="0"
              y="18"
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
            >
              {params.value}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 60, height: 50 },
  },
  board: {
    symbol: {
      width: 60,
      height: 50,
      render: (params) => {
        const pos = (params.position as number) ?? 0.5;
        return (
          <g>
            <circle cx="0" cy="0" r="14" fill="#3a5a8a" stroke="#2a4a6a" strokeWidth="0.8" />
            <circle cx="0" cy="0" r="5" fill="#888" stroke="#666" strokeWidth="0.5" />
            <line x1="0" y1="0" x2={Math.cos((pos - 0.5) * Math.PI) * 12} y2={Math.sin((pos - 0.5) * Math.PI) * 12} stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="-25" y="-1.5" width="10" height="3" rx="1" fill="#ccc" />
            <rect x="15" y="-1.5" width="10" height="3" rx="1" fill="#ccc" />
            <rect x="-1.5" y="-20" width="3" height="6" rx="1" fill="#ccc" />
            <text x="0" y="26" textAnchor="middle" fontSize="8" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">
              {params.value}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 60, height: 50 },
  },
  simulate: (inputs, params) => {
    const v1 = inputs.pin_0?.voltage ?? 0;
    const v3 = inputs.pin_2?.voltage ?? 0;
    const position = (params.position as number) ?? 0.5;

    // Voltage divider: wiper voltage = v1 + (v3 - v1) * position
    const wiperVoltage = v1 + (v3 - v1) * position;

    return {
      pin_0: { voltage: v1, current: 0 },
      pin_1: { voltage: wiperVoltage, current: 0 },
      pin_2: { voltage: v3, current: 0 },
    };
  },
};
