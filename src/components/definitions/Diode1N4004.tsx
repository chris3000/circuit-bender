import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { rectifierArt } from '@/components/art/partArt';
import { rectifierBoard } from '@/components/art/boardArt';

export const diode1N4004Definition: ComponentDefinition = {
  type: '1n4004',
  metadata: {
    name: '1N4004 Rectifier Diode',
    category: 'active',
    description: 'A diode for power: it stands an amp. Put across a supply the wrong way round, it guards against a battery connected backwards',
  },
  overload: 'More than an amp: a real one would overheat.',
  pins: [
    { id: generatePinId('1n4004', 0), label: 'A', type: 'bidirectional', position: { x: -20, y: 0 } },
    { id: generatePinId('1n4004', 1), label: 'K', type: 'bidirectional', position: { x: 20, y: 0 } },
  ],
  defaultParameters: {},
  shelf: { title: '1N4004', caption: 'Power diode', keywords: ['4004', '1n4001', '1n4007', 'rectifier', 'power', 'protection', 'diode'], art: rectifierArt, alike: ['diode'] },
  schematic: {
    symbol: {
      width: 40, height: 20,
      render: () => (
        <g>
          <line x1="-20" y1="0" x2="-8" y2="0" stroke="currentColor" strokeWidth="2" />
          <polygon points="-8,-8 -8,8 8,0" fill="currentColor" stroke="currentColor" strokeWidth="2" />
          <line x1="8" y1="-8" x2="8" y2="8" stroke="currentColor" strokeWidth="2" />
          <line x1="8" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="2" />
          <text x="0" y="-14" textAnchor="middle" fontSize="9" fill="currentColor">1N4004</text>
        </g>
      ),
    },
    dimensions: { width: 40, height: 20 },
    overhang: { top: 14 },
  },
  board: {
    symbol: { width: 40, height: 20, render: rectifierBoard },
    dimensions: { width: 40, height: 20 },
    overhang: { bottom: 10 },
  },
};
