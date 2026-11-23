import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { resistorBands } from '@/components/art/resistorBands';
import { capacitorCode, capacitorKind } from '@/components/art/partArt';
import { LED_DOME_CENTRE } from '@/components/art/boardArt';
import { knobPositionAt, KNOB_MIN_ANGLE, KNOB_SWEEP } from '@/components/art/knob';
import type { ComponentDefinition, ComponentParameters } from '@/types/circuit';
import { ALL_PARTS } from '../views/allParts';

const draw = (node: ReactNode) => render(<svg>{node}</svg>).container.querySelector('svg')!;
const part = (type: string) => ALL_PARTS.find((d) => d.type === type)!;
const board = (type: string, params: ComponentParameters = {}) =>
  draw(part(type).board.symbol.render({ ...part(type).defaultParameters, ...params }));
const shelf = (type: string, params: ComponentParameters = {}) =>
  draw(part(type).shelf!.art!({ ...part(type).defaultParameters, ...params }));
const num = (el: Element, name: string) => Number(el.getAttribute(name));
/** Every fill used in a drawing, in order, without the leads and lettering. */
const fills = (svg: Element) => [...svg.querySelectorAll('rect, circle, path')].map((el) => el.getAttribute('fill')).filter((f) => f && f !== 'none');

/** Whether the drawing has a lead that starts at this point, or a leg that covers it. */
function reaches(svg: Element, x: number, y: number): boolean {
  const lead = [...svg.querySelectorAll('line')].some((line) => num(line, 'x1') === x && num(line, 'y1') === y);
  const leg = [...svg.querySelectorAll('rect')].some((rect) =>
    num(rect, 'x') <= x && x <= num(rect, 'x') + num(rect, 'width') && num(rect, 'y') <= y && y <= num(rect, 'y') + num(rect, 'height'));
  return lead || leg;
}

describe('parts on the board', () => {
  it.each(ALL_PARTS.filter((d) => d.type !== 'junction').map((d) => [d.type, d] as [string, ComponentDefinition]))(
    '%s: a lead runs to every pin, where the schematic has it', (_type, definition) => {
      const svg = draw(definition.board.symbol.render(definition.defaultParameters));
      for (const pin of definition.pins) {
        expect(reaches(svg, pin.position.x, pin.position.y), `pin ${pin.label} at ${pin.position.x},${pin.position.y}`).toBe(true);
      }
    });

  it.each([100, 4700, 27e3, 1e6])('a %d Ω resistor has the bands it has on the shelf', (resistance) => {
    const bands = resistorBands(resistance);
    const onBoard = [...board('resistor', { resistance }).querySelectorAll('rect')].slice(0, 4).map((r) => r.getAttribute('fill'));
    const onShelf = [...shelf('resistor', { resistance }).querySelectorAll('rect')].slice(0, 4).map((r) => r.getAttribute('fill'));
    expect(onBoard).toEqual(bands);
    expect(onBoard).toEqual(onShelf);
  });

  it.each([
    [100e-12, 'ceramic'], [4.7e-9, 'ceramic'], [10e-9, 'film'], [100e-9, 'film'], [1e-6, 'electrolytic'], [220e-6, 'electrolytic'],
  ] as const)('a %d F capacitor is the same kind of capacitor as on the shelf (%s)', (capacitance, kind) => {
    expect(capacitorKind(capacitance)).toBe(kind);
    const onBoard = board('capacitor', { capacitance, value: 'x' });
    const onShelf = shelf('capacitor', { capacitance });
    // The body is the shelf's; on the board a green one also gets an edge to be seen by
    expect(fills(onBoard)).toEqual(fills(onShelf));
    if (kind !== 'electrolytic') expect(onBoard.textContent).toContain(capacitorCode(capacitance));
    expect(onBoard.querySelectorAll('rect[stroke="#CFEBDB"]')).toHaveLength(kind === 'film' ? 1 : 0);
  });

  it.each(['led', '1n914', '2n3904', 'switch', 'audio-output', 'ground'])('%s is drawn in the colours it has on the shelf', (type) => {
    const onBoard = new Set(fills(board(type)));
    for (const fill of fills(shelf(type))) {
      // Lugs and spare leads are the only things the shelf has that the board does not
      if (fill === '#C4C8CC') continue;
      expect(onBoard.has(fill), `${type} ${fill}`).toBe(true);
    }
  });

  it('prints values beside the parts that have one', () => {
    expect(board('resistor', { value: '4.7k' }).textContent).toContain('4.7k');
    expect(board('capacitor', { value: '100nF' }).textContent).toContain('100nF');
    expect(board('power', { voltage: 12 }).textContent).toContain('12V');
    expect(board('switch', { closed: 1 }).textContent).toContain('ON');
    expect(board('switch', { closed: 0 }).textContent).toContain('OFF');
    expect(board('cd40106').textContent).toContain('CD40106');
    expect(board('lm741').textContent).toContain('LM741');
    expect(board('2n3904').textContent).toBe('2N3904');
  });

  it('marks the legs a chip does not use', () => {
    expect(board('lm741').querySelectorAll('rect title')).toHaveLength(3);
    expect(board('cd40106').querySelectorAll('rect title')).toHaveLength(0);
  });

  it('shows where a potentiometer is set', () => {
    const reading = (position: number) => board('potentiometer', { position, maxResistance: 100e3, value: '100k' }).textContent;
    expect(reading(0.5)).toContain('50kΩ');
    expect(reading(0.5)).toContain('100k');
    expect(reading(1)).toContain('100kΩ');
    const pointer = (position: number) => {
      const line = [...board('potentiometer', { position }).querySelectorAll('line[stroke="#FF2D55"]')].at(-1)!;
      return Math.round(Math.atan2(num(line, 'y2'), num(line, 'x2')) * 180 / Math.PI);
    };
    expect(pointer(0.5)).toBe(-90); // half way: straight up
    expect(pointer(0)).toBe(135);   // 7:30
    expect(pointer(1)).toBe(45);    // 4:30
  });

  it('stands the LED with its dome above its pins', () => {
    expect(LED_DOME_CENTRE).toBeLessThan(0);
    expect([...board('led').querySelectorAll('g')].some((g) => g.getAttribute('transform')?.includes('rotate(90)'))).toBe(true);
  });
});

describe('the dial', () => {
  it('reads a pointer position round the sweep', () => {
    expect(knobPositionAt(0, -10)).toBeCloseTo(0.5, 6);
    expect(knobPositionAt(-10, 10)).toBeCloseTo(0, 6);
    expect(knobPositionAt(10, 10)).toBeCloseTo(1, 6);
    expect(knobPositionAt(10, 0)).toBeCloseTo((0 - KNOB_MIN_ANGLE) / KNOB_SWEEP, 6);
  });

  it('holds the nearer end in the gap at the bottom', () => {
    expect(knobPositionAt(-1, 10)).toBe(0);
    expect(knobPositionAt(1, 10)).toBe(1);
  });

  it('allows for a dial drawn turned with its part', () => {
    expect(knobPositionAt(10, 0, 90)).toBeCloseTo(0.5, 6);
  });
});
