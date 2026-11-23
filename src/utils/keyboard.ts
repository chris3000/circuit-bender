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
