/**
 * What every part's example has to be, whichever part it is for: there for
 * every part and every value on the shelf, built from real parts and real
 * pins, pointing at the part it is about, and said in a few plain words.
 */
import { describe, expect, it } from 'vitest';
import { PART_EXAMPLES, partExampleFor } from '@/examples/parts';
import { runOnBench } from '@/simulation/measure/bench';
import { serializeCircuit } from '@/utils/serializeCircuit';
import { MAX_PART_NAME_LENGTH } from '@/utils/partNames';
import { sameValue } from '@/utils/partValue';
import { ALL_PARTS } from '../../views/allParts';
import { definition, exampleOf, made, withParts } from './helpers';

withParts();

/** The values an example is asked for: every stocked one it answers to, or none for a part without values. */
function valuesFor(id: string): Array<number | undefined> {
  const example = PART_EXAMPLES.find((e) => e.id === id)!;
  const d = definition(example.part);
  if (!d?.value) return [undefined];
  return (d.shelf?.stock ?? []).filter((value) => exampleOf(example.part, value).example.id === id);
}

describe('every part has an example', () => {
  for (const d of ALL_PARTS) {
    it(`${d.type}${d.shelf?.stock ? `, in each of its ${d.shelf.stock.length} values` : ''}`, () => {
      for (const value of d.value ? d.shelf?.stock ?? [] : [undefined]) {
        const chosen = partExampleFor(d, value === undefined ? {} : { [d.value!.parameter]: value });
        expect(chosen, `${d.type} ${value ?? ''}`).not.toBeNull();
      }
      // ...and one for a value nobody stocks, however small or large
      if (d.value) {
        for (const odd of [1e-13, 3.14e-9, 123, 1e12]) expect(partExampleFor(d, { [d.value.parameter]: odd })).not.toBeNull();
      }
    });
  }

  it('goes with a description of the part in plain words: a sentence or two, no dashes', () => {
    for (const d of ALL_PARTS) {
      const text = d.metadata.description;
      expect(text.length, d.type).toBeGreaterThanOrEqual(40);
      expect(text.length, d.type).toBeLessThanOrEqual(260);
      expect(text, d.type).not.toMatch(/[\u2013\u2014]| - /);
      // The card and the tooltips put the full stop on
      expect(text.trim().endsWith('.'), d.type).toBe(false);
    }
  });

  it('is for a part that exists, under a name of its own', () => {
    expect(new Set(PART_EXAMPLES.map((e) => e.id)).size).toBe(PART_EXAMPLES.length);
    for (const example of PART_EXAMPLES) {
      expect(definition(example.part), example.id).toBeDefined();
      expect(example.id.startsWith(`${example.part}-`), example.id).toBe(true);
      // A value's example is only for a part that comes in values
      if (example.to !== undefined || example.only !== undefined) expect(definition(example.part).value, example.id).toBeDefined();
    }
  });

  it('is reached: none is hidden behind an earlier one for the same part', () => {
    for (const example of PART_EXAMPLES) expect(valuesFor(example.id).length, example.id).toBeGreaterThan(0);
  });
});

describe('each example', () => {
  for (const example of PART_EXAMPLES) {
    describe(example.id, () => {
      const values = () => valuesFor(example.id);

      it('is built from real parts wired by real pins, and points at the part it is about', () => {
        for (const value of values()) {
          const build = example.build(value);
          const ids = new Set(build.components.map((c) => c.id));
          expect(ids.size).toBe(build.components.length);
          for (const part of build.components) expect(definition(part.type), part.type).toBeDefined();
          for (const wire of build.connections) {
            for (const end of [wire.from, wire.to]) {
              const part = build.components.find((c) => c.id === end.componentId);
              expect(part?.pins.some((pin) => pin.id === end.pinId), `${example.id}: a wire to ${part?.type}`).toBe(true);
            }
          }
          expect(build.featured.type).toBe(example.part);
          expect(build.components).toContain(build.featured);
          // The part shown is wired in, and has the value that was asked about
          expect(build.connections.some((w) => w.from.componentId === build.featured.id || w.to.componentId === build.featured.id)).toBe(true);
          const spec = definition(example.part).value;
          if (spec && value !== undefined) {
            expect(sameValue(Number(build.featured.parameters[spec.parameter]), value), `${example.id} ${value}`).toBe(true);
          }
          for (const part of build.components) {
            if (part.label) expect(part.label.length, part.label).toBeLessThanOrEqual(MAX_PART_NAME_LENGTH);
          }
        }
      });

      it('is said in a few plain words, with something to do', () => {
        expect(example.name.length).toBeGreaterThan(2);
        expect(example.name.length).toBeLessThanOrEqual(24);
        for (const value of values()) {
          const text = exampleOf(example.part, value).description;
          expect(text).not.toMatch(/[–—]| - /);
          expect(text.length, text).toBeGreaterThan(80);
          expect(text.length, text).toBeLessThanOrEqual(520);
          expect(text.trim().endsWith('.'), text).toBe(true);
          expect(text).toContain('Press play');
          // Sentences a beginner can take in one at a time
          for (const sentence of text.split(/(?<=[.:]) /)) expect(sentence.split(' ').length, sentence).toBeLessThanOrEqual(32);
        }
      });

      it('runs', () => {
        const all = values();
        // The ends and the middle of what it is for are enough to know it runs
        for (const value of [...new Set([all[0], all[Math.floor(all.length / 2)], all[all.length - 1]])]) {
          const { circuit } = made(example.build(value));
          const { components, connections } = serializeCircuit(circuit);
          expect(() => runOnBench(components, connections, { seconds: 0.05 })).not.toThrow();
        }
      });
    });
  }
});
