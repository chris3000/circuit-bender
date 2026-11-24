import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { pushButtonArt } from '@/components/art/partArt';
import { pushButtonBoard } from '@/components/art/boardArt';

export const pushButtonDefinition: ComponentDefinition = {
  type: 'pushbutton',
  metadata: {
    name: 'Push Button',
    category: 'control',
    description: 'Momentary button: connects only while it is held down',
  },
  pins: [
    { id: generatePinId('pushbutton', 0), label: '1', type: 'bidirectional', position: { x: -25, y: 0 } },
    { id: generatePinId('pushbutton', 1), label: '2', type: 'bidirectional', position: { x: 25, y: 0 } },
  ],
  defaultParameters: { closed: 0 },
  shelf: { title: 'Push button', caption: 'On while held', keywords: ['momentary', 'button', 'tact', 'trigger', 'key', 'press', 'switch'], art: pushButtonArt, alike: ['switch'] },
  control: { kind: 'hold', parameter: 'closed', name: 'Button' },
  cover: { control: 'button', parameter: 'closed', name: 'BUTTON' },
  schematic: {
    symbol: {
      width: 50, height: 30,
      render: (params) => {
        const held = Number(params.closed) >= 1;
        const bar = held ? -3 : -8;
        return (
          <g>
            <line x1="-25" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
            <circle cx="-10" cy="0" r="3" fill="currentColor" />
            <line x1="10" y1="0" x2="25" y2="0" stroke="currentColor" strokeWidth="2" />
            <circle cx="10" cy="0" r="3" fill="currentColor" />
            {/* The bar that bridges the contacts, and the plunger that pushes it down */}
            <line x1="-13" y1={bar} x2="13" y2={bar} stroke={held ? '#FF2D55' : 'currentColor'} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="0" y1={bar} x2="0" y2={bar - 6} stroke="currentColor" strokeWidth="2" />
            <line x1="-5" y1={bar - 6} x2="5" y2={bar - 6} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 30 },
  },
  board: {
    symbol: { width: 50, height: 40, render: pushButtonBoard },
    dimensions: { width: 50, height: 40 },
  },
};
