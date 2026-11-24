import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews } from '@/components/art/chipSymbol';

// In the order the simulation model has them: IN−, IN+, OUT of each amplifier, then V+, V−.
const pins = chipPins('tl072', [
  { label: '1-', type: 'input', x: -30, y: -30 },
  { label: '1+', type: 'input', x: -30, y: -10 },
  { label: '1OUT', type: 'output', x: 30, y: -30 },
  { label: '2-', type: 'input', x: -30, y: 10 },
  { label: '2+', type: 'input', x: -30, y: 30 },
  { label: '2OUT', type: 'output', x: 30, y: 10 },
  { label: 'V+', type: 'power', x: -10, y: -50 },
  { label: 'V-', type: 'power', x: 10, y: -50 },
]);

export const tl072Definition: ComponentDefinition = {
  type: 'tl072',
  metadata: {
    name: 'TL072',
    category: 'ic',
    description: 'Two fast, quiet op-amps whose inputs draw no current: the usual choice for audio. Wants a rail above and a rail below its signal',
  },
  pins,
  defaultParameters: {},
  floatingPins: true,
  through: [1, 2], // the first amplifier's + input to its output
  shelf: {
    caption: 'Op-amp ×2', art: chipArt(8, 'TL072'), alike: ['amplifier'],
    keywords: ['072', 'tl071', 'tl074', 'opamp', 'op-amp', 'dual', 'amplifier', 'mixer', 'audio', 'chip', 'ic'],
  },
  ...chipViews({ width: 80, height: 120, name: 'TL072', lines: ['DUAL', 'OP-AMP'], pins }),
};
