import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const capacitorDefinition: ComponentDefinition = {
  type: 'capacitor',
  metadata: {
    name: 'Capacitor',
    category: 'passive',
    description: 'Stores electrical charge, blocks DC current',
  },
  pins: [
    {
      id: generatePinId('capacitor', 0),
      label: '1',
      type: 'bidirectional',
      position: { x: -20, y: 0 },
    },
    {
      id: generatePinId('capacitor', 1),
      label: '2',
      type: 'bidirectional',
      position: { x: 20, y: 0 },
    },
  ],
  defaultParameters: {
    capacitance: 0.0000001, // 100nF in farads
    value: '100nF',
  },
  schematic: {
    symbol: {
      width: 50,
      height: 30,
      render: (params) => {
        return (
          <g>
            {/* Left lead from pin to plate */}
            <line x1="-20" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Left plate */}
            <line x1="-10" y1="-12" x2="-10" y2="12" stroke="currentColor" strokeWidth="2" />
            {/* Right plate */}
            <line x1="10" y1="-12" x2="10" y2="12" stroke="currentColor" strokeWidth="2" />
            {/* Right lead from plate to pin */}
            <line x1="10" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Value label */}
            <text
              x="0"
              y="-18"
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
            >
              {params.value || '100nF'}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 30 },
  },
  breadboard: {
    renderer: (ctx, _params) => {
      // Yellow ceramic disc capacitor
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#FFD700';
      ctx.fill();

      // Outline
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#B8860B';
      ctx.lineWidth = 1;
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 2 },
  },
  simulate: (inputs, _params) => {
    // Simplified MVP model: acts as pass-through
    // Real RC charging requires differential equations
    const pin0 = inputs.pin_0 || { voltage: 0, current: 0 };
    const pin1 = inputs.pin_1 || { voltage: 0, current: 0 };

    return {
      pin_0: { voltage: pin0.voltage, current: pin0.current },
      pin_1: { voltage: pin1.voltage, current: pin1.current },
    };
  },
};
