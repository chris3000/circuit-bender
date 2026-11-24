import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { exampleCircuits } from '@/examples/circuits';
import { coverLayout, isCoverInput, PANEL, type CoverItem } from '@/views/Cover/coverLayout';
import { plateTitle } from '@/views/Cover/PanelArt';
import { segmentsLit } from '@/views/Cover/CoverControls';
import type { Component } from '@/types/circuit';
import { ALL_PARTS } from './allParts';

function part(type: string, label?: string): Component {
  const component = createComponentFromDefinition(ComponentRegistry.getInstance().get(type)!, { x: 0, y: 0 });
  if (label) component.label = label;
  return component;
}
const parts = (...types: string[]) => types.map((t) => part(t));
const names = (items: CoverItem[]) => items.map((i) => i.name);
const overlap = (a: CoverItem, b: CoverItem) =>
  a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01 && a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01;

/** Everything on the panel is inside the face's margins and nothing lies on anything else. */
function expectTidy(components: Component[]) {
  const layout = coverLayout(components);
  const left = layout.face.left + PANEL.margin, right = layout.face.right - PANEL.margin;
  for (const item of layout.items) {
    expect(item.x).toBeGreaterThanOrEqual(left - 0.01);
    expect(item.x + item.width).toBeLessThanOrEqual(right + 0.01);
    expect(item.y).toBeGreaterThanOrEqual(PANEL.header);
    expect(item.y + item.height).toBeLessThanOrEqual(layout.height - PANEL.footer + 0.01);
  }
  for (let i = 0; i < layout.items.length; i++) {
    for (let j = i + 1; j < layout.items.length; j++) {
      expect(overlap(layout.items[i], layout.items[j]), `${layout.items[i].name} on ${layout.items[j].name}`).toBe(false);
    }
  }
  return layout;
}

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

describe('what is on the cover', () => {
  it('is the knobs, switches, buttons, touch plates, lights, supply and speakers, and nothing else', () => {
    const layout = coverLayout(ALL_PARTS.map((d) => part(d.type)));
    expect(layout.items.map((i) => `${i.component.type}:${i.control}`).sort()).toEqual([
      'audio-input:knob', 'audio-output:speaker', 'body-contact:pad', 'ldr:knob', 'led:lamp', 'piezo:button', 'potentiometer:knob',
      'power:knob', 'power:pilot', 'pushbutton:button', 'spdt:toggle', 'speaker:speaker', 'switch:toggle',
    ]);
    expect(new Set(layout.items.map((i) => i.id)).size).toBe(layout.items.length);
  });

  it('shows the audio output as a speaker, or as a socket once its signal goes somewhere else', () => {
    const out = part('audio-output');
    expect(coverLayout([out]).items.map((i) => i.control)).toEqual(['speaker']);
    out.parameters = { ...out.parameters, destination: 'line' };
    expect(coverLayout([out]).items.map((i) => i.control)).toEqual(['jack']);
    expect(coverLayout([out]).items[0].name).toBe('OUT');
  });

  it('gives the supply a starve knob that keeps its own name', () => {
    const layout = coverLayout([part('power', 'Battery'), part('potentiometer', 'Pitch')]);
    expect(layout.items.map((i) => [i.control, i.name, i.named])).toEqual([
      ['knob', 'Pitch', true], ['knob', 'STARVE', true], ['pilot', 'Battery', true],
    ]);
    expect(layout.items[1].cover).toMatchObject({ parameter: 'starve', fixedName: true });
    const two = coverLayout([part('power'), part('power')]);
    expect(names(two.items)).toEqual(['STARVE 1', 'STARVE 2', 'POWER 1', 'POWER 2']);
  });

  it('comes from the definitions, not from a list of known parts', () => {
    const theremin = { ...part('resistor'), type: 'theremin' };
    const lookup = (type: string) => (type === 'theremin'
      ? { ...ComponentRegistry.getInstance().get('resistor')!, type, cover: { control: 'knob' as const, parameter: 'wave', name: 'WAVE' } }
      : ComponentRegistry.getInstance().get(type));
    const layout = coverLayout([theremin, part('resistor')], lookup);
    expect(layout.items).toHaveLength(1);
    expect(layout.items[0]).toMatchObject({ control: 'knob', name: 'WAVE' });
  });

  it('calls a part by its name, or by its kind until it has one', () => {
    const layout = coverLayout([part('potentiometer', 'Cutoff'), part('potentiometer'), part('potentiometer', '  '), part('switch'), part('led')]);
    expect(names(layout.items)).toEqual(['Cutoff', 'KNOB 2', 'KNOB 3', 'SWITCH', 'LED']);
    expect(layout.items.map((i) => i.named)).toEqual([true, false, false, false, false]);
  });

  it('prints the supply voltage by the pilot light', () => {
    const supply = part('power');
    supply.parameters = { ...supply.parameters, voltage: 12 };
    expect(coverLayout([supply]).items.find((i) => i.control === 'pilot')).toMatchObject({ name: 'POWER', detail: '12V DC' });
  });

  it('knows inputs from outputs', () => {
    expect(['knob', 'toggle', 'button', 'pad', 'lamp', 'pilot', 'jack', 'speaker'].filter((c) => isCoverInput(c as CoverItem['control'])))
      .toEqual(['knob', 'toggle', 'button', 'pad']);
  });
});

