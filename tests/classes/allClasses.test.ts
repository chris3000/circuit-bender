/**
 * What every class must keep to, whatever it teaches: its place in the
 * course, the rules for its text, and steps that cannot be ticked by an
 * empty canvas. Each class's own test measures what it says.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { CLASSES, classCircuit, classStage, classStart } from '@/classes';
import { SYLLABUS } from '@/classes/syllabus';
import { Work } from '@/classes/Work';
import type { ClassDefinition } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

/** Everything a class says that does not depend on the learner's circuit. */
function texts(lesson: ClassDefinition): string[] {
  return [
    lesson.title, lesson.promise, lesson.startsFrom,
    ...[...lesson.build, ...lesson.keep].flatMap((step) => [step.text, ...(step.how === undefined ? [] : [step.how])]),
    ...lesson.why.flatMap((paragraph) => [paragraph.title, paragraph.text]),
    ...lesson.tries.flatMap((experiment) => [experiment.title, experiment.question, experiment.change, ...experiment.options]),
    lesson.check.goal, lesson.check.hint,
    ...lesson.words.flatMap((entry) => [entry.word, entry.meaning]),
  ];
}

describe('the course', () => {
  it('has every class of the syllabus built, in order', () => {
    const entries = SYLLABUS.flatMap((unit) => unit.classes.map((entry) => ({ ...entry, unit: unit.title })));
    expect(entries.map((entry) => entry.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(CLASSES.map((lesson) => lesson.number)).toEqual(entries.map((entry) => entry.number));
    for (const lesson of CLASSES) {
      const entry = entries.find((e) => e.id === lesson.id)!;
      expect(entry, lesson.id).toBeDefined();
      expect([lesson.number, lesson.title, lesson.unit]).toEqual([entry.number, entry.title, entry.unit]);
    }
  });
});

describe.each(CLASSES.map((lesson) => [`class ${lesson.number}, ${lesson.title}`, lesson] as const))('%s', (_, lesson) => {
  it('has all six parts, of a size to be taken in one sitting', () => {
    expect(lesson.build.length).toBeGreaterThanOrEqual(5);
    expect(lesson.build.length).toBeLessThanOrEqual(16);
    expect(lesson.why.length).toBeGreaterThanOrEqual(3);
    expect(lesson.tries.length).toBeGreaterThanOrEqual(3);
    expect(lesson.keep.length).toBeGreaterThanOrEqual(2);
    expect(lesson.words.length).toBeGreaterThanOrEqual(3);
    expect(lesson.check.goal).not.toBe('');
    expect(lesson.check.hint).not.toBe('');
  });

  it('says everything in short plain text, without dashes', () => {
    for (const text of texts(lesson)) {
      expect(text.trim(), 'an empty text').not.toBe('');
      expect(text, text).not.toMatch(/[‒-―]| - | -- /);
    }
  });

  it('gives every step and experiment a name of its own, and every question its answer', () => {
    const steps = [...lesson.build, ...lesson.keep].map((step) => step.id);
    expect(new Set(steps).size).toBe(steps.length);
    const tries = lesson.tries.map((experiment) => experiment.id);
    expect(new Set(tries).size).toBe(tries.length);
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThanOrEqual(2);
      expect(experiment.options.length).toBeLessThanOrEqual(4);
      expect(experiment.options[experiment.answer], experiment.id).toBeDefined();
    }
  });

  it('has its part-way circuits at real steps, in the order of the build', () => {
    const order = lesson.build.map((step) => step.id);
    const places = (lesson.stages ?? []).map((stage) => order.indexOf(stage.upTo));
    for (const place of places) expect(place).toBeGreaterThanOrEqual(0);
    expect(places).toEqual([...places].sort((a, b) => a - b));
    expect(new Set(places).size).toBe(places.length);
  });

  it('builds what it starts from, each part-way circuit and the finished one, every wire on real pins', () => {
    const circuits = [classStart(lesson), classCircuit(lesson), ...lesson.build.map((_, i) => classStage(lesson, lesson.build.slice(0, i).map((s) => s.id)))];
    for (const circuit of circuits) {
      const pins = new Set(circuit.getComponents().flatMap((part) => part.pins.map((pin) => `${part.id}::${pin.id}`)));
      for (const wire of circuit.getConnections()) {
        expect(pins.has(`${wire.from.componentId}::${wire.from.pinId}`)).toBe(true);
        expect(pins.has(`${wire.to.componentId}::${wire.to.pinId}`)).toBe(true);
      }
    }
    expect(classCircuit(lesson).getComponents().length).toBeGreaterThan(0);
    if (!lesson.start) expect(classStart(lesson).getComponents()).toHaveLength(0);
  });

  it('ticks nothing on an empty canvas', () => {
    const work = new Work(new Circuit('empty'));
    expect([...lesson.build, ...lesson.keep].filter((step) => step.done(work)).map((step) => step.id)).toEqual([]);
    expect(lesson.tries.filter((experiment) => experiment.made(work)).map((experiment) => experiment.id)).toEqual([]);
    expect(lesson.check.passed(work)).toBe(false);
    expect(lesson.check.reading(work)).toBeNull();
  });

  it('does not count what it starts from as its own work', () => {
    const work = new Work(classStart(lesson));
    expect(lesson.tries.filter((experiment) => experiment.made(work)).map((experiment) => experiment.id)).toEqual([]);
    expect(lesson.check.passed(work)).toBe(false);
    expect(lesson.keep.filter((step) => step.done(work)).map((step) => step.id)).toEqual([]);
  });

  it('has its whole build done by its finished circuit, apart from what must be done by hand', () => {
    // Playing, probing, selecting and holding are the learner's; everything else the circuit shows
    const still: string[] = lesson.build.filter((step) => !step.done(new Work(classCircuit(lesson)))).map((step) => step.id);
    const playing = { playing: true, saved: false, view: 'schematic' as const, selected: [] };
    const withPlay = lesson.build.filter((step) => !step.done(new Work(classCircuit(lesson), playing))).map((step) => step.id);
    expect(withPlay.length).toBeLessThanOrEqual(still.length);
    expect(withPlay.length).toBeLessThan(lesson.build.length);
  });
});
