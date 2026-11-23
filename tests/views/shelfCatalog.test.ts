/**
 * What the parts shelf holds and what a search of it finds, for the real
 * parts and for a part that says nothing about its place on the shelf.
 */
import { describe, it, expect } from 'vitest';
import { buildCatalog, groupItems, resolveItem, searchCatalog, type ShelfItem } from '@/views/ComponentDrawer/catalog';
import { readPartDrag, writePartDrag } from '@/views/ComponentDrawer/dragData';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import type { ComponentDefinition } from '@/types/circuit';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { capacitorDefinition } from '@/components/definitions/Capacitor';
import { cd40106Definition } from '@/components/definitions/CD40106';
import { potentiometerDefinition } from '@/components/definitions/Potentiometer';
import { junctionDefinition } from '@/components/definitions/Junction';
import { ALL_PARTS } from './allParts';

const catalog = buildCatalog(ALL_PARTS);
const keys = (items: ShelfItem[]) => items.map((i) => i.key);
const find = (query: string) => keys(searchCatalog(catalog, query));

describe('the catalog', () => {
  it('has one item for a part with nothing to choose and one per stocked value for the rest', () => {
    expect(keys(catalog).filter((k) => !k.includes('@')).sort()).toEqual(
      ['1n914', '2n3904', 'audio-output', 'cd40106', 'ground', 'junction', 'led', 'lm741', 'power', 'switch']);
    expect(catalog.filter((i) => i.definition === resistorDefinition)).toHaveLength(73);
    expect(catalog.filter((i) => i.definition === capacitorDefinition)).toHaveLength(49);
    expect(catalog.filter((i) => i.definition === potentiometerDefinition)).toHaveLength(8);
  });

  it('gives every key once', () => {
    expect(new Set(keys(catalog)).size).toBe(catalog.length);
  });

  it('knows what a part made from a value item starts with', () => {
    const item = catalog.find((i) => i.key === 'resistor@4700')!;
    expect(item.title).toBe('4.7kΩ');
    expect(item.parameters).toEqual({ resistance: 4700, value: '4.7kΩ' });
    expect(catalog.find((i) => i.key === 'capacitor@1e-7')!.parameters).toEqual({ capacitance: 1e-7, value: '100nF' });
    expect(catalog.find((i) => i.key === 'potentiometer@100000')!.parameters).toEqual({ maxResistance: 100e3, value: '100kΩ' });
    expect(catalog.find((i) => i.key === 'cd40106')!.parameters).toEqual({});
  });

  it('marks the values worth showing first, all of them where a part does not say', () => {
    const common = (d: ComponentDefinition) => catalog.filter((i) => i.definition === d && i.common);
    expect(common(resistorDefinition)).toHaveLength(12);
    expect(common(capacitorDefinition)).toHaveLength(12);
    expect(common(potentiometerDefinition)).toHaveLength(8);
    // every value named as common is one that is stocked
    expect(resistorDefinition.shelf!.common!.every((c) => resistorDefinition.shelf!.stock!.includes(c))).toBe(true);
    expect(common(capacitorDefinition).map((i) => i.title)).toContain('100nF');
  });

  it('stocks the default value of every part that comes in values', () => {
    for (const d of [resistorDefinition, capacitorDefinition, potentiometerDefinition]) {
      const value = d.defaultParameters[d.value!.parameter] as number;
      expect(catalog.some((i) => i.definition === d && i.value !== undefined && Math.abs(i.value - value) < value * 1e-6)).toBe(true);
    }
  });

  it('finds a place for a part that says nothing about the shelf', () => {
    const bare: ComponentDefinition = { ...junctionDefinition, type: 'mystery', shelf: undefined, metadata: { name: 'Mystery Part', category: 'active', description: 'Does something' } };
    const items = buildCatalog([...ALL_PARTS, bare]);
    const item = items.find((i) => i.key === 'mystery')!;
    expect(item.title).toBe('Mystery Part');
    expect(keys(searchCatalog(items, 'myst'))).toEqual(['mystery']);
    expect(groupItems(items).find((s) => s.category === 'active')!.count).toBe(4);
  });
});

