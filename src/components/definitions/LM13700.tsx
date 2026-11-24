import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews, type ChipPin } from '@/components/art/chipSymbol';

// In the order the simulation model has them: IN+, IN−, D, IABC, OUT, BUF IN, BUF OUT of each half, then V+, V−.
const half = (n: number, top: number): ChipPin[] => [
  { label: `${n}+`, type: 'input', x: -40, y: top },
  { label: `${n}-`, type: 'input', x: -40, y: top + 20 },
  { label: `${n}D`, type: 'input', x: -40, y: top + 40 },
  { label: `${n}IABC`, type: 'input', x: -40, y: top + 60 },
  { label: `${n}OUT`, type: 'output', x: 40, y: top },
  { label: `${n}BIN`, type: 'input', x: 40, y: top + 20 },
  { label: `${n}BOUT`, type: 'output', x: 40, y: top + 40 },
];
const pins = chipPins('lm13700', [
  ...half(1, -70),
  ...half(2, 10),
  { label: 'V+', type: 'power', x: -10, y: -90 },
  { label: 'V-', type: 'power', x: 10, y: -90 },
]);

export const lm13700Definition: ComponentDefinition = {
  type: 'lm13700',
  metadata: {
    name: 'LM13700',
    category: 'ic',
    description: 'Two amplifiers whose gain is set by a current: what turns a control voltage into a louder sound or a brighter filter. Each has a buffer',
  },
  pins,
  defaultParameters: {},
  floatingPins: true,
  through: [0, 4], // the first half's + input to its output
  shelf: {
    caption: 'OTA ×2', art: chipArt(16, 'LM13700'), alike: ['amplifier'],
    keywords: ['13700', '13600', 'ota', 'transconductance', 'vca', 'vcf', 'filter', 'cv', 'synthesizer', 'amplifier', 'chip', 'ic'],
  },
  ...chipViews({ width: 100, height: 200, name: 'LM13700', lines: ['DUAL OTA'], pins }),
};
