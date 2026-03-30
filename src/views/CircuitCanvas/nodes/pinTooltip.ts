/** Generate a descriptive tooltip for a component pin. */
export function pinTooltip(componentType: string, label: string, pinType: string): string {
  // Descriptive names for common pin labels
  const descriptions: Record<string, Record<string, string>> = {
    '2n3904': { B: 'Base', C: 'Collector', E: 'Emitter' },
    '1n914': { A: 'Anode (+)', K: 'Cathode (-)' },
    led: { A: 'Anode (+)', K: 'Cathode (-)' },
    lm741: {
      '-': 'Inverting input', '+': 'Non-inverting input',
      'V-': 'Negative supply', 'V+': 'Positive supply',
      OUT: 'Output', NC: 'Not connected',
    },
    power: { '+': 'Positive (+9V)', '\u2212': 'Ground (0V)' },
    ground: { GND: 'Ground (0V)' },
    'audio-output': { IN: 'Audio input' },
  };

  // CD40106 gate labels
  if (componentType === 'cd40106') {
    const gateMatch = label.match(/^(\d)(A|Y)$/);
    if (gateMatch) {
      const [, gate, io] = gateMatch;
      return `Gate ${gate} ${io === 'A' ? 'Input' : 'Output'}`;
    }
    if (label === 'VDD') return 'Positive supply (VDD)';
    if (label === 'VSS') return 'Negative supply (VSS)';
  }

  // Check component-specific descriptions
  const compDesc = descriptions[componentType];
  if (compDesc && compDesc[label]) return compDesc[label];

  // Fallback: combine label and type
  const typeLabel = pinType === 'bidirectional' ? '' : ` (${pinType})`;
  return `${label}${typeLabel}`;
}
