/** How the shelf was left: what is folded away, and the parts used last. Kept in this browser. */
import { useCallback, useState } from 'react';

export interface ShelfPrefs {
  /** The whole shelf is folded to a strip. */
  hidden: boolean;
  /** Categories that are folded shut. */
  closed: string[];
  /** Parts showing all their values, not just the common ones. */
  open: string[];
  /** Keys of the parts used last, newest first. */
  recent: string[];
}

const KEY = 'circuit_bender_shelf';
const DEFAULTS: ShelfPrefs = { hidden: false, closed: [], open: [], recent: [] };
export const MAX_RECENT = 8;

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

function read(): ShelfPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return DEFAULTS;
    return {
      hidden: stored.hidden === true,
      closed: strings(stored.closed),
      open: strings(stored.open),
      recent: strings(stored.recent).slice(0, MAX_RECENT),
    };
  } catch {
    return DEFAULTS; // no storage, or nothing sensible in it
  }
}

export function useShelfPrefs(): [ShelfPrefs, (change: (prefs: ShelfPrefs) => ShelfPrefs) => void] {
  const [prefs, setPrefs] = useState(read);
  const update = useCallback((change: (prefs: ShelfPrefs) => ShelfPrefs) => {
    setPrefs((current) => {
      const next = change(current);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* remembered for this visit only */ }
      return next;
    });
  }, []);
  return [prefs, update];
}

/** `list` with `entry` in or out. */
export function toggled(list: string[], entry: string): string[] {
  return list.includes(entry) ? list.filter((e) => e !== entry) : [...list, entry];
}
