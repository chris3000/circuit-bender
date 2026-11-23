/**
 * What is on the cover and where: every part whose definition says it belongs
 * on the front panel (`cover`), arranged the way a panel is laid out — knobs
 * across the top, switches, buttons and touch pads bottom left, lights,
 * sockets and speakers bottom right.
 *
 * Nothing here knows any particular part, and nothing is stored: the cover is
 * worked out from the circuit, so it is never out of step with it.
 */
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component, ComponentCover, ComponentDefinition } from '@/types/circuit';

export type CoverControl = ComponentCover['control'];

export interface CoverItem {
  /** Its own: a part can put more than one thing on the cover. */
  id: string;
  component: Component;
  cover: ComponentCover;
  control: CoverControl;
  /** The name engraved under it: the part's own, or "KNOB 2". */
  name: string;
  /** Whether that name is the part's own (and not a stand-in). */
  named: boolean;
  detail?: string;
  /** The cell it is drawn in, in panel units from the panel's top left. */
  x: number; y: number; width: number; height: number;
}

export interface CoverLayout {
  width: number;
  height: number;
  /** The face between the two end cheeks. */
  face: { left: number; right: number; top: number; bottom: number };
  items: CoverItem[];
  /** Where the rows of knobs end and the row of switches and outputs begins (for the dividing line). */
  divider: number | null;
  /** Where the switches end and the outputs begin in a shared row. */
  split: { x: number; top: number; bottom: number } | null;
}

/** Sizes, in panel units (one unit is one pixel before the panel is scaled to fit). */
export const PANEL = {
  cheek: 20,
  margin: 30,
  header: 78,
  footer: 40,
  minContent: 500,
  maxContent: 800,
  /** Room between the switches and the outputs when they share a row. */
  gap: 36,
  knob: { width: 128, height: 158 },
  row: 136,
  toggle: 88,
  button: 88,
  pad: 104,
  lamp: 76,
  pilot: 84,
  jack: 112,
  speaker: 112,
} as const;

/** Width of one engraved character of a name. */
export const NAME_CHAR_WIDTH = 7.9;
const NAME_PADDING = 14;

/** Inputs that sit in the lower row, in the order they sit, left to right. Knobs have the rows above. */
const HAND_ORDER: CoverControl[] = ['toggle', 'button', 'pad'];
const INPUTS: CoverControl[] = ['knob', ...HAND_ORDER];
/** Outputs in the order they sit, left to right. */
const OUTPUT_ORDER: CoverControl[] = ['lamp', 'pilot', 'jack', 'speaker'];

export function isCoverInput(control: CoverControl): boolean {
  return INPUTS.includes(control);
}

function baseWidth(control: CoverControl): number {
  return control === 'knob' ? PANEL.knob.width : PANEL[control];
}

type Lookup = (type: string) => ComponentDefinition | undefined;
const fromRegistry: Lookup = (type) => ComponentRegistry.getInstance().get(type);

interface Entry { id: string; component: Component; cover: ComponentCover; name: string; named: boolean; width: number }

