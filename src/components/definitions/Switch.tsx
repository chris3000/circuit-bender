import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { switchArt } from '@/components/art/partArt';
import { switchBoard } from '@/components/art/boardArt';

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
  shelf: { caption: 'On / off', keywords: ['spst', 'toggle'], art: switchArt },
  cover: { control: 'toggle', parameter: 'closed', name: 'SWITCH' },
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
    overhang: { bottom: 8 },
  },
  board: {
    symbol: {
      width: 50, height: 40,
      render: switchBoard,
    },
    dimensions: { width: 50, height: 40 },
    overhang: { bottom: 8 },
  },
  simulate: (inputs) => ({
    pin_0: inputs.pin_0 || { voltage: 0, current: 0 },
    pin_1: inputs.pin_1 || { voltage: 0, current: 0 },
  }),
};
