import { useEffect, useRef } from 'react';
import { undoShortcut } from '@/utils/keyboard';
import { useCircuit } from './CircuitContext';

/**
 * Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes, wherever the
 * mouse last clicked: on the canvas, the cover, the shelf, the inspector or
 * nothing at all. Heard before anything else on the page (capture), so panels
 * that keep their keys to themselves do not swallow it. Mounted once, by `App`.
 */
export function useUndoShortcuts(): void {
  const { undo, redo } = useCircuit();
  const steps = useRef({ undo, redo });
  steps.current = { undo, redo };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const step = undoShortcut(e);
      if (!step) return;
      // Nothing else is to act on it: not the browser's own undo, not a view's
      e.preventDefault();
      e.stopPropagation();
      steps.current[step]();
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, []);
}
