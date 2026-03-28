import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

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
  breadboard: {
    renderer: (ctx, _params) => {
      // Black DIP-14 package body
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-15, -35, 30, 70);

      // White notch circle at top
      ctx.beginPath();
      ctx.arc(0, -30, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    },
    dimensions: { rows: 7, columns: 2 },
  },
  simulate: (inputs, _params) => {
    const vdd = inputs.pin_12?.voltage ?? 0;
    const highThreshold = vdd * 0.6;

    const result: Record<string, { voltage: number; current: number }> = {};

    // Pass through power pins
    result.pin_12 = { voltage: vdd, current: 0 };
    result.pin_13 = { voltage: inputs.pin_13?.voltage ?? 0, current: 0 };

    // For each gate i (0-5): inverts pin_i to pin_{i+6}
    for (let i = 0; i < 6; i++) {
      const inputPin = `pin_${i}`;
      const outputPin = `pin_${i + 6}`;
      const inputVoltage = inputs[inputPin]?.voltage ?? 0;

      // Pass through input pin state
      result[inputPin] = { voltage: inputVoltage, current: 0 };

      // Schmitt trigger inverter logic
      const outputVoltage = inputVoltage > highThreshold ? 0 : vdd;
      result[outputPin] = { voltage: outputVoltage, current: 0 };
    }

    return result;
  },
};
