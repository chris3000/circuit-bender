/**
 * What is on the parts shelf, worked out from the part definitions: one item
 * for a part with nothing to choose, one per stocked value for a part that
 * comes in values. Nothing here knows about any particular part.
 */
import type { Component, ComponentDefinition, ComponentParameters } from '@/types/circuit';
import { similarParts } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import { parseTypedValue, sameValue, valueParameters } from '@/utils/partValue';

export interface ShelfItem {
  /** Names the item for good: "cd40106", or "resistor@4700" for a value. */
  key: string;
  definition: ComponentDefinition;
  /** Position of the definition among the registered parts, which is the order of the shelf. */
  order: number;
  /** What a part made from this item starts with, where that is not the type's default. */
  parameters: ComponentParameters;
  /** What is written under the picture: the value, or the part's name. */
  title: string;
  caption?: string;
  /** The value, for a part that comes in values. */
  value?: number;
  /** Shown before the rest of its values are asked for. */
  common: boolean;
  /** Not in stock: made up from a value that was typed. */
  custom?: boolean;
}

const CATEGORIES: Array<{ key: ComponentDefinition['metadata']['category']; label: string }> = [
  // What every circuit needs comes first; it is one row
  { key: 'power', label: 'Power & sound' },
  { key: 'passive', label: 'Passive' },
  { key: 'ic', label: 'Chips' },
  { key: 'active', label: 'Semiconductors' },
  { key: 'control', label: 'Controls' },
];

const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

/** Whether the part comes in values: it has one, and some are stocked. */
function stockOf(definition: ComponentDefinition): number[] | null {
  const stock = definition.shelf?.stock;
  return definition.value && stock && stock.length > 0 ? stock : null;
}

/** The name a part goes by on the shelf. */
export function shelfName(definition: ComponentDefinition): string {
  return definition.shelf?.title ?? definition.metadata.name;
}

function valueItem(definition: ComponentDefinition, order: number, value: number, custom = false): ShelfItem {
  const spec = definition.value!;
  const common = definition.shelf?.common;
  return {
    key: `${definition.type}@${value}`,
    definition, order, value, custom,
    parameters: valueParameters(spec, value),
    title: formatValue(value, spec.kind),
    common: !custom && (!common || common.some((c) => sameValue(c, value))),
  };
}

export function buildCatalog(definitions: ComponentDefinition[]): ShelfItem[] {
  return definitions.flatMap((definition, order): ShelfItem[] => {
    const stock = stockOf(definition);
    if (stock) return stock.map((value) => valueItem(definition, order, value));
    return [{
      key: definition.type, definition, order, parameters: {},
      title: shelfName(definition), caption: definition.shelf?.caption, common: true,
    }];
  });
}

/** The item a key names, if the part still exists: the way back from a remembered key. */
export function resolveItem(key: string, definitions: ComponentDefinition[]): ShelfItem | null {
  const [type, valueText] = key.split('@');
  const order = definitions.findIndex((d) => d.type === type);
  if (order < 0) return null;
  const definition = definitions[order];
  if (valueText === undefined) return stockOf(definition) ? null : buildCatalog([definition]).map((i) => ({ ...i, order }))[0];
  const value = Number(valueText);
  if (!definition.value || !(value > 0)) return null;
  const stocked = stockOf(definition)?.some((s) => sameValue(s, value)) ?? false;
  return valueItem(definition, order, value, !stocked);
}

/** The item for a value someone typed ("4k7") for a part that comes in values; null if it is not a value of that kind. */
export function typedValueItem(definition: ComponentDefinition, definitions: ComponentDefinition[], text: string): ShelfItem | null {
  if (!definition.value) return null;
  const value = parseTypedValue(text, definition.value.kind);
  if (value === null) return null;
  const stocked = stockOf(definition)?.some((s) => sameValue(s, value)) ?? false;
  return valueItem(definition, definitions.indexOf(definition), value, !stocked);
}

/**
 * What a part on the canvas can be swapped for at a click: the other common
 * values of its own kind, and the parts that are like it (`shelf.alike`). A
 * like part that comes in values is offered in the stock value nearest the
 * part's own (a 4.7 kΩ resistor: a 5 kΩ pot), when they are values of the
 * same kind.
 */
export function replacementsFor(part: Component, definitions: ComponentDefinition[]): { values: ShelfItem[]; similar: ShelfItem[] } {
  const order = definitions.findIndex((d) => d.type === part.type);
  if (order < 0) return { values: [], similar: [] };
  const own = definitions[order];
  const has = own.value ? Number(part.parameters[own.value.parameter]) : NaN;

  const stock = stockOf(own);
  const offered = stock && own.shelf?.common?.length ? own.shelf.common : stock ?? [];
  const values = offered.filter((value) => !sameValue(value, has)).map((value) => valueItem(own, order, value));

  const similar = similarParts(own, definitions).map((other): ShelfItem => {
    const at = definitions.indexOf(other);
    const theirs = stockOf(other);
    if (!theirs) return buildCatalog([other]).map((item) => ({ ...item, order: at }))[0];
    const usual = Number(other.defaultParameters[other.value!.parameter]);
    const wanted = own.value?.kind === other.value!.kind && has > 0 ? has : usual;
    // Nearest as values go: by ratio, not by difference
    const nearest = theirs.reduce((best, value) =>
      (Math.abs(Math.log(value / wanted)) < Math.abs(Math.log(best / wanted)) ? value : best));
    return valueItem(other, at, wanted > 0 ? nearest : theirs[0]);
  });
  return { values, similar };
}

