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
      width: 70,
      height: 70,
      render: (params) => {
        const pos = (params.position as number) ?? 0.5;
        // Map 0-1 to angle range: -135° to +135° (270° sweep)
        const angle = -135 + pos * 270;
        const rad = (angle * Math.PI) / 180;
        const pointerLen = 18;
        return (
          <g>
            {/* Outer ring */}
            <circle cx="0" cy="0" r="24" fill="#2a3a5a" stroke="#1a2a4a" strokeWidth="1.5" />
            {/* Knurled edge ticks */}
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i * 15 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * 21}
                  y1={Math.sin(a) * 21}
                  x2={Math.cos(a) * 24}
                  y2={Math.sin(a) * 24}
                  stroke="#4a5a7a"
                  strokeWidth="0.8"
                />
              );
            })}
            {/* Inner face */}
            <circle cx="0" cy="0" r="18" fill="#3a5a8a" stroke="#2a4a7a" strokeWidth="0.5" />
            {/* Position indicator line */}
            <line
              x1={0}
              y1={0}
              x2={Math.cos(rad) * pointerLen}
              y2={Math.sin(rad) * pointerLen}
              stroke="#eee"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Center cap */}
            <circle cx="0" cy="0" r="4" fill="#666" stroke="#555" strokeWidth="0.5" />
            {/* Leads */}
            <rect x="-25" y="-1.5" width="6" height="3" rx="1" fill="#ccc" />
            <rect x="19" y="-1.5" width="6" height="3" rx="1" fill="#ccc" />
            <rect x="-1.5" y="-20" width="3" height="6" rx="1" fill="#ccc" />
            {/* Value label */}
            <text x="0" y="36" textAnchor="middle" fontSize="9" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">
              {params.value}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 70, height: 70 },
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
