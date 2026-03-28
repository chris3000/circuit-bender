import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const ledDefinition: ComponentDefinition = {
  type: 'led',
  metadata: {
    name: 'LED',
    category: 'active',
    description: 'Light-emitting diode - emits light when forward biased',
  },
  pins: [
    {
      id: generatePinId('led', 0),
      label: 'A',
      type: 'bidirectional',
      position: { x: -20, y: 0 },
    },
    {
      id: generatePinId('led', 1),
      label: 'K',
      type: 'bidirectional',
      position: { x: 20, y: 0 },
    },
  ],
  defaultParameters: {
    color: 'red',
    forwardVoltage: 2.0,
  },
  schematic: {
    symbol: {
      width: 40,
      height: 30,
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
            {/* Emission arrows */}
            <line x1="2" y1="-10" x2="6" y2="-16" stroke="currentColor" strokeWidth="1.5" />
            <polygon points="6,-16 4,-13 7,-13" fill="currentColor" />
            <line x1="6" y1="-8" x2="10" y2="-14" stroke="currentColor" strokeWidth="1.5" />
            <polygon points="10,-14 8,-11 11,-11" fill="currentColor" />
            {/* Label */}
            <text x="0" y="16" textAnchor="middle" fontSize="9" fill="currentColor">LED</text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 30 },
  },
  board: {
    symbol: {
      width: 40,
      height: 30,
      render: (params) => {
        const color = (params.color as string) || 'red';
        const cssColor = color === 'red' ? '#ff2d55' : color === 'green' ? '#00ff88' : color === 'blue' ? '#4488ff' : '#ff2d55';
        return (
          <g>
            <rect x="-20" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
            <rect x="12" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
            <ellipse cx="0" cy="0" rx="10" ry="12" fill={cssColor} opacity="0.3" stroke={cssColor} strokeWidth="0.8" />
            <ellipse cx="0" cy="0" rx="7" ry="9" fill={cssColor} opacity="0.5" />
            <ellipse cx="-2" cy="-3" rx="3" ry="4" fill={cssColor} opacity="0.3" />
            <line x1="8" y1="-10" x2="8" y2="10" stroke={cssColor} strokeWidth="1" opacity="0.5" />
            <text x="0" y="22" textAnchor="middle" fontSize="8" fill="#a8d8a8" opacity="0.7" fontFamily="Courier New">
              LED
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 30 },
  },
  simulate: (inputs, params) => {
    const anode = inputs.pin_0 || { voltage: 0, current: 0 };
    const cathode = inputs.pin_1 || { voltage: 0, current: 0 };

    const forwardVoltage = (params.forwardVoltage as number) || 2.0;
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
