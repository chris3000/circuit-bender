import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { capacitorArt } from '@/components/art/partArt';
import { capacitorBoard } from '@/components/art/boardArt';
import { standardValues } from '@/utils/partValue';

/** Convert capacitance in farads to ceramic cap code (e.g., 100nF → "104", 22nF → "223") */
export const capacitorDefinition: ComponentDefinition = {
  type: 'capacitor',
  metadata: {
    name: 'Capacitor',
    category: 'passive',
    description: 'Stores a little charge, and takes time to fill and to empty. It sets the timing of oscillators and filters, and lets a changing signal through while stopping a steady voltage',
  },
  pins: [
    {
      id: generatePinId('capacitor', 0),
      label: '1',
      type: 'bidirectional',
      position: { x: -20, y: 0 },
    },
    {
      id: generatePinId('capacitor', 1),
      label: '2',
      type: 'bidirectional',
      position: { x: 20, y: 0 },
    },
  ],
  defaultParameters: {
    capacitance: 0.0000001, // 100nF in farads
    value: '100nF',
  },
  value: { parameter: 'capacitance', kind: 'capacitance', label: 'Capacitance', example: '100n' },
  shelf: {
    keywords: ['cap', 'farad', 'ceramic', 'film', 'electrolytic'],
    art: capacitorArt,
    // The E6 series from 10 pF to 1000 µF
    stock: [...standardValues(10e-12, 680e-6, 'E6'), 1000e-6],
    common: [100e-12, 1e-9, 4.7e-9, 10e-9, 22e-9, 47e-9, 100e-9, 220e-9, 1e-6, 4.7e-6, 10e-6, 100e-6],
  },
  schematic: {
    symbol: {
      width: 50,
      height: 30,
      render: (params) => {
        return (
          <g>
            {/* Left lead from pin to plate */}
            <line x1="-20" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Left plate */}
            <line x1="-10" y1="-12" x2="-10" y2="12" stroke="currentColor" strokeWidth="2" />
            {/* Right plate */}
            <line x1="10" y1="-12" x2="10" y2="12" stroke="currentColor" strokeWidth="2" />
            {/* Right lead from plate to pin */}
            <line x1="10" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="2" />
            {/* Value label */}
            <text
              x="0"
              y="-18"
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
            >
              {params.value || '100nF'}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 30 },
    overhang: { top: 14 },
  },
  board: {
    symbol: {
      width: 50,
      height: 30,
      render: capacitorBoard,
    },
    dimensions: { width: 50, height: 30 },
    overhang: { bottom: 8 },
  },
};
