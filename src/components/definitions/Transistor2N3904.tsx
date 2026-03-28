import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const transistor2N3904Definition: ComponentDefinition = {
  type: '2n3904',
  metadata: {
    name: '2N3904 NPN Transistor',
    category: 'active',
    description: 'General-purpose NPN bipolar junction transistor',
  },
  pins: [
    {
      id: generatePinId('2n3904', 0),
      label: 'B',
      type: 'input',
      position: { x: -25, y: 0 },
    },
    {
      id: generatePinId('2n3904', 1),
      label: 'C',
      type: 'bidirectional',
      position: { x: 0, y: -25 },
    },
    {
      id: generatePinId('2n3904', 2),
      label: 'E',
      type: 'bidirectional',
      position: { x: 0, y: 25 },
    },
  ],
  defaultParameters: {
    beta: 100,
    vbeThreshold: 0.7,
  },
  schematic: {
    symbol: {
      width: 50,
      height: 50,
      render: () => {
        return (
          <g>
            {/* Base lead */}
            <line x1="-25" y1="0" x2="-5" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Vertical bar (base region) */}
            <line x1="-5" y1="-15" x2="-5" y2="15" stroke="currentColor" strokeWidth="3" />
            {/* Collector line */}
            <line x1="-5" y1="-8" x2="0" y2="-25" stroke="currentColor" strokeWidth="2" />
            {/* Emitter line with arrow */}
            <line x1="-5" y1="8" x2="0" y2="25" stroke="currentColor" strokeWidth="2" />
            {/* Arrow on emitter */}
            <polygon points="-2,18 0,25 -6,22" fill="currentColor" />
            {/* Label */}
            <text x="8" y="0" fontSize="9" fill="currentColor">2N3904</text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 50 },
  },
  breadboard: {
    renderer: (ctx, _params) => {
      // TO-92 black package
      ctx.beginPath();
      ctx.arc(0, 0, 8, Math.PI, 0);
      ctx.lineTo(8, 8);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fillStyle = '#1a1a1a';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Flat side indicator
      ctx.beginPath();
      ctx.moveTo(-8, 8);
      ctx.lineTo(8, 8);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Three leads
      ctx.strokeStyle = '#c9c9c9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-5, 8);
      ctx.lineTo(-5, 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5, 8);
      ctx.lineTo(5, 16);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 3 },
  },
  simulate: (inputs, params) => {
    // Switch model for MVP — beta parameter reserved for future active-region modeling
    const base = inputs.pin_0 || { voltage: 0, current: 0 };
    const collector = inputs.pin_1 || { voltage: 0, current: 0 };
    const emitter = inputs.pin_2 || { voltage: 0, current: 0 };

    const vbe = base.voltage - emitter.voltage;
    const vbeThreshold = (params.vbeThreshold as number) ?? 0.7;

    // Switch model: if Vbe > threshold, transistor is in saturation
    const collectorVoltage = vbe > vbeThreshold
      ? emitter.voltage + 0.2
      : collector.voltage;

    return {
      pin_0: { voltage: base.voltage, current: base.current },
      pin_1: { voltage: collectorVoltage, current: collector.current },
      pin_2: { voltage: emitter.voltage, current: emitter.current },
    };
  },
};
