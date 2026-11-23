/**
 * Keeping work: what a save contains, circuit files, and the autosave that
 * brings the canvas back after a reload.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Circuit } from '@/models/Circuit';
import {
  serializeCircuit, deserializeCircuit, exportCircuitFile, importCircuitFile, circuitFileName,
} from '@/storage/serializer';
import { readAutosave, writeAutosave } from '@/storage/autosave';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { potentiometerDefinition } from '@/components/definitions/Potentiometer';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import type { ConnectionId, NetId } from '@/types/circuit';

const KNOWN = new Set(['resistor', 'potentiometer']);

function sample(): Circuit {
  const r = createComponentFromDefinition(resistorDefinition, { x: 100, y: 100 });
  const pot = createComponentFromDefinition(potentiometerDefinition, { x: 300, y: 100 });
  pot.label = 'CUTOFF';
  pot.rotation = 90;
  pot.parameters = { ...pot.parameters, position: 0.8 };
  return new Circuit('Filter sketch')
    .addComponent(r)
    .addComponent(pot)
    .addConnection({
      id: 'w1' as ConnectionId, net: 'n1' as NetId,
      from: { componentId: r.id, pinId: r.pins[1].id },
      to: { componentId: pot.id, pinId: pot.pins[0].id },
    });
}

/** Everything about a circuit that should survive being stored. */
const essence = (c: Circuit) => ({
  id: c.id,
  name: c.name,
  parts: c.getComponents().map(({ state: _state, ...rest }) => rest),
  wires: c.getConnections(),
});

describe('a saved circuit', () => {
  it('comes back with every part as it was: name, rotation, knob position', () => {
    const circuit = sample();
    const restored = deserializeCircuit(serializeCircuit(circuit));
    expect(essence(restored)).toEqual(essence(circuit));
    expect(restored.getComponents()[1].label).toBe('CUTOFF');
  });
});

describe('circuit files', () => {
  it('are readable JSON that opens as the same circuit', () => {
    const circuit = sample();
    const text = exportCircuitFile(circuit);
    expect(JSON.parse(text).format).toBe('circuit-bender');
    expect(text).toContain('"CUTOFF"');
    expect(essence(importCircuitFile(text, KNOWN))).toEqual(essence(circuit));
  });

  it('are named after the circuit', () => {
    expect(circuitFileName('MFOS Weird Sound Generator')).toBe('mfos-weird-sound-generator.circuit.json');
    expect(circuitFileName('  ¡!  ')).toBe('circuit.circuit.json');
  });

  it('give a part its runtime state back', () => {
    const part = importCircuitFile(exportCircuitFile(sample()), KNOWN).getComponents()[0];
    expect(part.state.voltages).toBeInstanceOf(Map);
  });

  const broken = (change: (data: any) => void): string => {
    const data = JSON.parse(exportCircuitFile(sample()));
    change(data);
    return JSON.stringify(data);
  };

  it.each([
    ['text that is not JSON', 'not json at all', /not valid JSON/],
    ['some other JSON', '{"hello":"world"}', /not a Circuit Bender file/],
    ['a file from a newer version', broken((d) => { d.version = '9.0'; }), /cannot read \(9\.0\)/],
    ['a part of a kind this app does not have', broken((d) => { d.circuit.components[0][1].type = 'theremin'; }), /"theremin"/],
    ['a part with no position', broken((d) => { delete d.circuit.components[0][1].position; }), /a part is incomplete/],
    ['a part filed under the wrong id', broken((d) => { d.circuit.components[0][0] = 'other'; }), /a part is incomplete/],
    ['a wire to a part that is not there', broken((d) => { d.circuit.connections[0].to.componentId = 'ghost'; }), /a wire goes to a part/],
    ['a wire to a pin the part does not have', broken((d) => { d.circuit.connections[0].to.pinId = 'pin_99'; }), /a wire goes to a part/],
    ['no list of parts', broken((d) => { delete d.circuit.components; }), /damaged/],
  ])('refuse %s, saying why', (_what, text, message) => {
    expect(() => importCircuitFile(text, KNOWN)).toThrow(message);
  });
});

describe('autosave', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });

  it('brings back the circuit that was on the canvas, and whether it had unsaved changes', () => {
    const circuit = sample();
    writeAutosave(circuit, true);
    const restored = readAutosave()!;
    expect(essence(restored.circuit)).toEqual(essence(circuit));
    expect(restored.dirty).toBe(true);

    writeAutosave(circuit, false);
    expect(readAutosave()!.dirty).toBe(false);
  });

  it('has nothing to bring back from a first visit or an emptied canvas', () => {
    expect(readAutosave()).toBeNull();
    writeAutosave(new Circuit('Untitled Circuit'), false);
    expect(readAutosave()).toBeNull();
  });

  it('shrugs off storage that is missing, broken or full', () => {
    localStorage.setItem('circuit_bender_autosave', 'garbage');
    expect(readAutosave()).toBeNull();

    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    });
    expect(() => writeAutosave(sample(), true)).not.toThrow();
    expect(readAutosave()).toBeNull();

    vi.stubGlobal('localStorage', undefined);
    expect(() => writeAutosave(sample(), true)).not.toThrow();
    expect(readAutosave()).toBeNull();
  });
});
