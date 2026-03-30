import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

const BAND_COLORS = [
  '#1a1a1a', // 0: Black
  '#8B4513', // 1: Brown
  '#FF0000', // 2: Red
  '#FF8C00', // 3: Orange
  '#FFD700', // 4: Yellow
  '#008000', // 5: Green
  '#0000FF', // 6: Blue
  '#8B00FF', // 7: Violet
  '#808080', // 8: Grey
  '#FFFFFF', // 9: White
];

function resistorBands(resistance: number): [string, string, string, string] {
  const gold = '#CFB53B';
  if (resistance <= 0) return [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], gold];

  // Find two significant digits and multiplier
  let r = resistance;
  let multiplier = 0;
  while (r >= 100) { r /= 10; multiplier++; }
  while (r < 10 && multiplier > 0) { r *= 10; multiplier--; }
  const sig = Math.round(r);
  const d1 = Math.floor(sig / 10) || 0;
  const d2 = sig % 10;

  return [
    BAND_COLORS[d1] ?? BAND_COLORS[0],
    BAND_COLORS[d2] ?? BAND_COLORS[0],
    BAND_COLORS[multiplier] ?? BAND_COLORS[0],
    gold,
  ];
}

export const resistorDefinition: ComponentDefinition = {
  type: 'resistor',
  metadata: {
    name: 'Resistor',
    category: 'passive',
    description: 'Basic resistor - limits current flow',
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
  defaultParameters: {
    resistance: 1000, // ohms
    value: '1kΩ',
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
  },
  board: {
    symbol: {
      width: 60,
      height: 20,
      render: (params) => {
        const [b1, b2, b3, b4] = resistorBands(params.resistance as number);
        return (
          <g>
            <rect x="-30" y="-1.5" width="12" height="3" rx="1" fill="#ccc" />
            <rect x="18" y="-1.5" width="12" height="3" rx="1" fill="#ccc" />
            <rect x="-18" y="-8" width="36" height="16" rx="5" fill="#c49456" stroke="#7a5820" strokeWidth="0.8" />
            <rect x="-12" y="-8" width="3" height="16" rx="0.5" fill={b1} opacity="0.85" />
            <rect x="-5" y="-8" width="3" height="16" rx="0.5" fill={b2} opacity="0.85" />
            <rect x="2" y="-8" width="3" height="16" rx="0.5" fill={b3} opacity="0.85" />
            <rect x="11" y="-8" width="3" height="16" rx="0.5" fill={b4} opacity="0.85" />
            <text x="0" y="20" textAnchor="middle" fontSize="8" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">
              {params.value}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 60, height: 20 },
  },
  simulate: (inputs, params) => {
    const pin0 = inputs.pin_0 || { voltage: 0, current: 0 };
    const pin1 = inputs.pin_1 || { voltage: 0, current: 0 };

    const resistance = Math.max(params.resistance as number, 0.001); // Prevent divide by zero
    const voltageDiff = pin0.voltage - pin1.voltage;
    const current = voltageDiff / resistance;

    // Clamp to reasonable range
    const clampedCurrent = Math.max(-10, Math.min(10, current));

    return {
      pin_0: { voltage: pin0.voltage, current: -clampedCurrent },
      pin_1: { voltage: pin1.voltage, current: clampedCurrent },
    };
  },
};
