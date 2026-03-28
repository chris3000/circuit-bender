import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const powerSupplyDefinition: ComponentDefinition = {
  type: 'power',
  metadata: {
    name: 'Power Supply',
    category: 'power',
    description: 'DC voltage source (default +9V)',
  },
  pins: [
    {
      id: generatePinId('power', 0),
      label: '+',
      type: 'power',
      position: { x: 0, y: -30 },
    },
    {
      id: generatePinId('power', 1),
      label: '−',
      type: 'ground',
      position: { x: 0, y: 30 },
    },
  ],
  defaultParameters: {
    voltage: 9,
    value: '+9V',
  },
  schematic: {
    symbol: {
      width: 40,
      height: 60,
      render: (params) => {
        return (
          <g>
            {/* Lead from + pin to symbol */}
            <line x1="0" y1="-30" x2="0" y2="-8" stroke="currentColor" strokeWidth="2" />
            {/* + label */}
            <text x="12" y="-18" fontSize="10" fill="currentColor">+</text>
            {/* Long plate (positive) */}
            <line x1="-12" y1="-8" x2="12" y2="-8" stroke="currentColor" strokeWidth="2.5" />
            {/* Short plate (negative) */}
            <line x1="-7" y1="0" x2="7" y2="0" stroke="currentColor" strokeWidth="2.5" />
            {/* Long plate */}
            <line x1="-12" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="2.5" />
            {/* Short plate */}
            <line x1="-7" y1="16" x2="7" y2="16" stroke="currentColor" strokeWidth="2.5" />
            {/* − label */}
            <text x="12" y="20" fontSize="10" fill="currentColor">−</text>
            {/* Lead from symbol to − pin */}
            <line x1="0" y1="16" x2="0" y2="30" stroke="currentColor" strokeWidth="2" />
            {/* Voltage label */}
            <text x="-22" y="4" textAnchor="middle" fontSize="10" fill="currentColor">
              {params.value}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 60 },
  },
  board: {
    symbol: {
      width: 40,
      height: 60,
      render: (params) => {
        return (
          <g>
            <rect x="-18" y="-25" width="36" height="50" rx="4" fill="#2a2a2a" stroke="#555" strokeWidth="0.8" />
            <rect x="-8" y="-25" width="16" height="3" rx="1" fill="#c44" />
            <text x="0" y="-5" textAnchor="middle" fontSize="12" fill="#e04040" fontFamily="Courier New" fontWeight="bold">+</text>
            <text x="0" y="12" textAnchor="middle" fontSize="12" fill="#999" fontFamily="Courier New">-</text>
            <text x="0" y="22" textAnchor="middle" fontSize="6" fill="#777" fontFamily="Courier New">{params.value}</text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 60 },
  },
  simulate: (_inputs, params) => {
    const voltage = (params.voltage as number) ?? 9;

    return {
      pin_0: { voltage, current: 0 },
      pin_1: { voltage: 0, current: 0 },
    };
  },
};
