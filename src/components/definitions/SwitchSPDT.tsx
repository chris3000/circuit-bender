import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { changeoverArt } from '@/components/art/partArt';
import { changeoverBoard } from '@/components/art/boardArt';

/**
 * A changeover switch: one pin that goes to either of two others. It picks
 * between two signals, two capacitors, two outputs; or it sends one thing to
 * one place or another.
 */
export const switchSpdtDefinition: ComponentDefinition = {
  type: 'spdt',
  metadata: {
    name: 'Changeover Switch',
    category: 'control',
    description: 'SPDT toggle switch: joins its common pin to A or to B. Click to throw it',
  },
  pins: [
    { id: generatePinId('spdt', 0), label: 'COM', type: 'bidirectional', position: { x: -25, y: 0 } },
    { id: generatePinId('spdt', 1), label: 'A', type: 'bidirectional', position: { x: 25, y: -10 } },
    { id: generatePinId('spdt', 2), label: 'B', type: 'bidirectional', position: { x: 25, y: 10 } },
  ],
  defaultParameters: { throw: 0, value: 'SPDT' },
  through: [0, 1], // the common to the throw it starts on
  shelf: { title: 'Changeover', caption: 'This or that', keywords: ['spdt', 'toggle', 'switch', 'selector', 'select', 'changeover', 'two way', 'a/b'], art: changeoverArt, alike: ['switch'] },
  cover: { control: 'toggle', parameter: 'throw', name: 'SELECT' },
  schematic: {
    symbol: {
      width: 50, height: 40,
      render: (params) => {
        const toB = Number(params.throw) >= 1;
        return (
          <g>
            <line x1="-25" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
            <circle cx="-10" cy="0" r="3" fill="currentColor" />
            <line x1="10" y1="-10" x2="25" y2="-10" stroke="currentColor" strokeWidth="2" />
            <circle cx="10" cy="-10" r="3" fill="currentColor" />
            <line x1="10" y1="10" x2="25" y2="10" stroke="currentColor" strokeWidth="2" />
            <circle cx="10" cy="10" r="3" fill="currentColor" />
            <line x1="-10" y1="0" x2="9" y2={toB ? 9.5 : -9.5} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <text x="18" y="-14" textAnchor="middle" fontSize="7" fill="currentColor">A</text>
            <text x="18" y="22" textAnchor="middle" fontSize="7" fill="currentColor">B</text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 40 },
    overhang: { bottom: 6 },
  },
  board: {
    symbol: { width: 50, height: 40, render: changeoverBoard },
    dimensions: { width: 50, height: 40 },
    overhang: { bottom: 8 },
  },
};
