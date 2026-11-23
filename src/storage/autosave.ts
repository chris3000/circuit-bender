/**
 * The circuit on screen, kept in this browser as it is edited so that closing
 * the tab or reloading the page loses nothing. Separate from the named saves:
 * it is whatever was last on the canvas, saved or not.
 */
import { Circuit } from '@/models/Circuit';
import { serializeCircuit, deserializeCircuit } from './serializer';

const AUTOSAVE_KEY = 'circuit_bender_autosave';

interface Autosave {
  /** Whether the circuit had changes that were not in a named save. */
  dirty: boolean;
  data: string;
}

/** Storage can be missing or refuse writes (private windows, full quota); the app works without it. */
function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' ? localStorage : null;
  } catch {
    return null;
  }
}

export function writeAutosave(circuit: Circuit, dirty: boolean): void {
  try {
    const record: Autosave = { dirty, data: serializeCircuit(circuit) };
    storage()?.setItem(AUTOSAVE_KEY, JSON.stringify(record));
  } catch {
    // Nothing useful to do: the named saves and file export still work
  }
}

/** The circuit from the last visit, if there was one with anything in it. */
export function readAutosave(): { circuit: Circuit; dirty: boolean } | null {
  try {
    const raw = storage()?.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const record: Autosave = JSON.parse(raw);
    const circuit = deserializeCircuit(record.data);
    if (circuit.getComponents().length === 0) return null;
    return { circuit, dirty: record.dirty === true };
  } catch {
    return null;
  }
}
