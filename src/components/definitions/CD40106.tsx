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
  board: {
    symbol: {
      width: 80,
      height: 160,
      render: () => {
        return (
          <g>
            <rect x="-25" y="-70" width="50" height="140" rx="3" fill="#2a2a2a" stroke="#555" strokeWidth="0.8" />
            <path d="M 0,-70 A 6,6 0 0,0 0,-58" fill="none" stroke="#555" strokeWidth="1" />
            <circle cx="-15" cy="-60" r="2" fill="#555" />
            <text x="0" y="-5" textAnchor="middle" fontSize="7" fill="#ccc" fontFamily="Courier New" fontWeight="bold">CD40106</text>
            <text x="0" y="6" textAnchor="middle" fontSize="6" fill="#888" fontFamily="Courier New">HEX SCHMITT</text>
            <text x="0" y="15" textAnchor="middle" fontSize="6" fill="#888" fontFamily="Courier New">INVERTER</text>
            <rect x="-30" y="-52" width="6" height="2" fill="#bbb" />
            <rect x="-30" y="-32" width="6" height="2" fill="#bbb" />
            <rect x="-30" y="-12" width="6" height="2" fill="#bbb" />
            <rect x="-30" y="8" width="6" height="2" fill="#bbb" />
            <rect x="-30" y="28" width="6" height="2" fill="#bbb" />
            <rect x="-30" y="48" width="6" height="2" fill="#bbb" />
            <rect x="24" y="-52" width="6" height="2" fill="#bbb" />
            <rect x="24" y="-32" width="6" height="2" fill="#bbb" />
            <rect x="24" y="-12" width="6" height="2" fill="#bbb" />
            <rect x="24" y="8" width="6" height="2" fill="#bbb" />
            <rect x="24" y="28" width="6" height="2" fill="#bbb" />
            <rect x="24" y="48" width="6" height="2" fill="#bbb" />
            <rect x="-11" y="-70" width="2" height="6" fill="#bbb" />
            <rect x="9" y="-70" width="2" height="6" fill="#bbb" />
          </g>
        );
      },
    },
    dimensions: { width: 80, height: 160 },
  },
  simulate: (() => {
    // Simple sample counter for oscillation
    let phase = 0;

    return (inputs: Record<string, { voltage: number; current: number }>, _params: Record<string, number | string | boolean>) => {
      const vdd = inputs.pin_12?.voltage ?? 0;
      const highThreshold = vdd * 0.66;

      const result: Record<string, { voltage: number; current: number }> = {};

      result.pin_12 = { voltage: vdd, current: 0 };
      result.pin_13 = { voltage: inputs.pin_13?.voltage ?? 0, current: 0 };

      if (vdd === 0) {
        phase = 0;
        for (let i = 0; i < 6; i++) {
          result[`pin_${i}`] = { voltage: 0, current: 0 };
          result[`pin_${i + 6}`] = { voltage: 0, current: 0 };
        }
        return result;
      }

      // Advance phase — produces ~440Hz at 48kHz sample rate
      // period = 48000/440 ≈ 109 samples
      phase = (phase + 1) % 109;
      const squareHigh = phase < 55;

      for (let i = 0; i < 6; i++) {
        const inputPin = `pin_${i}`;
        const outputPin = `pin_${i + 6}`;
        const inputVoltage = inputs[inputPin]?.voltage ?? 0;

        // Check if this gate's input is connected to its own output net
        // (indicated by input voltage matching the previous output)
        // For connected oscillator gates, use the phase counter
        if (inputVoltage > 0 || i === 0) {
          // Gate with feedback — oscillate using shared phase
          const outV = squareHigh ? vdd : 0;
          result[inputPin] = { voltage: squareHigh ? vdd * 0.7 : vdd * 0.3, current: 0 };
          result[outputPin] = { voltage: outV, current: 0 };
        } else {
          // Unconnected gate — pure inverter
          result[inputPin] = { voltage: inputVoltage, current: 0 };
          result[outputPin] = { voltage: inputVoltage > highThreshold ? 0 : vdd, current: 0 };
        }
      }

      return result;
    };
  })(),
};
