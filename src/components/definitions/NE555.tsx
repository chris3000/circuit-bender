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
    description: 'The classic timer. With two resistors and a capacitor it makes pulses without end, from a slow blink to a note you can hear; triggered, it makes one pulse of a set length',
  },
  pins,
  defaultParameters: {},
  through: [0, 5], // trigger in, output out
  shelf: { caption: 'Timer', keywords: ['555', 'timer', 'astable', 'monostable', 'oscillator', 'atari punk', 'chip', 'ic'], art: chipArt(8, 'NE555') },
  ...chipViews({ width: 80, height: 120, name: 'NE555', lines: ['TIMER'], pins }),
};