/** The parts that are on the cover, in circuit order, with the names they go by. */
function coverEntries(components: Component[], lookup: Lookup): Entry[] {
  const found = components.flatMap((component) => {
    const cover = lookup(component.type)?.cover;
    const covers = cover ? (Array.isArray(cover) ? cover : [cover]) : [];
    return covers
      .filter((c) => !c.when || c.when(component.parameters))
      .map((c) => ({ component, cover: c, id: `${component.id}:${c.control}${c.parameter ? `:${c.parameter}` : ''}` }));
  });
  // Unnamed parts take their kind's name, numbered when there is more than one of the kind
  const ofKind = new Map<string, number>();
  for (const { cover } of found) ofKind.set(cover.name, (ofKind.get(cover.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return found.map(({ component, cover, id }) => {
    const index = (seen.get(cover.name) ?? 0) + 1;
    seen.set(cover.name, index);
    // The part's own name goes to the part itself, not to a second control it has
    const own = cover.fixedName ? '' : component.label?.trim();
    const name = own || (ofKind.get(cover.name)! > 1 ? `${cover.name} ${index}` : cover.name);
    const width = Math.max(baseWidth(cover.control), Math.ceil(name.length * NAME_CHAR_WIDTH) + NAME_PADDING);
    return { id, component, cover, name, named: Boolean(own) || Boolean(cover.fixedName), width };
  });
}

const total = (entries: Entry[]) => entries.reduce((sum, e) => sum + e.width, 0);

/** Break a line of cells into rows no wider than `limit` (a single cell may be). */
function wrap(entries: Entry[], limit: number): Entry[][] {
  const rows: Entry[][] = [];
  let row: Entry[] = [];
  for (const entry of entries) {
    if (row.length > 0 && total(row) + entry.width > limit) { rows.push(row); row = []; }
    row.push(entry);
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/** Rows of knobs are as even as they can be: seven knobs are four over three, not six over one. */
function wrapEvenly(entries: Entry[], limit: number): Entry[][] {
  const rows = wrap(entries, limit);
  if (rows.length < 2) return rows;
  const perRow = Math.ceil(entries.length / rows.length);
  const even: Entry[][] = [];
  for (let i = 0; i < entries.length; i += perRow) even.push(entries.slice(i, i + perRow));
  return even.every((row) => total(row) <= limit) ? even : rows;
}

export function coverLayout(components: Component[], lookup: Lookup = fromRegistry): CoverLayout {
  const entries = coverEntries(components, lookup);
  // In circuit order, but a part's second control (the supply's starve knob) after the parts that are controls
  const ofKind = (control: CoverControl) => {
    const all = entries.filter((e) => e.cover.control === control);
    return [...all.filter((e) => !e.cover.fixedName), ...all.filter((e) => e.cover.fixedName)];
  };
  const knobs = ofKind('knob');
  const toggles = HAND_ORDER.flatMap(ofKind);
  const outputs = OUTPUT_ORDER.flatMap(ofKind);

  const knobRows = wrapEvenly(knobs, PANEL.maxContent);
  // Switches and outputs share a row when they fit; otherwise each gets rows of its own
  const shared = total(toggles) + total(outputs) + (toggles.length && outputs.length ? PANEL.gap : 0) <= PANEL.maxContent;
  const lowerRows: Array<{ left: Entry[]; right: Entry[] }> = shared
    ? (toggles.length || outputs.length ? [{ left: toggles, right: outputs }] : [])
    : [
      ...wrap(toggles, PANEL.maxContent).map((left) => ({ left, right: [] as Entry[] })),
      ...wrap(outputs, PANEL.maxContent).map((right) => ({ left: [] as Entry[], right })),
    ];

  const content = Math.max(
    PANEL.minContent,
    ...knobRows.map(total),
    ...lowerRows.map((row) => total(row.left) + total(row.right) + (row.left.length && row.right.length ? PANEL.gap : 0)),
  );
  const left = PANEL.cheek + PANEL.margin;
  const items: CoverItem[] = [];
  const place = (entry: Entry, x: number, y: number, height: number) => {
    items.push({
      id: entry.id, component: entry.component, cover: entry.cover, control: entry.cover.control,
      name: entry.name, named: entry.named,
      detail: entry.cover.detail?.(entry.component.parameters),
      x, y, width: entry.width, height,
    });
  };

  let y = PANEL.header;
  for (const row of knobRows) {
    // Spread across the panel, with the same room at the ends as between knobs
    const spare = (content - total(row)) / (row.length + 1);
    let x = left + spare;
    for (const entry of row) { place(entry, x, y, PANEL.knob.height); x += entry.width + spare; }
    y += PANEL.knob.height;
  }
  const divider = knobRows.length > 0 && lowerRows.length > 0 ? y : null;
  let split: CoverLayout['split'] = null;
  for (const row of lowerRows) {
    let x = left;
    for (const entry of row.left) { place(entry, x, y, PANEL.row); x += entry.width; }
    const rightStart = left + content - total(row.right);
    if (row.left.length && row.right.length) split = { x: (x + rightStart) / 2, top: y, bottom: y + PANEL.row };
    x = rightStart;
    for (const entry of row.right) { place(entry, x, y, PANEL.row); x += entry.width; }
    y += PANEL.row;
  }
  // A cover with nothing on it still has room for saying so
  if (items.length === 0) y += PANEL.row;

  const width = content + 2 * (PANEL.margin + PANEL.cheek);
  const height = y + PANEL.footer;
  return {
    width, height,
    face: { left: PANEL.cheek, right: width - PANEL.cheek, top: 0, bottom: height },
    items, divider, split,
  };
}
