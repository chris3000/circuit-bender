import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const switchDefinition: ComponentDefinition = {
  type: 'switch',
  metadata: {
    name: 'Switch',
    category: 'control',
    description: 'SPST toggle switch — click to open/close',
  },
  pins: [
    { id: generatePinId('switch', 0), label: '1', type: 'bidirectional', position: { x: -25, y: 0 } },
    { id: generatePinId('switch', 1), label: '2', type: 'bidirectional', position: { x: 25, y: 0 } },
  ],
  defaultParameters: { closed: 0, value: 'SPST' },
  schematic: {
    symbol: {
      width: 50, height: 30,
      render: (params) => {
        const closed = (params.closed as number) >= 1;
        return (
          <g>
            <line x1="-25" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
            <circle cx="-10" cy="0" r="3" fill="currentColor" />
            <line x1="10" y1="0" x2="25" y2="0" stroke="currentColor" strokeWidth="2" />
            <circle cx="10" cy="0" r="3" fill="currentColor" />
            <line x1="-10" y1="0" x2={closed ? '10' : '5'} y2={closed ? '0' : '-12'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <text x="0" y="18" textAnchor="middle" fontSize="9" fill="currentColor">{closed ? 'ON' : 'OFF'}</text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 30 },
  },
  board: {
    symbol: {
      width: 50, height: 40,
      render: (params) => {
        const closed = (params.closed as number) >= 1;
        return (
          <g>
            <rect x="-18" y="-12" width="36" height="24" rx="4" fill="#333" stroke="#555" strokeWidth="1" />
            <rect x={closed ? '2' : '-14'} y="-8" width="12" height="16" rx="2" fill={closed ? '#4a9' : '#666'} stroke="#444" strokeWidth="0.5" />
            <rect x="-25" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
            <rect x="17" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
            <text x="0" y="24" textAnchor="middle" fontSize="8" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">{closed ? 'ON' : 'OFF'}</text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 40 },
  },
  simulate: (inputs) => ({
    pin_0: inputs.pin_0 || { voltage: 0, current: 0 },
    pin_1: inputs.pin_1 || { voltage: 0, current: 0 },
  }),
};
