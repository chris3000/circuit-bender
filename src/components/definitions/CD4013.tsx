import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews, column } from '@/components/art/chipSymbol';

// In the order the simulation model has them: D, CLK, SET, RST of each half, then Q and /Q of each, VDD, VSS.
// Each half's Q is level with its D, and its /Q under that.
const pins = chipPins('cd4013', [
  ...column(-30, -70, ['D1', 'CLK1', 'SET1', 'RST1', 'D2', 'CLK2', 'SET2', 'RST2'], 'input'),
  { label: 'Q1', type: 'output', x: 30, y: -70 },
  { label: '/Q1', type: 'output', x: 30, y: -50 },
  { label: 'Q2', type: 'output', x: 30, y: 10 },
  { label: '/Q2', type: 'output', x: 30, y: 30 },
  { label: 'VDD', type: 'power', x: -10, y: -90 },
  { label: 'VSS', type: 'ground', x: 10, y: -90 },
]);

export const cd4013Definition: ComponentDefinition = {
  type: 'cd4013',
  metadata: {
    name: 'CD4013',
    category: 'ic',
    description: 'Two flip-flops: each remembers its D input when its clock rises. Wire /Q back to D and each clock pulse turns it over: it halves a frequency, or makes one press on and the next press off',
  },
  pins,
  defaultParameters: {},
  floatingPins: true,
  through: [1, 8], // clock in, Q out
  shelf: {
    caption: 'Flip-flop ×2', art: chipArt(14, 'CD4013'), alike: ['counter'],
    keywords: ['4013', 'flip-flop', 'flipflop', 'latch', 'd-type', 'divider', 'memory', 'cmos', 'logic', 'chip', 'ic'],
  },
  ...chipViews({ width: 80, height: 200, name: 'CD4013', lines: ['DUAL D', 'FLIP-FLOP'], pins }),
};
