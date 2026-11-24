import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews, column } from '@/components/art/chipSymbol';

// In the order the simulation model has them: CLK, INH, RST, Q0–Q9, CO, VDD, VSS.
const pins = chipPins('cd4017', [
  { label: 'CLK', type: 'input', x: -30, y: -100 },
  { label: 'INH', type: 'input', x: -30, y: -60 },
  { label: 'RST', type: 'input', x: -30, y: -20 },
  ...column(30, -100, [...Array.from({ length: 10 }, (_, q) => `Q${q}`), 'CO'], 'output'),
  { label: 'VDD', type: 'power', x: -10, y: -120 },
  { label: 'VSS', type: 'ground', x: 10, y: -120 },
]);

export const cd4017Definition: ComponentDefinition = {
  type: 'cd4017',
  metadata: {
    name: 'CD4017',
    category: 'ic',
    description: 'Decade counter: ten outputs that go high one after another, a step for each clock pulse',
  },
  pins,
  defaultParameters: {},
  floatingPins: true,
  through: [0, 3], // clock in, the first step out
  shelf: { caption: 'Counter 1 of 10', keywords: ['4017', 'counter', 'decade', 'sequencer', 'divider', 'johnson', 'step', 'cmos', 'logic', 'chip', 'ic'], art: chipArt(16, 'CD4017'), alike: ['counter'] },
  ...chipViews({ width: 80, height: 260, name: 'CD4017', lines: ['DECADE', 'COUNTER'], pins }),
};
