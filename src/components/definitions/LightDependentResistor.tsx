import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { ldrArt } from '@/components/art/partArt';
import { ldrBoard } from '@/components/art/boardArt';

/** Room at the top right of the symbol for the small knob that sets the light. */
const KNOB_ROOM = { top: 14 };

export const ldrDefinition: ComponentDefinition = {
  type: 'ldr',
  metadata: {
    name: 'Light-Dependent Resistor',
    category: 'passive',
    description: 'Photocell: about 1 MΩ in the dark, 1 kΩ in bright light. Wave a hand over it',
  },
  pins: [
    { id: generatePinId('ldr', 0), label: '1', type: 'bidirectional', position: { x: -30, y: 0 } },
    { id: generatePinId('ldr', 1), label: '2', type: 'bidirectional', position: { x: 30, y: 0 } },
  ],
  defaultParameters: { light: 0.5 },
  shelf: { title: 'LDR', caption: 'Light sensor', keywords: ['ldr', 'photocell', 'photoresistor', 'light', 'cds', 'sensor', 'theremin', 'optical'], art: ldrArt },
  control: { kind: 'dial', parameter: 'light', name: 'Light', at: { x: 20, y: -19 }, rest: 0.5 },
  cover: { control: 'knob', parameter: 'light', name: 'LIGHT' },
  schematic: {
    symbol: {
      width: 60, height: 30,
      render: () => (
        <g>
          <line x1="-30" y1="0" x2="-15" y2="0" stroke="currentColor" strokeWidth="2" />
          <path d="M -15 0 L -10 -5 L -5 5 L 0 -5 L 5 5 L 10 -5 L 15 0" stroke="currentColor" strokeWidth="2" fill="none" />
          <line x1="15" y1="0" x2="30" y2="0" stroke="currentColor" strokeWidth="2" />
          <circle cx="0" cy="0" r="13.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          {/* Light falling on it */}
          {[-16, -9].map((x) => (
            <g key={x}>
              <line x1={x - 7} y1="-22" x2={x} y2="-15" stroke="currentColor" strokeWidth="1.3" />
              <polygon points={`${x},-15 ${x - 4.2},-16.2 ${x - 1.2},-19.2`} fill="currentColor" />
            </g>
          ))}
        </g>
      ),
    },
    dimensions: { width: 60, height: 30 },
    overhang: KNOB_ROOM,
  },
  board: {
    symbol: { width: 60, height: 30, render: ldrBoard },
    dimensions: { width: 60, height: 30 },
    overhang: { ...KNOB_ROOM, bottom: 14 },
  },
};
