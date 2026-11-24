import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { transistorArt } from '@/components/art/partArt';
import { transistorBoard } from '@/components/art/boardArt';

export const jfet2N5457Definition: ComponentDefinition = {
  type: '2n5457',
  metadata: {
    name: '2N5457 JFET',
    category: 'active',
    description: 'N-channel field-effect transistor: a resistor between drain and source that the gate voltage sets. Fully on with the gate at the source, off about 1.4 V below it',
  },
  pins: [
    { id: generatePinId('2n5457', 0), label: 'G', type: 'input', position: { x: -25, y: 0 } },
    { id: generatePinId('2n5457', 1), label: 'D', type: 'bidirectional', position: { x: 0, y: -25 } },
    { id: generatePinId('2n5457', 2), label: 'S', type: 'bidirectional', position: { x: 0, y: 25 } },
  ],
  defaultParameters: {},
  through: [1, 2], // drain to source, the channel
  shelf: {
    title: '2N5457', caption: 'JFET', art: transistorArt(['2N', '5457']), alike: ['transistor'],
    keywords: ['jfet', 'fet', 'field effect', 'n-channel', '5457', 'mpf102', 'j201', 'vcr', 'vca', 'transistor'],
  },
  schematic: {
    symbol: {
      width: 50, height: 50,
      render: () => (
        <g>
          {/* The channel, with the drain and source coming off its ends */}
          <line x1="-5" y1="-15" x2="-5" y2="15" stroke="currentColor" strokeWidth="3" />
          <path d="M -5,-10 H 0 V -25 M -5,10 H 0 V 25" fill="none" stroke="currentColor" strokeWidth="2" />
          {/* The gate, its arrow pointing in: N-channel */}
          <line x1="-25" y1="0" x2="-5" y2="0" stroke="currentColor" strokeWidth="2" />
          <polygon points="-6.5,0 -13,-3.5 -13,3.5" fill="currentColor" />
          <text x="8" y="0" fontSize="9" fill="currentColor">2N5457</text>
        </g>
      ),
    },
    dimensions: { width: 50, height: 50 },
    overhang: { right: 18 },
  },
  board: {
    symbol: { width: 50, height: 50, render: transistorBoard(['2N', '5457']) },
    dimensions: { width: 50, height: 50 },
  },
};
