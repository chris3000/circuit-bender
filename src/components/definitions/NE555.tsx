import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews } from '@/components/art/chipSymbol';

// In the order the simulation model has them: TRIG, THRES, RESET, CTRL, DISCH, OUT, VCC, GND.
// The timing pins are down the left, the output and reset on the right, the supply on top.
const pins = chipPins('ne555', [
  { label: 'TRIG', type: 'input', x: -30, y: 10 },
  { label: 'THRES', type: 'input', x: -30, y: -10 },
  { label: 'RESET', type: 'input', x: 30, y: 30 },
  { label: 'CTRL', type: 'bidirectional', x: -30, y: 30 },
  { label: 'DISCH', type: 'output', x: -30, y: -30 },
  { label: 'OUT', type: 'output', x: 30, y: -10 },
  { label: 'VCC', type: 'power', x: -10, y: -50 },
  { label: 'GND', type: 'ground', x: 10, y: -50 },
]);

export const ne555Definition: ComponentDefinition = {
  type: 'ne555',
  metadata: {
    name: 'NE555',
    category: 'ic',
    description: 'Timer: the classic oscillator and one-shot chip',
  },
  pins,
  defaultParameters: {},
  shelf: { caption: 'Timer', keywords: ['555', 'timer', 'astable', 'monostable', 'oscillator', 'atari punk', 'chip', 'ic'], art: chipArt(8, 'NE555') },
  ...chipViews({ width: 80, height: 120, name: 'NE555', lines: ['TIMER'], pins }),
};
