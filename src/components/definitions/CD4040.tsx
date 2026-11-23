import type { ComponentDefinition } from '@/types/circuit';
import { chipArt } from '@/components/art/partArt';
import { chipPins, chipViews, column } from '@/components/art/chipSymbol';

// In the order the simulation model has them: CLK, RST, Q1–Q12, VDD, VSS.
const pins = chipPins('cd4040', [
  { label: 'CLK', type: 'input', x: -30, y: -110 },
  { label: 'RST', type: 'input', x: -30, y: -70 },
  ...column(30, -110, Array.from({ length: 12 }, (_, q) => `Q${q + 1}`), 'output'),
  { label: 'VDD', type: 'power', x: -10, y: -130 },
  { label: 'VSS', type: 'ground', x: 10, y: -130 },
]);

export const cd4040Definition: ComponentDefinition = {
  type: 'cd4040',
  metadata: {
    name: 'CD4040',
    category: 'ic',
    description: 'Binary counter: each output is the clock an octave lower than the one before, twelve octaves down',
  },
  pins,
  defaultParameters: {},
  floatingPins: true,
  shelf: { caption: 'Divider ÷2 … ÷4096', keywords: ['4040', 'counter', 'divider', 'binary', 'ripple', 'octave', 'sub', 'cmos', 'logic', 'chip', 'ic'], art: chipArt(16, 'CD4040') },
  ...chipViews({ width: 80, height: 280, name: 'CD4040', lines: ['12-STAGE', 'COUNTER'], pins }),
};