describe('the shelf layout', () => {
  const sections = groupItems(catalog);

  it('starts with what every circuit needs', () => {
    expect(sections.map((s) => s.category)).toEqual(['power', 'passive', 'ic', 'active', 'control']);
    expect(keys(sections[0].blocks[0].items)).toEqual(['power', 'ground', 'audio-output']);
  });

  it('keeps the values of a part together and stand-alone parts in runs', () => {
    const passive = sections.find((s) => s.category === 'passive')!;
    expect(passive.blocks.map((b) => (b.kind === 'values' ? b.definition.type : keys(b.items).join())))
      .toEqual(['resistor', 'capacitor', 'junction']);
    expect(passive.count).toBe(73 + 49 + 1);
    const control = sections.find((s) => s.category === 'control')!;
    expect(control.blocks.map((b) => b.kind)).toEqual(['values', 'parts']);
  });

  it('counts every item once', () => {
    expect(sections.reduce((n, s) => n + s.count, 0)).toBe(catalog.length);
  });
});

describe('searching', () => {
  it('finds a part by name, number, what it is, or what people call it', () => {
    expect(find('cd40106')).toEqual(['cd40106']);
    expect(find('40106')).toEqual(['cd40106']);
    expect(find('schmitt')).toEqual(['cd40106']);
    expect(find('op amp')).toEqual(['lm741']);
    expect(find('opamp')).toEqual(['lm741']);
    expect(find('chip')).toEqual(['cd40106', 'lm741']);
    expect(find('gnd')).toEqual(['ground']);
    expect(find('battery')).toEqual(['power']);
    expect(find('speaker')).toEqual(['audio-output']);
    expect(find('npn')).toEqual(['2n3904']);
    expect(find('2n3904')).toEqual(['2n3904']);
    expect(find('1n914')).toEqual(['1n914']);
    expect(find('LED')).toEqual(['led']);
    expect(find('toggle')).toEqual(['switch']);
  });

  it('finds a whole category', () => {
    expect(find('semiconductors')).toEqual(['2n3904', '1n914', 'led']);
  });

  it('finds every value of a part by its name', () => {
    // every resistor, and then the pots, which are "variable resistors"
    expect(find('resistor').slice(0, 73).every((k) => k.startsWith('resistor@'))).toBe(true);
    expect(find('resistor')).toHaveLength(73 + 8);
    expect(find('pot')).toHaveLength(8);
    expect(find('cap')).toHaveLength(49);
  });

  it('finds a value however it is written', () => {
    for (const text of ['4.7k', '4k7', '4700', '4.7kΩ', '4.7K']) expect(find(text)[0]).toBe('resistor@4700');
    for (const text of ['100n', '100nF', '0.1u', '0.1µF']) expect(find(text)).toEqual(['capacitor@1e-7']);
  });

  it('puts the exact value before the ones that merely start the same', () => {
    const found = find('47');
    expect(found[0]).toBe('resistor@47');
    expect(found).toContain('resistor@470');
    expect(found).toContain('resistor@47000');
  });

  it('offers every part that comes in the typed value', () => {
    expect(find('10k')).toEqual(['resistor@10000', 'potentiometer@10000']);
    expect(find('pot 10k')).toEqual(['potentiometer@10000']);
    expect(find('resistor 10k')[0]).toBe('resistor@10000');
    expect(find('cap 10k')).toEqual([]);
  });

  it('makes a value that is not stocked', () => {
    const [resistor, pot] = searchCatalog(catalog, '33.2k');
    expect(resistor).toMatchObject({ key: 'resistor@33200', custom: true, title: '33.2kΩ', parameters: { resistance: 33200, value: '33.2kΩ' } });
    expect(pot).toMatchObject({ key: 'potentiometer@33200', custom: true });
    expect(find('56n')).toEqual(['capacitor@5.6e-8']);
    expect(find('33n')).toEqual(['capacitor@3.3e-8']); // stocked, though not shown until asked for
    expect(searchCatalog(catalog, '33n')[0]).toMatchObject({ custom: false, common: false });
    // a stocked value is not made a second time
    expect(searchCatalog(catalog, '4.7k').filter((i) => i.custom).map((i) => i.key)).toEqual(['potentiometer@4700']);
  });

  it('does not make values out of part numbers', () => {
    for (const number of ['2n3904', '1n914', '40106', '741', '3904', '914']) {
      expect(searchCatalog(catalog, number).filter((i) => i.custom).map((i) => i.key)).toEqual([]);
    }
  });

  it('takes a bare number for ohms when it is nothing else', () => {
    expect(find('240')).toEqual(['resistor@240', 'potentiometer@240']);
    expect(find('330')[0]).toBe('resistor@330');
  });

  it('finds nothing for nonsense, and everything for nothing', () => {
    expect(find('flux capacitor')).toEqual([]);
    expect(find('   ')).toEqual(keys(catalog));
  });
});