describe('laying the cover out', () => {
  it('puts knobs across the top, switches bottom left and outputs bottom right', () => {
    const layout = expectTidy(parts('audio-output', 'led', 'body-contact', 'switch', 'potentiometer', 'pushbutton', 'power', 'potentiometer', 'switch'));
    const of = (control: string) => layout.items.filter((i) => i.control === control);
    const knobRow = of('knob')[0].y;
    expect(of('knob').every((k) => k.y === knobRow)).toBe(true);
    const lower = of('toggle')[0].y;
    expect(lower).toBe(knobRow + PANEL.knob.height);
    expect(layout.items.filter((i) => i.control !== 'knob').every((i) => i.y === lower)).toBe(true);
    // Switches, buttons and touch plates from the left margin, then lights, pilot light and speaker ending at the right margin
    const row = layout.items.filter((i) => i.control !== 'knob').sort((a, b) => a.x - b.x);
    expect(row.map((i) => i.control)).toEqual(['toggle', 'toggle', 'button', 'pad', 'lamp', 'pilot', 'speaker']);
    expect(row[0].x).toBe(layout.face.left + PANEL.margin);
    expect(row[6].x + row[6].width).toBeCloseTo(layout.face.right - PANEL.margin, 5);
    expect(layout.divider).toBe(lower);
    expect(layout.split!.x).toBeGreaterThan(row[3].x + row[3].width);
    expect(layout.split!.x).toBeLessThan(row[4].x);
  });

  it('keeps parts of a kind in the order they are in the circuit', () => {
    const layout = coverLayout([part('potentiometer', 'B'), part('switch', 'Y'), part('potentiometer', 'A'), part('switch', 'X')]);
    const inOrder = (control: string) => layout.items.filter((i) => i.control === control).sort((a, b) => a.x - b.x).map((i) => i.name);
    expect(inOrder('knob')).toEqual(['B', 'A']);
    expect(inOrder('toggle')).toEqual(['Y', 'X']);
  });

  it('spreads a row of knobs evenly across the panel', () => {
    const layout = coverLayout(parts('potentiometer', 'potentiometer', 'potentiometer'));
    const [a, b, c] = layout.items;
    const left = layout.face.left + PANEL.margin, right = layout.face.right - PANEL.margin;
    const gap = a.x - left;
    expect(gap).toBeGreaterThan(0);
    expect(b.x - (a.x + a.width)).toBeCloseTo(gap, 5);
    expect(c.x - (b.x + b.width)).toBeCloseTo(gap, 5);
    expect(right - (c.x + c.width)).toBeCloseTo(gap, 5);
  });

  it('has no dividing lines when there is nothing to divide', () => {
    expect(coverLayout(parts('potentiometer'))).toMatchObject({ divider: null, split: null });
    expect(coverLayout(parts('switch', 'switch'))).toMatchObject({ divider: null, split: null });
  });

  it('breaks many knobs into even rows', () => {
    const layout = expectTidy(parts(...Array(7).fill('potentiometer')));
    const rows = new Map<number, number>();
    for (const item of layout.items) rows.set(item.y, (rows.get(item.y) ?? 0) + 1);
    expect([...rows.values()]).toEqual([4, 3]);
  });

  it('stays tidy however much is on it', () => {
    expectTidy(parts(...Array(23).fill('potentiometer'), ...Array(17).fill('switch'), ...Array(5).fill('pushbutton'), ...Array(4).fill('body-contact'),
      ...Array(9).fill('led'), 'power', 'audio-output', 'audio-output', 'speaker', 'ldr'));
    const wide = expectTidy(parts(...Array(40).fill('switch')));
    expect(wide.width).toBeLessThanOrEqual(PANEL.maxContent + 2 * (PANEL.margin + PANEL.cheek));
  });

  it('gives a long name the room it needs', () => {
    const long = 'A'.repeat(24);
    const layout = expectTidy([part('switch', long), part('switch', 'B'), part('led', long), part('audio-output')]);
    const [first, second] = layout.items;
    expect(first.width).toBeGreaterThan(second.width);
    expect(second.width).toBe(PANEL.toggle);
  });

  it('is never smaller than a nameplate needs, even with nothing on it', () => {
    const empty = coverLayout([]);
    expect(empty.items).toEqual([]);
    expect(empty.width).toBe(PANEL.minContent + 2 * (PANEL.margin + PANEL.cheek));
    expect(empty.height).toBe(PANEL.header + PANEL.row + PANEL.footer);
    expect(coverLayout(parts('resistor', 'capacitor', 'ground')).items).toEqual([]);
  });

  it.each(exampleCircuits.map((e) => e.name))('%s: a tidy cover with at least one input and one output', (name) => {
    const layout = expectTidy(exampleCircuits.find((e) => e.name === name)!.build().components);
    expect(layout.items.filter((i) => isCoverInput(i.control)).length).toBeGreaterThanOrEqual(1);
    expect(layout.items.filter((i) => !isCoverInput(i.control)).length).toBeGreaterThanOrEqual(1);
    expect(layout.items.every((i) => i.control === 'pilot' || i.control === 'speaker' || i.control === 'lamp' || i.named)).toBe(true);
  });

  it('lays the Weird Sound Generator out as its panel', () => {
    const layout = coverLayout(exampleCircuits.find((e) => e.name.includes('Weird'))!.build().components);
    expect(names(layout.items)).toEqual(['WACKY', 'ZANY', 'ZANINESS', 'WEIRD', 'ODDNESS', 'STARVE', 'WACKINESS', 'POWER', 'OUT']);
  });
});

describe('the nameplate', () => {
  it('engraves the name in capitals', () => {
    expect(plateTitle('Pitch Control', 400)).toBe('PITCH CONTROL');
    expect(plateTitle('   ', 400)).toBe('UNTITLED');
  });

  it('cuts a name that is too long for the plate', () => {
    const cut = plateTitle('The longest name anyone has ever given a circuit', 200);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(15);
    expect('THE LONGEST NAME ANYONE HAS EVER GIVEN A CIRCUIT'.startsWith(cut.slice(0, -1))).toBe(true);
  });
});

describe('the level meter', () => {
  it('is dark in silence and full for a rail-to-rail swing', () => {
    expect(segmentsLit(0)).toBe(0);
    expect(segmentsLit(0.001)).toBe(0);
    expect(segmentsLit(0.5)).toBe(8);
    expect(segmentsLit(3)).toBe(8);
  });

  it('gains a segment every 3 dB', () => {
    const at = (db: number) => segmentsLit(0.5 * 10 ** (db / 20));
    expect([-21, -18, -12, -6, -3].map(at)).toEqual([1, 2, 4, 6, 7]);
    expect(at(-22)).toBe(0);
  });
});
