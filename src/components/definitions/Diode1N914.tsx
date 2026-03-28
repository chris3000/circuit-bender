import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const diode1N914Definition: ComponentDefinition = {
  type: '1n914',
  metadata: {
    name: '1N914 Signal Diode',
    category: 'active',
    description: 'Small signal switching diode',
  },
  pins: [
    {
      id: generatePinId('1n914', 0),
      label: 'A',
      type: 'bidirectional',
      position: { x: -20, y: 0 },
    },
    {
      id: generatePinId('1n914', 1),
      label: 'K',
      type: 'bidirectional',
      position: { x: 20, y: 0 },
    },
  ],
  defaultParameters: {
    forwardVoltage: 0.7,
  },
  schematic: {
    symbol: {
      width: 40,
      height: 20,
      render: () => {
        return (
          <g>
            {/* Left lead */}
            <line x1="-20" y1="0" x2="-8" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Triangle (anode) */}
            <polygon points="-8,-8 -8,8 8,0" fill="none" stroke="currentColor" strokeWidth="2" />
            {/* Bar (cathode) */}
            <line x1="8" y1="-8" x2="8" y2="8" stroke="currentColor" strokeWidth="2" />
            {/* Right lead */}
            <line x1="8" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Label */}
            <text x="0" y="-14" textAnchor="middle" fontSize="9" fill="currentColor">1N914</text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 20 },
  },
  board: {
    symbol: {
      width: 40,
      height: 20,
      render: () => {
        return (
          <g>
            <rect x="-20" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
            <rect x="12" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
            <rect x="-12" y="-5" width="24" height="10" rx="4" fill="#e8a060" stroke="#c07030" strokeWidth="0.6" opacity="0.8" />
            <rect x="8" y="-5" width="3" height="10" rx="0.5" fill="#1a1a1a" opacity="0.8" />
            <text x="0" y="16" textAnchor="middle" fontSize="7" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">
              1N914
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 20 },
  },
  simulate: (inputs, params) => {
    const anode = inputs.pin_0 || { voltage: 0, current: 0 };
    const cathode = inputs.pin_1 || { voltage: 0, current: 0 };

    const forwardVoltage = (params.forwardVoltage as number) || 0.7;
    const vDiff = anode.voltage - cathode.voltage;

    // Forward biased: cathode = anode - forwardVoltage
    const cathodeVoltage = vDiff > forwardVoltage
      ? anode.voltage - forwardVoltage
      : cathode.voltage;

    return {
      pin_0: { voltage: anode.voltage, current: anode.current },
      pin_1: { voltage: cathodeVoltage, current: cathode.current },
    };
  },
};
