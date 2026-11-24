/** Kinds of `<input>` that are not typed into. */
const NOT_TEXT = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/** Whether a key pressed here is being typed into something: a text box, a list, editable text. */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]')) return true;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && !NOT_TEXT.has((target as HTMLInputElement).type);
}

/**
 * Whether this key press is Space meant for play / stop: not typed into a
 * text field, not held down, and not while a dialog is asking something
 * (there it presses the button it is on, as usual).
 *
 * Everywhere else Space is play / stop, even on a button or slider that has
 * the focus: those keep it after a click, and "press Space, nothing happens
 * because of what I last clicked" is worse than pressing them with Enter.
 */
export function isPlayShortcut(event: KeyboardEvent): boolean {
  if (event.key !== ' ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (document.querySelector('[aria-modal="true"]')) return false;
  return !isTextField(event.target);
}

/**
 * Whether a key pressed here goes to text with an undo of its own: a text box
 * or editable text that is being typed in. A list has none. Nor has a box
 * whose text is what the circuit already holds (`data-settled`, the
 * inspector's fields once Enter is pressed): there Ctrl+Z means the circuit.
 */
function hasOwnUndo(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'SELECT' || !isTextField(target)) return false;
  return target.dataset.settled !== 'true';
}

/**
 * Whether this key press asks to undo or redo an edit to the circuit:
 * Ctrl/Cmd+Z, and Ctrl/Cmd+Shift+Z or Ctrl+Y to redo. Not while text is
 * being typed (the text box undoes its own typing) and not while a dialog is
 * asking something.
 */
export function undoShortcut(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  const step = key === 'z' ? (event.shiftKey ? 'redo' : 'undo')
    : key === 'y' && event.ctrlKey && !event.shiftKey ? 'redo'
    : null;
  if (!step) return null;
  if (document.querySelector('[aria-modal="true"]') || hasOwnUndo(event.target)) return null;
  return step;
}

/** How a shortcut is written on this computer: "⌘Z" on a Mac, "Ctrl+Z" elsewhere. */
export function shortcutName(key: string, { shift = false } = {}): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  return mac ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}
