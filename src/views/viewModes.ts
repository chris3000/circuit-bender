/**
 * The three ways of looking at a circuit. Schematic and board are the same
 * canvas drawn two ways; the cover is the front panel of the finished thing.
 */
export const VIEWS = [
  { id: 'schematic', label: 'Schematic', hint: 'The circuit as a diagram' },
  { id: 'board', label: 'Board', hint: 'The circuit as parts on a board' },
  { id: 'cover', label: 'Cover', hint: 'The front panel: every knob, switch, light and socket' },
] as const;

export type ActiveView = typeof VIEWS[number]['id'];

/** The view after this one, for the Tab key. */
export function nextView(view: ActiveView): ActiveView {
  const index = VIEWS.findIndex((v) => v.id === view);
  return VIEWS[(index + 1) % VIEWS.length].id;
}
