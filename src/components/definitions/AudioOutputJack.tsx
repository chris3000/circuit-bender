import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const audioOutputJackDefinition: ComponentDefinition = {
  type: 'audio-output',
  metadata: {
    name: 'Audio Output Jack',
    category: 'power',
    description: '3.5mm audio output jack - connects to AudioBridge',
  },
  pins: [
    {
      id: generatePinId('audio-output', 0),
      label: 'IN',
      type: 'input',
      position: { x: 0, y: -20 },
    },
  ],
  defaultParameters: {},
  schematic: {
    symbol: {
      width: 40,
      height: 40,
      render: () => {
        return (
          <g>
            {/* Lead to pin */}
            <line x1="0" y1="-20" x2="0" y2="-10" stroke="currentColor" strokeWidth="2" />
            {/* Speaker/jack icon */}
            <rect x="-8" y="-10" width="16" height="12" fill="none" stroke="currentColor" strokeWidth="2" />
            <polygon points="-8,-10 -16,-16 -16,8 -8,2" fill="none" stroke="currentColor" strokeWidth="2" />
            {/* Sound waves */}
            <path d="M 10,-8 Q 14,-4 10,0" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M 12,-10 Q 18,-4 12,2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            {/* Label */}
            <text x="0" y="16" textAnchor="middle" fontSize="8" fill="currentColor">AUDIO OUT</text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 40 },
  },
  board: {
    symbol: {
      width: 40,
      height: 40,
      render: () => {
        return (
          <g>
            <rect x="-12" y="-8" width="24" height="16" rx="3" fill="#444" stroke="#666" strokeWidth="0.8" />
            <circle cx="8" cy="0" r="4" fill="#222" stroke="#666" strokeWidth="0.5" />
            <circle cx="8" cy="0" r="2" fill="#888" />
            <text x="0" y="18" textAnchor="middle" fontSize="7" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">OUT</text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 40 },
  },
  simulate: (inputs, _params) => {
    // Pass-through: AudioBridge reads voltage externally
    const pin0 = inputs.pin_0 || { voltage: 0, current: 0 };

    return {
      pin_0: { voltage: pin0.voltage, current: pin0.current },
    };
  },
};
