/**
 * A part is two things that must agree: its definition (how it looks, where
 * its pins are, what the player can touch) and its model (how it behaves).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createStandardModels } from '@/simulation/models/standardModels';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { LIVE_PARAMETERS } from '@/audio/AudioEngine';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import type { ComponentCover } from '@/types/circuit';
import { ALL_PARTS } from '../../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

const covers = (cover: ComponentCover | ComponentCover[] | undefined) => (cover ? (Array.isArray(cover) ? cover : [cover]) : []);

describe('every part', () => {
  it.each(ALL_PARTS.map((d) => d.type))('%s has a model', (type) => {
    expect(createStandardModels().has(type)).toBe(true);
  });

  it.each(ALL_PARTS.map((d) => d.type))('%s says its unwired legs float exactly when its model leaves them out', (type) => {
    const definition = ALL_PARTS.find((d) => d.type === type)!;
    const model = createStandardModels().create(type)!;
    expect(definition.floatingPins === true).toBe(model.ignoresUnconnectedPins === true);
  });

  it.each(ALL_PARTS.map((d) => d.type))('%s loads into the solver on its own without upsetting it', (type) => {
    const definition = ALL_PARTS.find((d) => d.type === type)!;
    const part = createComponentFromDefinition(definition, { x: 0, y: 0 });
    const solver = new MNASolver(createStandardModels());
    solver.loadCircuit([{
      id: part.id, type: part.type, pins: part.pins.map((p) => ({ id: p.id, label: p.label, type: p.type })),
      parameters: { ...part.parameters },
    }] as never, []);
    for (let i = 0; i < 100; i++) expect(Number.isFinite(solver.step(1 / 48000))).toBe(true);
  });

  it('sends everything the player can move to the running simulation, rather than restarting it', () => {
    for (const definition of ALL_PARTS) {
      const live = LIVE_PARAMETERS[definition.type] ?? [];
      for (const cover of covers(definition.cover)) {
        if (cover.parameter) expect(live, `${definition.type} cover ${cover.control}`).toContain(cover.parameter);
      }
      if (definition.control) expect(live, `${definition.type} control`).toContain(definition.control.parameter);
    }
  });

  it('has a model that takes each of its live parameters', () => {
    for (const [type, parameters] of Object.entries(LIVE_PARAMETERS)) {
      const definition = ALL_PARTS.find((d) => d.type === type);
      expect(definition, type).toBeDefined();
      const model = createStandardModels().create(type)!;
      expect(typeof model.updateParam, type).toBe('function');
      for (const parameter of parameters) expect(parameter.length).toBeGreaterThan(0);
    }
  });
});

describe('the parts that are held', () => {
  it('start let go', () => {
    for (const type of ['pushbutton', 'body-contact']) {
      const definition = ALL_PARTS.find((d) => d.type === type)!;
      const part = createComponentFromDefinition(definition, { x: 0, y: 0 });
      expect(definition.control?.kind).toBe('hold');
      expect(Number(part.parameters[definition.control!.parameter] ?? 0)).toBe(0);
    }
  });

  it('have a dial where the definition says, at rest where the part starts', () => {
    for (const type of ['power', 'ldr']) {
      const definition = ALL_PARTS.find((d) => d.type === type)!;
      const part = createComponentFromDefinition(definition, { x: 0, y: 0 });
      expect(definition.control?.kind).toBe('dial');
      expect(part.parameters[definition.control!.parameter]).toBe(definition.control!.rest);
    }
  });
});
