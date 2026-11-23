/** Generate a descriptive tooltip for a component pin. */
export function pinTooltip(componentType: string, label: string, pinType: string): string {
  // Descriptive names for common pin labels
  const descriptions: Record<string, Record<string, string>> = {
    '2n3904': { B: 'Base', C: 'Collector', E: 'Emitter' },
    '1n914': { A: 'Anode (+)', K: 'Cathode (-)' },
    led: { A: 'Anode (+)', K: 'Cathode (-)' },
    lm741: {
      '-': 'Inverting input', '+': 'Non-inverting input',
      'V-': 'Ground / V-', 'V+': 'Power / V+',
      OUT: 'Output', NC: 'Not connected',
    },
    power: { '+': 'Positive (+9V)', '\u2212': 'Ground (0V)' },
    ground: { GND: 'Ground (0V)' },
    junction: { J: 'Wire junction' },
    'audio-output': { IN: 'Audio input' },
    ne555: {
      TRIG: 'Trigger: below a third of the supply sets the output high',
      THRES: 'Threshold: above two thirds of the supply sets the output low',
      RESET: 'Reset: low forces the output low (leave open to run)',
      CTRL: 'Control voltage: two thirds of the supply; pull it about to bend the pitch',
      DISCH: 'Discharge: shorted to ground while the output is low',
      OUT: 'Output', VCC: 'Power (VCC)', GND: 'Ground',
    },
    cd4040: { CLK: 'Clock: counts each time it falls', RST: 'Reset: high holds the count at zero', VDD: 'Power (VDD)', VSS: 'Ground (VSS)' },
    cd4017: {
      CLK: 'Clock: steps each time it rises', INH: 'Clock inhibit: high stops the count', RST: 'Reset: high returns to Q0',
      CO: 'Carry out: one cycle for every ten steps', VDD: 'Power (VDD)', VSS: 'Ground (VSS)',
    },
    lm386: { '-': 'Inverting input', '+': 'Non-inverting input', GND: 'Ground', VS: 'Power (VS)', OUT: 'Output: idles at half the supply' },
    speaker: { '+': 'Positive terminal', '\u2212': 'Negative terminal' },
  };

  // CD40106 gate labels
  if (componentType === 'cd40106') {
    const gateMatch = label.match(/^(\d)(A|Y)$/);
    if (gateMatch) {
      const [, gate, io] = gateMatch;
      return `Gate ${gate} ${io === 'A' ? 'Input' : 'Output'}`;
    }
    if (label === 'VDD') return 'Power (VDD)';
    if (label === 'VSS') return 'Ground (VSS)';
  }

  if (componentType === 'cd4093') {
    const gate = label.match(/^(\d)(A|B|Y)$/);
    if (gate) return `Gate ${gate[1]} ${gate[2] === 'Y' ? 'output: low only while both inputs are high' : `input ${gate[2]}`}`;
    if (label === 'VDD') return 'Power (VDD)';
    if (label === 'VSS') return 'Ground (VSS)';
  }
  const stage = /^Q(\d+)$/.exec(label);
  if (stage && componentType === 'cd4040') return `Q${stage[1]}: the clock divided by ${2 ** Number(stage[1])}`;
  if (stage && componentType === 'cd4017') return `Q${stage[1]}: high on step ${stage[1]}`;

  // Check component-specific descriptions
  const compDesc = descriptions[componentType];
  if (compDesc && compDesc[label]) return compDesc[label];

  // Fallback: combine label and type
  const typeLabel = pinType === 'bidirectional' ? '' : ` (${pinType})`;
  return `${label}${typeLabel}`;
}
