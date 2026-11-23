import type { ComponentParameters } from '@/types/circuit';

/**
 * Where the audio output sends what it hears.
 *
 * It is a socket with a speaker behind it: with nothing plugged in, the
 * sound comes out of the speaker. Nothing can be plugged in yet, so that is
 * what always happens. `'line'` is the other half, kept for when the signal
 * can go somewhere (a recording, a file, another circuit): an output set to
 * it shows on the cover as a socket instead of a speaker.
 */
export type AudioDestination = 'speaker' | 'line';

/** The parameter of an audio output that says where its signal goes. */
export const AUDIO_DESTINATION = 'destination';

export function audioDestination(parameters: ComponentParameters): AudioDestination {
  return parameters[AUDIO_DESTINATION] === 'line' ? 'line' : 'speaker';
}
