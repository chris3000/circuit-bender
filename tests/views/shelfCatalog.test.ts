/**
 * What the parts shelf holds and what a search of it finds, for the real
 * parts and for a part that says nothing about its place on the shelf.
 */
import { describe, it, expect } from 'vitest';
import { buildCatalog, groupItems, replacementsFor, resolveItem, searchCatalog, typedValueItem, type ShelfItem } from '@/views/ComponentDrawer/catalog';
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
      ['1n4004', '1n914', '2n3904', '2n3906', '2n5457', 'audio-input', 'audio-output', 'body-contact', 'cd40106', 'cd4013',
        'cd4017', 'cd4040', 'cd4049', 'cd4093', 'ground', 'junction', 'ldr', 'led', 'lm13700', 'lm324', 'lm386', 'lm741',
        'ne555', 'optocoupler', 'piezo', 'power', 'pushbutton', 'spdt', 'speaker', 'switch', 'tl072']);
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
    expect(groupItems(items).find((s) => s.category === 'active')!.count).toBe(8);
  });
});

describe('the shelf layout', () => {
  const sections = groupItems(catalog);

  it('starts with what every circuit needs', () => {
    expect(sections.map((s) => s.category)).toEqual(['power', 'passive', 'ic', 'active', 'control']);
    expect(keys(sections[0].blocks[0].items)).toEqual(['power', 'ground', 'audio-output', 'speaker', 'audio-input', 'piezo']);
  });

  it('keeps the values of a part together and stand-alone parts in runs', () => {
    const passive = sections.find((s) => s.category === 'passive')!;
    expect(passive.blocks.map((b) => (b.kind === 'values' ? b.definition.type : keys(b.items).join())))
      .toEqual(['resistor', 'capacitor', 'junction,ldr']);
    expect(passive.count).toBe(73 + 49 + 2);
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
    expect(find('schmitt')).toEqual(['cd40106', 'cd4093']);
    expect(find('op amp')).toEqual(['lm741', 'lm324', 'tl072']);
    expect(find('opamp')).toEqual(['lm741', 'lm324', 'tl072']);
    expect(find('chip')).toEqual(['cd40106', 'lm741', 'ne555', 'cd4093', 'cd4040', 'cd4017', 'lm386', 'cd4049', 'cd4013', 'lm324', 'tl072', 'lm13700']);
    expect(find('gnd')).toEqual(['ground']);
    expect(find('battery')).toEqual(['power', '1n4004']);
    expect(find('speaker')).toEqual(['audio-output', 'lm386', 'speaker', 'piezo']);
    expect(find('555')).toEqual(['ne555']);
    expect(find('divider')).toEqual(['cd4040', 'cd4017', 'cd4013']);
    expect(find('nand')).toEqual(['cd4093']);
    expect(find('button')).toEqual(['pushbutton']);
    expect(find('touch')).toEqual(['body-contact']);
    expect(find('photocell')).toEqual(['ldr', 'optocoupler']);
    expect(find('starve')).toEqual(['power']);
    expect(find('npn')).toEqual(['2n3904']);
    expect(find('2n3904')).toEqual(['2n3904']);
    expect(find('1n914')).toEqual(['1n914']);
    expect(find('LED')).toEqual(['led', 'optocoupler']);
    expect(find('toggle')).toEqual(['switch', 'spdt']);
    expect(find('pnp')).toEqual(['2n3906']);
    expect(find('jfet')).toEqual(['2n5457']);
    expect(find('vactrol')).toEqual(['optocoupler']);
    expect(find('contact mic')).toEqual(['piezo']);
    expect(find('ota')).toEqual(['lm13700']);
    expect(find('flip flop')).toEqual(['cd4013']);
    expect(find('flipflop')).toEqual(['cd4013']);
    expect(find('distortion')).toEqual(['cd4049']);
    expect(find('guitar')).toEqual(['audio-input']);
    expect(find('rectifier')).toEqual(['1n914', '1n4004']);
  });

  it('finds a whole category', () => {
    expect(find('semiconductors')).toEqual(['2n3904', '1n914', 'led', 'optocoupler', '1n4004', '2n5457', '2n3906']);
  });

  it('finds every value of a part by its name', () => {
    // every resistor, and then the pots, which are variable resistors, and the light-dependent one
    expect(find('resistor').slice(0, 73).every((k) => k.startsWith('resistor@'))).toBe(true);
    expect(find('resistor')).toHaveLength(73 + 8 + 1);
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

describe('what a part on the canvas can be swapped for', () => {
  const part = (type: string, parameters = {}) =>
    createComponentFromDefinition(ALL_PARTS.find((d) => d.type === type)!, { x: 0, y: 0 }, parameters);
  const offer = (type: string, parameters = {}) => {
    const { values, similar } = replacementsFor(part(type, parameters), ALL_PARTS);
    return { values: keys(values), similar: keys(similar) };
  };

  it('is its other common values, without the one it has', () => {
    const { values } = offer('resistor', { resistance: 4700, value: '4.7kΩ' });
    expect(values).toHaveLength(11);
    expect(values).toContain('resistor@1000');
    expect(values).not.toContain('resistor@4700');
    // A value that is not a common one leaves all the common ones on offer
    expect(offer('resistor', { resistance: 33200 }).values).toHaveLength(12);
  });

  it('is the parts like it, a valued one in the stock value nearest its own', () => {
    expect(offer('resistor', { resistance: 4700 }).similar).toEqual(['potentiometer@5000', 'ldr', 'body-contact', 'optocoupler']);
    expect(offer('resistor', { resistance: 10 }).similar[0]).toBe('potentiometer@1000');
    expect(offer('resistor', { resistance: 22e6 }).similar[0]).toBe('potentiometer@1000000');
    // Nearest by ratio: 30 kΩ is nearer 50 kΩ than 10 kΩ
    expect(offer('resistor', { resistance: 30000 }).similar[0]).toBe('potentiometer@50000');
    expect(offer('potentiometer', { maxResistance: 100000 }).similar[0]).toBe('resistor@100000');
  });

  it('pairs the parts that do the same job', () => {
    expect(offer('switch').similar).toEqual(['pushbutton', 'body-contact', 'spdt']);
    expect(offer('led').similar).toEqual(['1n914', '1n4004']);
    expect(offer('cd40106').similar).toEqual(['cd4093', 'cd4049']);
    expect(offer('cd4040').similar).toEqual(['cd4017', 'cd4013']);
    expect(offer('lm386').similar).toEqual(['lm741', 'lm324', 'tl072', 'lm13700']);
    expect(offer('speaker').similar).toEqual(['audio-output', 'piezo']);
    expect(offer('2n3904').similar).toEqual(['2n5457', '2n3906']);
  });

  it('is nothing for a part like no other', () => {
    for (const type of ['ne555', 'power', 'ground', 'capacitor', 'audio-input', 'junction']) {
      expect(offer(type).similar, type).toEqual([]);
    }
    expect(offer('ne555').values).toEqual([]);
    expect(offer('capacitor').values.length).toBeGreaterThan(0);
    expect(replacementsFor({ ...part('resistor'), type: 'unheard-of' }, ALL_PARTS)).toEqual({ values: [], similar: [] });
  });

  it('reads a typed value however it is written, stocked or not', () => {
    const typed = (text: string) => typedValueItem(resistorDefinition, ALL_PARTS, text);
    expect(typed('4k7')!.parameters).toMatchObject({ resistance: 4700, value: '4.7kΩ' });
    expect(typed('4k7')!.key).toBe('resistor@4700');
    expect(typed('33.2k')!.parameters.resistance).toBe(33200);
    expect(typedValueItem(capacitorDefinition, ALL_PARTS, '100n')!.parameters.capacitance).toBeCloseTo(1e-7, 12);
    expect(typed('banana')).toBeNull();
    expect(typed('')).toBeNull();
    expect(typedValueItem(cd40106Definition, ALL_PARTS, '4k7')).toBeNull();
  });
});
