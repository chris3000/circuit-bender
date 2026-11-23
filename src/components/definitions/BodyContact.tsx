import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { touchPadsArt } from '@/components/art/partArt';
import { touchPadsBoard } from '@/components/art/boardArt';

/**
 * Two bare contacts to put a finger across. Skin is a resistor of a megohm
 * or so that falls as it is pressed harder: the oldest control in circuit
 * bending. `touch` is how hard, from 0 (not touching) to 1.
 */
export const bodyContactDefinition: ComponentDefinition = {
  type: 'body-contact',
  metadata: {
    name: 'Body Contacts',
    category: 'control',
    description: 'Two contacts bridged by a finger: nothing until touched, then 2 MΩ down to 50 kΩ the harder it is pressed',
  },
  pins: [
    { id: generatePinId('body-contact', 0), label: '1', type: 'bidirectional', position: { x: -25, y: 0 } },
    { id: generatePinId('body-contact', 1), label: '2', type: 'bidirectional', position: { x: 25, y: 0 } },
  ],
  defaultParameters: { touch: 0 },
  shelf: { title: 'Body contacts', caption: 'Touch to play', keywords: ['touch', 'finger', 'skin', 'body', 'contact', 'pad', 'plate', 'bend'], art: touchPadsArt },
  control: { kind: 'hold', parameter: 'touch', name: 'Touch', held: 0.6 },
  cover: { control: 'pad', parameter: 'touch', name: 'TOUCH' },
  schematic: {
    symbol: {
      width: 50, height: 30,
      render: (params) => {
        const touch = Math.max(0, Math.min(1, Number(params.touch) || 0));
        return (
          <g>
            <line x1="-25" y1="0" x2="-7" y2="0" stroke="currentColor" strokeWidth="2" />
            <line x1="7" y1="0" x2="25" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* The two plates, and the finger across them */}
            <line x1="-7" y1="-10" x2="-7" y2="10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="7" y1="-10" x2="7" y2="10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            {touch > 0 && <ellipse cx="0" cy="0" rx="11" ry="7" fill="#FF2D55" opacity={0.25 + 0.5 * touch} />}
            <text x="0" y="22" textAnchor="middle" fontSize="8" fill="currentColor">{touch > 0 ? `${Math.round(touch * 100)}%` : 'TOUCH'}</text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 30 },
    overhang: { bottom: 10 },
  },
  board: {
    symbol: { width: 50, height: 40, render: touchPadsBoard },
    dimensions: { width: 50, height: 40 },
    overhang: { bottom: 8 },
  },
};
