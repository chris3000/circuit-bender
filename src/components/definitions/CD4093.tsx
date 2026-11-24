import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews, column } from '@/components/art/chipSymbol';

// In the order the simulation model has them: 1A 1B … 4A 4B, 1Y–4Y, VDD, VSS.
// Each gate's two inputs are on the left and its output on the right, level with the first of them.
const pins = chipPins('cd4093', [
  ...column(-30, -70, ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B'], 'input'),
  ...['1Y', '2Y', '3Y', '4Y'].map((label, gate) => ({ label, type: 'output' as const, x: 30, y: -70 + gate * 40 })),
  { label: 'VDD', type: 'power', x: -10, y: -90 },
  { label: 'VSS', type: 'ground', x: 10, y: -90 },
]);

export const cd4093Definition: ComponentDefinition = {
  type: 'cd4093',
  metadata: {
    name: 'CD4093',
    category: 'ic',
    description: 'Four 2-input NAND gates with Schmitt-trigger inputs: oscillators that another signal can gate',
  },
  pins,
  defaultParameters: {},
  floatingPins: true,
  through: [0, 8], // in by the first gate, out of it
  shelf: { caption: 'NAND Schmitt ×4', keywords: ['4093', 'nand', 'schmitt', 'gate', 'gated', 'cmos', 'oscillator', 'logic', 'chip', 'ic'], art: chipArt(14, 'CD4093'), alike: ['gates'] },
  ...chipViews({ width: 80, height: 200, name: 'CD4093', lines: ['QUAD NAND', 'SCHMITT'], pins }),
};
