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
  breadboard: {
    renderer: (ctx, _params) => {
      // Orange glass cylinder body
      ctx.fillStyle = '#e87030';
      ctx.fillRect(-12, -3, 24, 6);

      // Glass transparency effect
      ctx.fillStyle = 'rgba(255, 200, 150, 0.3)';
      ctx.fillRect(-12, -3, 24, 3);

      // Black band (cathode marker)
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(8, -3, 3, 6);

      // Leads
      ctx.strokeStyle = '#c9c9c9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(-12, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(20, 0);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 3 },
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
