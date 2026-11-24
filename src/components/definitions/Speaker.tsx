import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { speakerArt } from '@/components/art/partArt';
import { speakerBoard } from '@/components/art/boardArt';

/**
 * A bare 8 Ω loudspeaker: what is heard is the voltage across it. It is a
 * heavy load, so it wants an amplifier (the LM386) and a capacitor in series.
 * The Audio Out part is the easy way to listen; this is the real thing.
 */
export const speakerDefinition: ComponentDefinition = {
  type: 'speaker',
  metadata: {
    name: 'Speaker',
    category: 'power',
    description: '8 Ω loudspeaker. Needs an amplifier to drive it: a logic gate can barely move it',
  },
  pins: [
    { id: generatePinId('speaker', 0), label: '+', type: 'bidirectional', position: { x: -30, y: -10 } },
    { id: generatePinId('speaker', 1), label: '−', type: 'bidirectional', position: { x: -30, y: 10 } },
  ],
  defaultParameters: { impedance: 8 },
  shelf: { caption: '8 Ω', keywords: ['loudspeaker', 'sound', 'cone', 'driver', '8 ohm', 'output'], art: speakerArt, alike: ['sound out'] },
  cover: { control: 'speaker', name: 'SPEAKER' },
  schematic: {
    symbol: {
      width: 60, height: 60,
      render: () => (
        <g>
          <line x1="-30" y1="-10" x2="-12" y2="-10" stroke="currentColor" strokeWidth="2" />
          <line x1="-30" y1="10" x2="-12" y2="10" stroke="currentColor" strokeWidth="2" />
          <rect x="-12" y="-14" width="10" height="28" fill="none" stroke="currentColor" strokeWidth="2" />
          <polygon points="-2,-14 16,-28 16,28 -2,14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <text x="-24" y="-15" textAnchor="middle" fontSize="9" fill="currentColor">+</text>
        </g>
      ),
    },
    dimensions: { width: 60, height: 60 },
  },
  board: {
    symbol: { width: 60, height: 60, render: speakerBoard },
    dimensions: { width: 60, height: 60 },
  },
};
