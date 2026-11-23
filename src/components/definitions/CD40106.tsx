import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { chipArt } from '@/components/art/partArt';
import { chipBoard } from '@/components/art/boardArt';

export const cd40106Definition: ComponentDefinition = {
  type: 'cd40106',
  metadata: {
    name: 'CD40106',
    category: 'ic',
    description: 'Hex Schmitt Trigger Inverter - 6 inverting gates with hysteresis',
  },
  pins: [
    // 6 inputs (left side): pin_0 through pin_5
    {
      id: generatePinId('cd40106', 0),
      label: '1A',
      type: 'input',
      position: { x: -30, y: -50 },
    },
    {
      id: generatePinId('cd40106', 1),
      label: '2A',
      type: 'input',
      position: { x: -30, y: -30 },
    },
    {
      id: generatePinId('cd40106', 2),
      label: '3A',
      type: 'input',
      position: { x: -30, y: -10 },
    },
    {
      id: generatePinId('cd40106', 3),
      label: '4A',
      type: 'input',
      position: { x: -30, y: 10 },
    },
    {
      id: generatePinId('cd40106', 4),
      label: '5A',
      type: 'input',
      position: { x: -30, y: 30 },
    },
    {
      id: generatePinId('cd40106', 5),
      label: '6A',
      type: 'input',
      position: { x: -30, y: 50 },
    },
    // 6 outputs (right side): pin_6 through pin_11
    {
      id: generatePinId('cd40106', 6),
      label: '1Y',
      type: 'output',
      position: { x: 30, y: -50 },
    },
    {
      id: generatePinId('cd40106', 7),
      label: '2Y',
      type: 'output',
      position: { x: 30, y: -30 },
    },
    {
      id: generatePinId('cd40106', 8),
      label: '3Y',
      type: 'output',
      position: { x: 30, y: -10 },
    },
    {
      id: generatePinId('cd40106', 9),
      label: '4Y',
      type: 'output',
      position: { x: 30, y: 10 },
    },
    {
      id: generatePinId('cd40106', 10),
      label: '5Y',
      type: 'output',
      position: { x: 30, y: 30 },
    },
    {
      id: generatePinId('cd40106', 11),
      label: '6Y',
      type: 'output',
      position: { x: 30, y: 50 },
    },
    // VDD power: pin_12
    {
      id: generatePinId('cd40106', 12),
      label: 'VDD',
      type: 'power',
      position: { x: -10, y: -70 },
    },
    // VSS ground: pin_13
    {
      id: generatePinId('cd40106', 13),
      label: 'VSS',
      type: 'ground',
      position: { x: 10, y: -70 },
    },
  ],
  defaultParameters: {},
  floatingPins: true,
  shelf: { caption: 'Schmitt ×6', keywords: ['40106', 'hex', 'cmos', 'chip', 'ic', 'oscillator', 'logic'], art: chipArt(14, 'CD40106') },
  schematic: {
    symbol: {
      width: 80,
      height: 160,
      render: () => {
        return (
          <g>
            {/* IC body rectangle */}
            <rect
              x="-35"
              y="-75"
              width="70"
              height="150"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            {/* Notch at top */}
            <path
              d="M -10,-75 Q 0,-85 10,-75"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            {/* Label */}
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="12"
              fill="currentColor"
            >
              CD40106
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 80, height: 160 },
  },
  board: {
    symbol: {
      width: 80,
      height: 160,
      render: chipBoard({
        left: -24, top: -64, width: 48, height: 132,
        marking: 'CD40106',
        lines: ['HEX SCHMITT', 'INVERTER'],
        // Inputs 1A–6A down the left, outputs 1Y–6Y down the right, the supply on top
        legs: [
          ...[-50, -30, -10, 10, 30, 50].flatMap((y) => [{ x: -30, y, side: 'left' as const }, { x: 30, y, side: 'right' as const }]),
          { x: -10, y: -70, side: 'top' }, { x: 10, y: -70, side: 'top' },
        ],
      }),
    },
    dimensions: { width: 80, height: 160 },
  },
};
