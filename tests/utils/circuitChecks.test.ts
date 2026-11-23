import { describe, it, expect } from 'vitest';
import { Circuit } from '@/models/Circuit';
import { playbackWarnings } from '@/utils/circuitChecks';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { powerSupplyDefinition } from '@/components/definitions/PowerSupply';
import { audioOutputJackDefinition } from '@/components/definitions/AudioOutputJack';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import type { ConnectionId, NetId } from '@/types/circuit';

const part = (definition: Parameters<typeof createComponentFromDefinition>[0]) =>
  createComponentFromDefinition(definition, { x: 0, y: 0 });

describe('playbackWarnings', () => {
  it('says an empty canvas has nothing to play', () => {
    expect(playbackWarnings(new Circuit('empty'))).toEqual([expect.stringContaining('Nothing to play')]);
  });

  it('names a missing power supply and a missing audio output', () => {
    const warnings = playbackWarnings(new Circuit('c').addComponent(part(resistorDefinition)));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('No power supply');
    expect(warnings[1]).toContain('No audio output');
  });

  it('notices an audio output that is not wired up', () => {
    const circuit = new Circuit('c')
      .addComponent(part(powerSupplyDefinition))
      .addComponent(part(audioOutputJackDefinition));
    expect(playbackWarnings(circuit)).toEqual([expect.stringContaining('not wired')]);
  });

  it('has nothing to say about a circuit with power and a wired output', () => {
    const power = part(powerSupplyDefinition), jack = part(audioOutputJackDefinition), r = part(resistorDefinition);
    const circuit = new Circuit('c').addComponent(power).addComponent(jack).addComponent(r).addConnection({
      id: 'w' as ConnectionId, net: 'n' as NetId,
      from: { componentId: r.id, pinId: r.pins[1].id },
      to: { componentId: jack.id, pinId: jack.pins[0].id },
    });
    expect(playbackWarnings(circuit)).toEqual([]);
  });
});
