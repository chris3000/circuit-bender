import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews, type ChipPin } from '@/components/art/chipSymbol';

// In the order the simulation model has them: IN−, IN+, OUT of each amplifier, then V+, V−.
// Each output is level with its amplifier's first input.
const amplifier = (n: number, top: number): ChipPin[] => [
  { label: `${n}-`, type: 'input', x: -30, y: top },
  { label: `${n}+`, type: 'input', x: -30, y: top + 20 },
  { label: `${n}OUT`, type: 'output', x: 30, y: top },
];
const pins = chipPins('lm324', [
  ...[1, 2, 3, 4].flatMap((n) => amplifier(n, -70 + (n - 1) * 40)),
  { label: 'V+', type: 'power', x: -10, y: -90 },
  { label: 'V-', type: 'power', x: 10, y: -90 },
]);

export const lm324Definition: ComponentDefinition = {
  type: 'lm324',
  metadata: {
    name: 'LM324',
    category: 'ic',
    description: 'Four op-amps that run from one supply: their outputs go nearly down to the negative rail. The chip the Noise Toaster is built from',
  },
  pins,
  defaultParameters: {},
  floatingPins: true,
  through: [1, 2], // the first amplifier's + input to its output
  shelf: {
    caption: 'Op-amp ×4', art: chipArt(14, 'LM324'), alike: ['amplifier'],
    keywords: ['324', 'opamp', 'op-amp', 'quad', 'amplifier', 'comparator', 'single supply', 'noise toaster', 'chip', 'ic'],
  },
  ...chipViews({ width: 80, height: 200, name: 'LM324', lines: ['QUAD', 'OP-AMP'], pins }),
};
