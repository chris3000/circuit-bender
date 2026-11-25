import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { chipArt } from '@/components/art/partArt';
import { chipBoard } from '@/components/art/boardArt';

export const lm741Definition: ComponentDefinition = {
  type: 'lm741',
  metadata: {
    name: 'LM741',
    category: 'ic',
    description: 'The classic op-amp: an amplifier with two inputs that drives its output whichever way brings them level. With two resistors round it, it amplifies by exactly as much as you choose',
  },
  pins: [
    // pin_0: Inverting input (-) — DIP pin 2
    {
      id: generatePinId('lm741', 0),
      label: '-',
      type: 'input',
      position: { x: -25, y: -11 },
    },
    // pin_1: Non-inverting input (+) — DIP pin 3
    {
      id: generatePinId('lm741', 1),
      label: '+',
      type: 'input',
      position: { x: -25, y: 9 },
    },
    // pin_2: V- (ground) — DIP pin 4
    {
      id: generatePinId('lm741', 2),
      label: 'V-',
      type: 'power',
      position: { x: -25, y: 29 },
    },
    // pin_3: OUT (output) — DIP pin 6
    {
      id: generatePinId('lm741', 3),
      label: 'OUT',
      type: 'output',
      position: { x: 25, y: 9 },
    },
    // pin_4: V+ (power) — DIP pin 7
    {
      id: generatePinId('lm741', 4),
      label: 'V+',
      type: 'power',
      position: { x: 25, y: -11 },
    },
  ],
  defaultParameters: {},
  through: [1, 3], // the + input to the output
  shelf: { caption: 'Op-amp', keywords: ['741', 'opamp', 'amplifier', 'chip', 'ic'], art: chipArt(8, 'LM741'), alike: ['amplifier'] },
  schematic: {
    symbol: {
      width: 70,
      height: 90,
      render: () => {
        return (
          <g>
            {/* Op-amp triangle */}
            <path
              d="M -30,-40 L -30,40 L 30,0 Z"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            {/* Non-inverting input label (+) */}
            <text
              x="-20"
              y="15"
              fontSize="16"
              fill="currentColor"
              textAnchor="middle"
              dominantBaseline="central"
            >
              +
            </text>
            {/* Inverting input label (-) */}
            <text
              x="-20"
              y="-5"
              fontSize="16"
              fill="currentColor"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {'\u2212'}
            </text>
            {/* Component label */}
            <text
              x="0"
              y="-50"
              fontSize="10"
              fill="currentColor"
              textAnchor="middle"
            >
              LM741
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 70, height: 90 },
    overhang: { top: 14 },
  },
  board: {
    symbol: {
      width: 70,
      height: 90,
      render: chipBoard({
        left: -19, top: -38, width: 38, height: 76,
        marking: 'LM741',
        lines: ['OP-AMP'],
        // IN−, IN+ and V− on the left, V+ and OUT on the right; the rest of the eight are not connected
        legs: [
          { x: -25, y: -31, side: 'left', unused: true }, { x: -25, y: -11, side: 'left' }, { x: -25, y: 9, side: 'left' }, { x: -25, y: 29, side: 'left' },
          { x: 25, y: -31, side: 'right', unused: true }, { x: 25, y: -11, side: 'right' }, { x: 25, y: 9, side: 'right' }, { x: 25, y: 29, side: 'right', unused: true },
        ],
      }),
    },
    dimensions: { width: 70, height: 90 },
  },
};
