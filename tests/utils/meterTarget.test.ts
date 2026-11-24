import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { meterTargetOf, sameTarget } from '@/utils/meterTarget';
import { playbackWarnings } from '@/utils/circuitChecks';
import { classCircuit } from '@/classes';
import { theLoop } from '@/classes/theLoop';
import { connect, place, resistor } from '@/examples/circuits';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

describe('meterTargetOf', () => {
  const a = () => resistor(100, 0, 0);

  it('reads a single wire as the voltage of a pin on it', () => {
    const r1 = a(), r2 = a(), wire = connect(r1, 1, r2, 0);
    const circuit = new Circuit('c').addComponent(r1).addComponent(r2).addConnection(wire);
    expect(meterTargetOf(circuit, [], [wire.id])).toEqual({ componentId: r1.id, pinId: r1.pins[1].id });
  });

  it('reads a single part with two legs as that part', () => {
    const r = a(), led = place('led', 0, 0);
    const circuit = new Circuit('c').addComponent(r).addComponent(led);
    expect(meterTargetOf(circuit, [r.id], [])).toEqual({ componentId: r.id });
    expect(meterTargetOf(circuit, [led.id], [])).toEqual({ componentId: led.id });
  });

  it('reads a junction as the voltage where its wires meet', () => {
    const j = place('junction', 0, 0);
    expect(meterTargetOf(new Circuit('c').addComponent(j), [j.id], [])).toEqual({ componentId: j.id, pinId: j.pins[0].id });
  });

  it('reads nothing off a chip, several things at once, or something that has gone', () => {
    const r1 = a(), r2 = a(), chip = place('cd40106', 0, 0), wire = connect(r1, 1, r2, 0);
    const circuit = new Circuit('c').addComponent(r1).addComponent(r2).addComponent(chip).addConnection(wire);
    expect(meterTargetOf(circuit, [chip.id], [])).toBeNull();
    expect(meterTargetOf(circuit, [r1.id, r2.id], [])).toBeNull();
    expect(meterTargetOf(circuit, [r1.id], [wire.id])).toBeNull();
    expect(meterTargetOf(circuit, [], [])).toBeNull();
    expect(meterTargetOf(circuit, ['gone'], [])).toBeNull();
    expect(meterTargetOf(circuit, [], ['gone'])).toBeNull();
  });

  it('knows the same target when it sees it', () => {
    expect(sameTarget({ componentId: 'a' }, { componentId: 'a' })).toBe(true);
    expect(sameTarget({ componentId: 'a', pinId: 'p' }, { componentId: 'a', pinId: 'p' })).toBe(true);
    expect(sameTarget({ componentId: 'a', pinId: 'p' }, { componentId: 'a' })).toBe(false);
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget(null, { componentId: 'a' })).toBe(false);
  });
});

describe('a circuit with a light and no sound', () => {
  it('is not told it has no audio output', () => {
    expect(playbackWarnings(classCircuit(theLoop))).toEqual([]);
  });
});
