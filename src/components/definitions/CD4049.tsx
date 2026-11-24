import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews, column } from '@/components/art/chipSymbol';

// In the order the simulation model has them: 1A–6A, 1Y–6Y, VDD, VSS (the CD40106's order).
const pins = chipPins('cd4049', [
  ...column(-30, -50, ['1A', '2A', '3A', '4A', '5A', '6A'], 'input'),
  ...column(30, -50, ['1Y', '2Y', '3Y', '4Y', '5Y', '6Y'], 'output'),
  { label: 'VDD', type: 'power', x: -10, y: -70 },
  { label: 'VSS', type: 'ground', x: 10, y: -70 },
]);

export const cd4049Definition: ComponentDefinition = {
  type: 'cd4049',
  metadata: {
    name: 'CD4049',
    category: 'ic',
    description: 'Six plain inverters. With a resistor from output to input each one is an amplifier, and clips softly: a preamp, a distortion',
  },
  pins,
  defaultParameters: {},
  floatingPins: true,
  through: [0, 6], // in by the first inverter, out of it
  shelf: {
    caption: 'Inverter ×6', art: chipArt(16, 'CD4049'), alike: ['gates'],
    keywords: ['4049', '4069', 'inverter', 'hex', 'unbuffered', 'amplifier', 'preamp', 'distortion', 'fuzz', 'overdrive', 'cmos', 'logic', 'chip', 'ic'],
  },
  ...chipViews({ width: 80, height: 160, name: 'CD4049', lines: ['HEX', 'INVERTER'], pins }),
};
