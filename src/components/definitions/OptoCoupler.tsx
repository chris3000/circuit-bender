import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { optoArt } from '@/components/art/partArt';
import { optoBoard } from '@/components/art/boardArt';

/**
 * An LED and a photocell facing each other in the dark. Collins tapes a
 * photocell to an LED; sealed in a tube and sold, it is called a Vactrol.
 */
export const optoCouplerDefinition: ComponentDefinition = {
  type: 'optocoupler',
  metadata: {
    name: 'Opto-Coupler',
    category: 'active',
    description: 'An LED shining on a photocell: the current through one side sets the resistance of the other, with no wire between them',
  },
  overload: 'Too much current through its LED: a real one would burn out. It wants a resistor in series.',
  pins: [
    { id: generatePinId('optocoupler', 0), label: 'A', type: 'bidirectional', position: { x: -30, y: -10 } },
    { id: generatePinId('optocoupler', 1), label: 'K', type: 'bidirectional', position: { x: -30, y: 10 } },
    { id: generatePinId('optocoupler', 2), label: '1', type: 'bidirectional', position: { x: 30, y: -10 } },
    { id: generatePinId('optocoupler', 3), label: '2', type: 'bidirectional', position: { x: 30, y: 10 } },
  ],
  defaultParameters: {},
  through: [2, 3], // through the photocell, like the resistor it is
  shelf: {
    title: 'Opto-coupler', caption: 'LED + photocell', art: optoArt, alike: ['resistance'],
    keywords: ['vactrol', 'optocoupler', 'opto', 'optoisolator', 'led', 'ldr', 'photocell', 'tremolo', 'gate', 'chopper', 'panner', 'vtl5c3'],
  },
  schematic: {
    symbol: {
      width: 60, height: 40,
      render: () => (
        <g>
          <rect x="-22" y="-17" width="44" height="34" rx="3" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
          {/* The LED, anode up */}
          <path d="M -30,-10 H -12 V -5 M -12,3 V 10 H -30" fill="none" stroke="currentColor" strokeWidth="2" />
          <polygon points="-17,-5 -7,-5 -12,3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <line x1="-17" y1="3" x2="-7" y2="3" stroke="currentColor" strokeWidth="2" />
          {/* Its light, falling on the cell */}
          {[-4, 2].map((y) => (
            <g key={y}>
              <line x1="-4" y1={y} x2="3" y2={y} stroke="currentColor" strokeWidth="1.2" />
              <polygon points={`5,${y} 1.5,${y - 2} 1.5,${y + 2}`} fill="currentColor" />
            </g>
          ))}
          {/* The photocell */}
          <path d="M 30,-10 H 13 V -8 L 17,-6 L 9,-3 L 17,0 L 9,3 L 17,6 L 13,8 V 10 H 30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </g>
      ),
    },
    dimensions: { width: 60, height: 40 },
  },
  board: {
    symbol: { width: 60, height: 40, render: optoBoard },
    dimensions: { width: 60, height: 40 },
    overhang: { bottom: 10 },
  },
};
