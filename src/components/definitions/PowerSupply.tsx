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
      position: { x: 0, y: 20 },
    },
  ],
  defaultParameters: {
    voltage: 9,
    value: '+9V',
  },
  schematic: {
    symbol: {
      width: 40,
      height: 50,
      render: (params) => {
        return (
          <g>
            {/* Circle */}
            <circle
              cx="0"
              cy="0"
              r="15"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            {/* Plus sign */}
            <text
              x="0"
              y="5"
              textAnchor="middle"
              fontSize="16"
              fill="currentColor"
            >
              +
            </text>
            {/* Lead from circle to pin */}
            <line
              x1="0"
              y1="15"
              x2="0"
              y2="20"
              stroke="currentColor"
              strokeWidth="2"
            />
            {/* Voltage label above */}
            <text
              x="0"
              y="-25"
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
    dimensions: { width: 40, height: 50 },
  },
  breadboard: {
    renderer: (ctx, _params) => {
      // Red wire
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 1 },
  },
  simulate: (_inputs, params) => {
    const voltage = (params.voltage as number) ?? 9;

    return {
      pin_0: { voltage, current: 0 },
    };
  },
};
