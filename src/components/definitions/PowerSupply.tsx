import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { batteryArt } from '@/components/art/partArt';
import { batteryBoard } from '@/components/art/boardArt';

/** Room to the right of the symbol for the small starve knob and its label. */
const STARVE_KNOB_ROOM = { right: 20 };

export const powerSupplyDefinition: ComponentDefinition = {
  type: 'power',
  metadata: {
    name: 'Power Supply',
    category: 'power',
    description: 'DC voltage source (default +9V), with a starve knob that chokes it',
  },
  pins: [
    {
      id: generatePinId('power', 0),
      label: '+',
      type: 'power',
      position: { x: 0, y: -30 },
    },
    {
      id: generatePinId('power', 1),
      label: '−',
      type: 'ground',
      position: { x: 0, y: 30 },
    },
  ],
  defaultParameters: {
    voltage: 9,
    value: '+9V',
    starve: 0,
  },
  shelf: { title: 'Power', caption: '+9 V supply', keywords: ['battery', 'vcc', 'vdd', '9v', 'dc', 'source', 'starve', 'sag'], art: batteryArt },
  // The pilot light: on while the circuit is running
  control: { kind: 'dial', parameter: 'starve', name: 'Starve', at: { x: 28, y: -4 }, print: 'STARVE', rest: 0 },
  cover: [
    { control: 'pilot', name: 'POWER', detail: (p) => `${p.voltage}V DC` },
    // Voltage starve: a resistance in series with the supply, from none to 1 MΩ
    { control: 'knob', parameter: 'starve', name: 'STARVE', fixedName: true },
  ],
  schematic: {
    symbol: {
      width: 40,
      height: 60,
      render: (params) => {
        return (
          <g>
            {/* Lead from + pin to symbol */}
            <line x1="0" y1="-30" x2="0" y2="-8" stroke="currentColor" strokeWidth="2" />
            {/* + label */}
            <text x="12" y="-18" fontSize="10" fill="currentColor">+</text>
            {/* Long plate (positive) */}
            <line x1="-12" y1="-8" x2="12" y2="-8" stroke="currentColor" strokeWidth="2.5" />
            {/* Short plate (negative) */}
            <line x1="-7" y1="0" x2="7" y2="0" stroke="currentColor" strokeWidth="2.5" />
            {/* Long plate */}
            <line x1="-12" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="2.5" />
            {/* Short plate */}
            <line x1="-7" y1="16" x2="7" y2="16" stroke="currentColor" strokeWidth="2.5" />
            {/* − label */}
            <text x="12" y="20" fontSize="10" fill="currentColor">−</text>
            {/* Lead from symbol to − pin */}
            <line x1="0" y1="16" x2="0" y2="30" stroke="currentColor" strokeWidth="2" />
            {/* Voltage label */}
            <text x="-22" y="4" textAnchor="middle" fontSize="10" fill="currentColor">
              {params.value}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 40, height: 60 },
    overhang: { left: 16, ...STARVE_KNOB_ROOM },
  },
  board: {
    symbol: {
      width: 40,
      height: 60,
      render: batteryBoard,
    },
    dimensions: { width: 40, height: 60 },
    overhang: STARVE_KNOB_ROOM,
  },
};
