import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { piezoArt } from '@/components/art/partArt';
import { piezoBoard } from '@/components/art/boardArt';

/**
 * A piezo disc works both ways: drive it and it is a small bright speaker,
 * knock it and it is a contact microphone.
 */
export const piezoDefinition: ComponentDefinition = {
  type: 'piezo',
  metadata: {
    name: 'Piezo Disc',
    category: 'power',
    description: 'A contact microphone and a tiny speaker in one. Press it to knock on it; wire it to an output to hear it',
  },
  pins: [
    { id: generatePinId('piezo', 0), label: '+', type: 'bidirectional', position: { x: -30, y: -10 } },
    { id: generatePinId('piezo', 1), label: '−', type: 'bidirectional', position: { x: -30, y: 10 } },
  ],
  defaultParameters: { tap: 0 },
  shelf: {
    title: 'Piezo disc', caption: 'Contact mic', art: piezoArt, alike: ['sound out'],
    keywords: ['piezo', 'contact', 'microphone', 'mic', 'mike', 'disc', 'disk', 'buzzer', 'sounder', 'speaker', 'trigger', 'drum', 'knock', 'tap'],
  },
  control: { kind: 'hold', parameter: 'tap', name: 'Tap' },
  cover: { control: 'button', parameter: 'tap', name: 'TAP' },
  schematic: {
    symbol: {
      width: 60, height: 60,
      render: (params) => {
        const tapped = Number(params.tap) >= 1;
        return (
          <g>
            <path d="M -30,-10 H -12 V -7 M -12,7 V 10 H -30" fill="none" stroke="currentColor" strokeWidth="2" />
            {/* The crystal between its two plates */}
            <line x1="-21" y1="-7" x2="-3" y2="-7" stroke="currentColor" strokeWidth="2" />
            <rect x="-19" y="-3.5" width="14" height="7" fill={tapped ? '#FF2D55' : 'none'} stroke="currentColor" strokeWidth="1.5" />
            <line x1="-21" y1="7" x2="-3" y2="7" stroke="currentColor" strokeWidth="2" />
            {/* The disc it is */}
            <circle cx="12" cy="0" r="13" fill="none" stroke={tapped ? '#FF2D55' : 'currentColor'} strokeWidth="2" />
            <circle cx="12" cy="0" r="8" fill="none" stroke="currentColor" strokeWidth="1" />
            <text x="-24" y="-15" textAnchor="middle" fontSize="9" fill="currentColor">+</text>
            <text x="12" y="24" textAnchor="middle" fontSize="8" fill="currentColor">PIEZO</text>
          </g>
        );
      },
    },
    dimensions: { width: 60, height: 60 },
  },
  board: {
    symbol: { width: 60, height: 60, render: piezoBoard },
    dimensions: { width: 60, height: 60 },
  },
};
