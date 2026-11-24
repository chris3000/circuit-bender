import type { Circuit } from '@/models/Circuit';

/**
 * Reasons a circuit will be silent that are worth telling someone who has
 * just pressed play. Plain sentences, most important first.
 */
export function playbackWarnings(circuit: Circuit): string[] {
  const components = circuit.getComponents();
  if (components.length === 0) return ['Nothing to play yet. Add some parts or load an example.'];

  const warnings: string[] = [];
  if (!components.some((c) => c.type === 'power')) {
    warnings.push('No power supply, so nothing will run. Add a +9V supply.');
  }
  // What can be heard: the audio output, a speaker, or a piezo disc
  const jacks = components.filter((c) => c.type === 'audio-output' || c.type === 'speaker' || c.type === 'piezo');
  if (jacks.length === 0) {
    // A circuit of lights is something to play too: it is watched, not heard
    if (!components.some((c) => c.type === 'led')) {
      warnings.push('No audio output, so you will not hear anything. Add an Audio Out or a speaker.');
    }
  } else {
    const connections = circuit.getConnections();
    const wired = jacks.some((jack) =>
      connections.some((c) => c.from.componentId === jack.id || c.to.componentId === jack.id));
    if (!wired) warnings.push('The audio output is not wired to anything.');
  }
  return warnings;
}
