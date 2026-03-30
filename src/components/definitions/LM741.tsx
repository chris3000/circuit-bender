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
    // pin_0: Inverting input (-)
    {
      id: generatePinId('lm741', 0),
      label: '-',
      type: 'input',
      position: { x: -25, y: -10 },
    },
    // pin_1: Non-inverting input (+)
    {
      id: generatePinId('lm741', 1),
      label: '+',
      type: 'input',
      position: { x: -25, y: 10 },
    },
    // pin_2: V- (ground)
    {
      id: generatePinId('lm741', 2),
      label: 'V-',
      type: 'power',
      position: { x: -25, y: 30 },
    },
    // pin_3: OUT (output)
    {
      id: generatePinId('lm741', 3),
      label: 'OUT',
      type: 'output',
      position: { x: 25, y: 10 },
    },
    // pin_4: V+ (power)
    {
      id: generatePinId('lm741', 4),
      label: 'V+',
      type: 'power',
      position: { x: 25, y: -10 },
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
    dimensions: { width: 70, height: 70 },
  },
  board: {
    symbol: {
      width: 70,
      height: 90,
      render: () => {
        return (
          <g>
            <rect x="-20" y="-25" width="40" height="50" rx="3" fill="#2a2a2a" stroke="#555" strokeWidth="0.8" />
            <path d="M 0,-25 A 5,5 0 0,0 0,-15" fill="none" stroke="#555" strokeWidth="1" />
            <circle cx="-10" cy="-17" r="2" fill="#555" />
            <text x="0" y="2" textAnchor="middle" fontSize="7" fill="#ccc" fontFamily="Courier New" fontWeight="bold">LM741</text>
            <text x="0" y="12" textAnchor="middle" fontSize="6" fill="#888" fontFamily="Courier New">OP-AMP</text>
            {/* Left pins: IN-, IN+, V- */}
            <rect x="-25" y="-12" width="6" height="2" fill="#bbb" />
            <rect x="-25" y="8" width="6" height="2" fill="#bbb" />
            <rect x="-25" y="28" width="6" height="2" fill="#bbb" />
            {/* Right pins: OUT, V+ */}
            <rect x="19" y="8" width="6" height="2" fill="#bbb" />
            <rect x="19" y="-12" width="6" height="2" fill="#bbb" />
          </g>
        );
      },
    },
    dimensions: { width: 70, height: 70 },
  },
  simulate: (inputs, _params) => {
    const vPlus = inputs.pin_1?.voltage ?? 0;
    const vMinus = inputs.pin_0?.voltage ?? 0;
    const vSupplyPos = inputs.pin_4?.voltage ?? 0;
    const vSupplyNeg = inputs.pin_2?.voltage ?? 0;

    const rawOutput = (vPlus - vMinus) * 100000;
    const clampedOutput = Math.max(vSupplyNeg, Math.min(vSupplyPos, rawOutput));

    return {
      pin_0: { voltage: inputs.pin_0?.voltage ?? 0, current: 0 },
      pin_1: { voltage: inputs.pin_1?.voltage ?? 0, current: 0 },
      pin_2: { voltage: inputs.pin_2?.voltage ?? 0, current: 0 },
      pin_3: { voltage: clampedOutput, current: 0 },
      pin_4: { voltage: inputs.pin_4?.voltage ?? 0, current: 0 },
    };
  },
};
