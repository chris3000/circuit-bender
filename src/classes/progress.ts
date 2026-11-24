/**
 * How far the learner has got, kept in this browser: which class is open,
 * and for each class what has been done, guessed and seen.
 */
export interface ClassProgress {
  /** Which part of the class is showing (an index into SECTIONS). */
  section: number;
  /** The steps done, by id. Once done a step stays done. */
  done: string[];
  /** The answer picked for each experiment's question, before trying. */
  guesses: Record<string, number>;
  /** What each experiment showed, as it read when the change was made. */
  results: Record<string, string>;
  /** The check's hint has been asked for. */
  hinted: boolean;
  /** The check has been passed: the class is finished. */
  finished: boolean;
}

export interface Progress {
  /** The class in the panel, if one is. */
  open: string | null;
  classes: Record<string, ClassProgress>;
}

const KEY = 'circuit_bender_classes';

export const NEW_CLASS: ClassProgress = { section: 0, done: [], guesses: {}, results: {}, hinted: false, finished: false };

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readProgress(): Progress {
  try {
    const raw = storage()?.getItem(KEY);
    const stored = raw ? JSON.parse(raw) : null;
    if (!stored || typeof stored !== 'object' || typeof stored.classes !== 'object' || stored.classes === null) {
      return { open: null, classes: {} };
    }
    const classes: Record<string, ClassProgress> = {};
    for (const [id, value] of Object.entries(stored.classes as Record<string, Partial<ClassProgress>>)) {
      if (!value || typeof value !== 'object') continue;
      classes[id] = {
        section: Number.isInteger(value.section) ? Number(value.section) : 0,
        done: Array.isArray(value.done) ? value.done.filter((s) => typeof s === 'string') : [],
        guesses: value.guesses && typeof value.guesses === 'object' ? value.guesses : {},
        results: value.results && typeof value.results === 'object' ? value.results : {},
        hinted: value.hinted === true,
        finished: value.finished === true,
      };
    }
    return { open: typeof stored.open === 'string' ? stored.open : null, classes };
  } catch {
    return { open: null, classes: {} };
  }
}

export function writeProgress(progress: Progress): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(progress));
  } catch {
    // The class carries on; it just will not be remembered
  }
}
