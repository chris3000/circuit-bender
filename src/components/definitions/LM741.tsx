import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const lm741Definition: ComponentDefinition = {
  type: 'lm741',
  metadata: {
    name: 'LM741',
    category: 'ic',
    description: 'General-purpose operational amplifier',
  },
  pins: [
    // pin_0: NC (not connected)
    {
      id: generatePinId('lm741', 0),
      label: 'NC',
      type: 'bidirectional',
      position: { x: -25, y: -30 },
    },
    // pin_1: Inverting input (-)
    {
      id: generatePinId('lm741', 1),
      label: '-',
      type: 'input',
      position: { x: -25, y: -10 },
    },
    // pin_2: Non-inverting input (+)
    {
      id: generatePinId('lm741', 2),
      label: '+',
      type: 'input',
      position: { x: -25, y: 10 },
    },
    // pin_3: V- (negative supply)
    {
      id: generatePinId('lm741', 3),
      label: 'V-',
      type: 'power',
      position: { x: -25, y: 30 },
    },
    // pin_4: NC (not connected)
    {
      id: generatePinId('lm741', 4),
      label: 'NC',
      type: 'bidirectional',
      position: { x: 25, y: 30 },
    },
    // pin_5: OUT (output)
    {
      id: generatePinId('lm741', 5),
      label: 'OUT',
      type: 'output',
      position: { x: 25, y: 10 },
    },
    // pin_6: V+ (positive supply)
    {
      id: generatePinId('lm741', 6),
      label: 'V+',
      type: 'power',
      position: { x: 25, y: -10 },
    },
    // pin_7: NC (not connected)
    {
      id: generatePinId('lm741', 7),
      label: 'NC',
      type: 'bidirectional',
      position: { x: 25, y: -30 },
    },
  ],
  defaultParameters: {},
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
  },
  breadboard: {
    renderer: (ctx, _params) => {
      // Black DIP-8 package body
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-10, -20, 20, 40);

      // White notch circle at top
      ctx.beginPath();
      ctx.arc(0, -15, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    },
    dimensions: { rows: 4, columns: 2 },
  },
  simulate: (inputs, _params) => {
    const vPlus = inputs.pin_2?.voltage ?? 0;      // Non-inverting input
    const vMinus = inputs.pin_1?.voltage ?? 0;      // Inverting input
    const vSupplyPos = inputs.pin_6?.voltage ?? 0;  // V+ supply
    const vSupplyNeg = inputs.pin_3?.voltage ?? 0;  // V- supply

    // High gain amplification
    const rawOutput = (vPlus - vMinus) * 100000;

    // Clamp output to supply rails
    const clampedOutput = Math.max(vSupplyNeg, Math.min(vSupplyPos, rawOutput));

    const result: Record<string, { voltage: number; current: number }> = {};

    // Pass through all input pin states
    for (let i = 0; i < 8; i++) {
      const pinKey = `pin_${i}`;
      result[pinKey] = {
        voltage: inputs[pinKey]?.voltage ?? 0,
        current: 0,
      };
    }

    // Set the output pin
    result.pin_5 = { voltage: clampedOutput, current: 0 };

    return result;
  },
};
