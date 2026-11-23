import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { potentiometerArt } from '@/components/art/partArt';
import { potentiometerBoard } from '@/components/art/boardArt';

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
  value: { parameter: 'maxResistance', kind: 'resistance', label: 'Resistance', example: '100k' },
  shelf: {
    keywords: ['pot', 'knob', 'dial', 'variable', 'trimmer'],
    art: potentiometerArt,
    stock: [1e3, 5e3, 10e3, 50e3, 100e3, 250e3, 500e3, 1e6],
  },
  cover: { control: 'knob', parameter: 'position', name: 'KNOB' },
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
      render: potentiometerBoard,
    },
    dimensions: { width: 70, height: 100 },
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
