import React from 'react';
import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

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
    value: '1k',
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
  breadboard: {
    renderer: (ctx, _params) => {
      // Body
      ctx.fillStyle = '#d4a574';
      ctx.fillRect(-20, -4, 40, 8);

      // Color bands (simplified - just show a few bands)
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(-15, -4, 3, 8);
      ctx.fillRect(-5, -4, 3, 8);
      ctx.fillRect(5, -4, 3, 8);

      // Leads
      ctx.strokeStyle = '#c9c9c9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(-20, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(30, 0);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 4 },
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