describe('a remembered part', () => {
  it('comes back from its key, stocked or not', () => {
    expect(resolveItem('resistor@4700', ALL_PARTS)).toMatchObject({ title: '4.7kΩ', custom: false });
    expect(resolveItem('capacitor@5.6e-8', ALL_PARTS)).toMatchObject({ title: '56nF', custom: true });
    expect(resolveItem('cd40106', ALL_PARTS)).toMatchObject({ title: 'CD40106', caption: 'Schmitt ×6' });
    expect(resolveItem('cd40106', ALL_PARTS)!.order).toBe(ALL_PARTS.indexOf(cd40106Definition));
  });

  it('is forgotten if it no longer makes sense', () => {
    expect(resolveItem('theremin', ALL_PARTS)).toBeNull();
    expect(resolveItem('resistor@banana', ALL_PARTS)).toBeNull();
    expect(resolveItem('resistor', ALL_PARTS)).toBeNull(); // a resistor of no value
    expect(resolveItem('cd40106@5', ALL_PARTS)).toBeNull();
  });
});

describe('dragging a part off the shelf', () => {
  const transfer = () => {
    const data = new Map<string, string>();
    return { setData: (k: string, v: string) => { data.set(k, v); }, getData: (k: string) => data.get(k) ?? '', effectAllowed: 'none' } as unknown as DataTransfer;
  };

  it('carries its type and value to wherever it is dropped', () => {
    const data = transfer();
    writePartDrag(data, 'resistor', { resistance: 4700, value: '4.7kΩ' });
    expect(readPartDrag(data)).toEqual({ type: 'resistor', parameters: { resistance: 4700, value: '4.7kΩ' } });
    const part = createComponentFromDefinition(resistorDefinition, { x: 0, y: 0 }, readPartDrag(data)!.parameters);
    expect(part.parameters).toEqual({ resistance: 4700, value: '4.7kΩ' });
  });

  it('is the plain part when it carries no value', () => {
    const data = transfer();
    data.setData('application/circuit-component', 'cd40106');
    expect(readPartDrag(data)).toEqual({ type: 'cd40106', parameters: {} });
    expect(createComponentFromDefinition(resistorDefinition, { x: 0, y: 0 }).parameters).toEqual(resistorDefinition.defaultParameters);
  });

  it('ignores drags that are not parts, and parameters that are not values', () => {
    expect(readPartDrag(transfer())).toBeNull();
    const data = transfer();
    data.setData('application/circuit-component', 'resistor');
    data.setData('application/circuit-parameters', '{"resistance":220,"nested":{"a":1},"list":[1],"nothing":null}');
    expect(readPartDrag(data)!.parameters).toEqual({ resistance: 220 });
    data.setData('application/circuit-parameters', 'not json');
    expect(readPartDrag(data)).toEqual({ type: 'resistor', parameters: {} });
  });
});
