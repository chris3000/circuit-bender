import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { chipArt } from '@/components/art/partArt';
import { chipBoard } from '@/components/art/boardArt';

/**
 * The little power amplifier that drives a speaker. Drawn like the op-amp,
 * with the same five legs in the same places; its gain pins are not drawn,
 * and what a capacitor across them would do is the `gain` parameter (20 to 200).
 */
export const lm386Definition: ComponentDefinition = {
  type: 'lm386',
  metadata: {
    name: 'LM386',
    category: 'ic',
    description: 'Audio power amplifier: makes a signal strong enough to drive a speaker',
  },
  pins: [
    { id: generatePinId('lm386', 0), label: '-', type: 'input', position: { x: -25, y: -11 } },
    { id: generatePinId('lm386', 1), label: '+', type: 'input', position: { x: -25, y: 9 } },
    { id: generatePinId('lm386', 2), label: 'GND', type: 'ground', position: { x: -25, y: 29 } },
    { id: generatePinId('lm386', 3), label: 'OUT', type: 'output', position: { x: 25, y: 9 } },
    { id: generatePinId('lm386', 4), label: 'VS', type: 'power', position: { x: 25, y: -11 } },
  ],
  defaultParameters: { gain: 20 },
  shelf: { caption: 'Speaker amp', keywords: ['386', 'amplifier', 'amp', 'power amp', 'speaker', 'audio', 'chip', 'ic'], art: chipArt(8, 'LM386') },
  schematic: {
    symbol: {
      width: 70,
      height: 90,
      render: (params) => (
        <g>
          <path d="M -30,-40 L -30,40 L 30,0 Z" stroke="currentColor" strokeWidth="2" fill="none" />
          <text x="-20" y="15" fontSize="16" fill="currentColor" textAnchor="middle" dominantBaseline="central">+</text>
          <text x="-20" y="-5" fontSize="16" fill="currentColor" textAnchor="middle" dominantBaseline="central">{'\u2212'}</text>
          <text x="-6" y="3" fontSize="7" fill="currentColor" textAnchor="middle">{`×${Math.round(Number(params.gain) || 20)}`}</text>
          <text x="0" y="-50" fontSize="10" fill="currentColor" textAnchor="middle">LM386</text>
        </g>
      ),
    },
    dimensions: { width: 70, height: 90 },
    overhang: { top: 14 },
  },
  board: {
    symbol: {
      width: 70,
      height: 90,
      render: chipBoard({
        left: -19, top: -38, width: 38, height: 76,
        marking: 'LM386',
        lines: ['AUDIO AMP'],
        // IN−, IN+ and GND on the left, VS and OUT on the right; the gain and bypass legs are not connected
        legs: [
          { x: -25, y: -31, side: 'left', unused: true }, { x: -25, y: -11, side: 'left' }, { x: -25, y: 9, side: 'left' }, { x: -25, y: 29, side: 'left' },
          { x: 25, y: -31, side: 'right', unused: true }, { x: 25, y: -11, side: 'right' }, { x: 25, y: 9, side: 'right' }, { x: 25, y: 29, side: 'right', unused: true },
        ],
      }),
    },
    dimensions: { width: 70, height: 90 },
  },
};
