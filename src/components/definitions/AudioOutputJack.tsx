import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { jackArt } from '@/components/art/partArt';
import { jackBoard } from '@/components/art/boardArt';
import { audioDestination } from '@/utils/audioOut';

export const audioOutputJackDefinition: ComponentDefinition = {
  type: 'audio-output',
  metadata: {
    name: 'Audio Out',
    category: 'power',
    description: 'Listens to the circuit without loading it and plays it through the speaker',
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
  shelf: { title: 'Audio out', caption: 'Hear it here', keywords: ['jack', 'speaker', 'sound', 'line', 'socket', 'output', 'listen'], art: jackArt },
  // A socket with a speaker behind it: the speaker plays unless the signal is sent on somewhere else
  cover: [
    { control: 'speaker', name: 'OUT', when: (p) => audioDestination(p) === 'speaker' },
    { control: 'jack', name: 'OUT', when: (p) => audioDestination(p) === 'line' },
  ],
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
      render: jackBoard,
    },
    dimensions: { width: 40, height: 40 },
  },
};