/** Every word an item can be found by, lower case. */
function wordsOf(item: ShelfItem): string[] {
  const { definition } = item;
  const text = [
    item.title, definition.type, definition.metadata.name, shelfName(definition),
    definition.shelf?.caption ?? '',
    // Not the description: it is a sentence or two about what the part does, and names other parts
    categoryLabel(definition.metadata.category), ...(definition.shelf?.keywords ?? []),
  ].join(' ').toLowerCase();
  return text.split(/[^a-z0-9.µω]+/).filter(Boolean);
}

/** How well one typed word fits an item: 0 exactly, 1 as the start of a word, 2 within one; null not at all. */
function fit(item: ShelfItem, words: string[], token: string): number | null {
  if (item.value !== undefined) {
    const typed = parseTypedValue(token, item.definition.value!.kind);
    if (typed !== null && sameValue(typed, item.value)) return 0;
  }
  const lower = token.toLowerCase();
  let best: number | null = null;
  for (const word of words) {
    const score = word === lower ? 0 : word.startsWith(lower) ? 1 : word.includes(lower) ? 2 : null;
    if (score !== null && (best === null || score < best)) best = score;
  }
  return best;
}

/** The items among `candidates` that fit every typed word, each with how well (lower is better). */
function matches(candidates: ShelfItem[], tokens: string[]): Array<{ item: ShelfItem; score: number }> {
  const found: Array<{ item: ShelfItem; score: number }> = [];
  for (const item of candidates) {
    const words = wordsOf(item);
    let score = 0;
    for (const token of tokens) {
      const s = fit(item, words, token);
      if (s === null) { score = -1; break; }
      score += s;
    }
    if (score >= 0) found.push({ item, score });
  }
  return found;
}

/**
 * The items that fit everything typed, best first. A typed value that is not
 * in stock ("33.2k", "56n") is made up on the spot for every part that comes
 * in values of that kind, so the shelf holds any value there is.
 */
export function searchCatalog(catalog: ShelfItem[], query: string): ShelfItem[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return catalog;

  const found = matches(catalog, tokens);

  // Values to make up. A bare number is only taken for one when nothing in
  // stock answers to it: "741" and "40106" are chips, not 741 Ω and 40.106 kΩ.
  const families = new Map<string, ShelfItem>();
  for (const item of catalog) if (item.value !== undefined) families.set(item.definition.type, item);
  const made: ShelfItem[] = [];
  for (const { definition, order } of families.values()) {
    for (const token of tokens) {
      if (found.length > 0 && !/[a-zµμΩ]/i.test(token)) continue;
      const typed = parseTypedValue(token, definition.value!.kind);
      if (typed === null) continue;
      const have = [...catalog, ...made].some((c) => c.definition === definition && sameValue(c.value!, typed));
      if (!have) made.push(valueItem(definition, order, typed, true));
    }
  }

  return [...found, ...matches(made, tokens)]
    .sort((a, b) => a.score - b.score || a.item.order - b.item.order || (a.item.value ?? 0) - (b.item.value ?? 0))
    .map((f) => f.item);
}

/** A run of the shelf: the values of one part, or parts that each stand alone. */
export type ShelfBlock =
  | { kind: 'values'; definition: ComponentDefinition; items: ShelfItem[] }
  | { kind: 'parts'; items: ShelfItem[] };

export interface ShelfSection {
  category: string;
  label: string;
  count: number;
  blocks: ShelfBlock[];
}

/** Items arranged for showing: by category, parts in their registered order, a part's values together. */
export function groupItems(items: ShelfItem[]): ShelfSection[] {
  const known = CATEGORIES.map((c) => c.key as string);
  const categories = [...known, ...new Set(items.map((i) => i.definition.metadata.category).filter((c) => !known.includes(c)))];
  const sections: ShelfSection[] = [];
  for (const category of categories) {
    const inCategory = items.filter((i) => i.definition.metadata.category === category);
    if (inCategory.length === 0) continue;
    const byPart = new Map<ComponentDefinition, ShelfItem[]>();
    for (const item of inCategory) byPart.set(item.definition, [...(byPart.get(item.definition) ?? []), item]);
    const blocks: ShelfBlock[] = [];
    for (const [definition, partItems] of [...byPart].sort((a, b) => a[1][0].order - b[1][0].order)) {
      const last = blocks[blocks.length - 1];
      if (partItems[0].value !== undefined) blocks.push({ kind: 'values', definition, items: partItems });
      else if (last?.kind === 'parts') last.items.push(...partItems);
      else blocks.push({ kind: 'parts', items: [...partItems] });
    }
    sections.push({ category, label: categoryLabel(category), count: inCategory.length, blocks });
  }
  return sections;
}
