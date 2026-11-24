/**
 * The canvas's copy of the circuit: what a drag, a knob turn and a selection
 * do to the undo history and to the nodes React Flow is given.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { potentiometerDefinition } from '@/components/definitions/Potentiometer';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { useCircuitSync } from '@/views/CircuitCanvas/useCircuitSync';
import type { ComponentId } from '@/types/circuit';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.register(resistorDefinition);
  registry.register(potentiometerDefinition);
});

const wrapper = ({ children }: { children: ReactNode }) => <CircuitProvider>{children}</CircuitProvider>;

function setup(viewMode: 'schematic' | 'board' = 'schematic') {
  const hook = renderHook(
    ({ mode, leds }: { mode: 'schematic' | 'board'; leds: Record<string, number> }) =>
      ({ circuit: useCircuit(), sync: useCircuitSync(mode, leds) }),
    { wrapper, initialProps: { mode: viewMode, leds: {} } },
  );
  const r1 = createComponentFromDefinition(resistorDefinition, { x: 100, y: 100 });
  const r2 = createComponentFromDefinition(resistorDefinition, { x: 300, y: 100 });
  const pot = createComponentFromDefinition(potentiometerDefinition, { x: 200, y: 300 });
  act(() => {
    hook.result.current.circuit.addComponent(r1);
    hook.result.current.circuit.addComponent(r2);
    hook.result.current.circuit.addComponent(pot);
  });
  // React Flow reports each node's size once it has drawn it
  act(() => {
    hook.result.current.sync.onNodesChange(
      [r1, r2, pot].map((c) => ({ id: c.id, type: 'dimensions' as const, dimensions: { width: 60, height: 20 } })),
    );
  });
  const position = (id: ComponentId) => hook.result.current.circuit.circuit.getComponent(id)!.position;
  const undoAll = () => {
    let steps = 0;
    while (hook.result.current.circuit.canUndo) { act(() => hook.result.current.circuit.undo()); steps++; }
    return steps;
  };
  return { hook, r1, r2, pot, position, undoAll };
}

describe('moving parts', () => {
  it('moves the part on screen during a drag and the circuit once, when it ends', () => {
    const { hook, r1, position } = setup();
    const node = () => hook.result.current.sync.nodes.find((n) => n.id === r1.id)!;

    for (const x of [120, 140, 160]) {
      act(() => hook.result.current.sync.onNodesChange([{ id: r1.id, type: 'position', position: { x, y: 100 }, dragging: true }]));
    }
    expect(node().position).toEqual({ x: 160, y: 100 });
    expect(position(r1.id)).toEqual({ x: 100, y: 100 });

    act(() => hook.result.current.sync.onNodeDragStop(null, node(), [node()]));
    expect(position(r1.id)).toEqual({ x: 160, y: 100 });
  });

  it('makes a drag of several parts a single undo step', () => {
    const { hook, r1, r2, position } = setup();

    act(() => hook.result.current.sync.onSelectionDragStop(null, [
      { id: r1.id, position: { x: 140, y: 160 }, data: {} },
      { id: r2.id, position: { x: 340, y: 160 }, data: {} },
    ]));
    expect(position(r1.id)).toEqual({ x: 140, y: 160 });
    expect(position(r2.id)).toEqual({ x: 340, y: 160 });

    act(() => hook.result.current.circuit.undo());
    expect(position(r1.id)).toEqual({ x: 100, y: 100 });
    expect(position(r2.id)).toEqual({ x: 300, y: 100 });
  });

  it('adds nothing to the undo history when a part is put back where it was', () => {
    const { hook, r1, undoAll } = setup();
    const node = hook.result.current.sync.nodes.find((n) => n.id === r1.id)!;
    act(() => hook.result.current.sync.onNodeDragStop(null, node, [node]));
    // Only the three parts being added
    expect(undoAll()).toBe(3);
  });

  it('routes wires for where a part is being dragged, not where the circuit has it', () => {
    const { hook, r1, r2 } = setup();
    act(() => hook.result.current.circuit.addConnection({
      id: 'w' as never, net: 'n' as never,
      from: { componentId: r1.id, pinId: r1.pins[1].id },
      to: { componentId: r2.id, pinId: r2.pins[0].id },
    }));
    const end = () => { const p = hook.result.current.sync.routes.get('w')!.points; return p[p.length - 1]; };
    const startX = end().x;
    act(() => hook.result.current.sync.onNodesChange([{ id: r2.id, type: 'position', position: { x: 400, y: 100 }, dragging: true }]));
    expect(end().x).toBe(startX + 100);
  });
});

describe('turning a knob', () => {
  it('records one undo step for a whole turn', () => {
    const { hook, pot, undoAll } = setup();
    const turnTo = (position: number, record: boolean) => act(() => {
      const current = hook.result.current.circuit.circuit.getComponent(pot.id)!;
      hook.result.current.circuit.updateComponent(pot.id, { parameters: { ...current.parameters, position } }, { record });
    });
    turnTo(0.55, true);
    for (const p of [0.6, 0.65, 0.7, 0.75]) turnTo(p, false);
    expect(hook.result.current.circuit.circuit.getComponent(pot.id)!.parameters.position).toBe(0.75);

    act(() => hook.result.current.circuit.undo());
    expect(hook.result.current.circuit.circuit.getComponent(pot.id)!.parameters.position).toBe(0.5);
    // ...leaving only the three parts being added
    expect(undoAll()).toBe(3);
  });
});

describe('nodes given to React Flow', () => {
  // React Flow hides a node that has no measured size until it has measured it again
  const sizes = (hook: ReturnType<typeof setup>['hook']) => hook.result.current.sync.nodes.map((n) => [n.width, n.height]);

  it('keep their measured size when a part is selected', () => {
    const { hook, r1 } = setup();
    act(() => hook.result.current.circuit.setSelection([r1.id], []));
    expect(hook.result.current.sync.nodes.find((n) => n.id === r1.id)!.selected).toBe(true);
    expect(sizes(hook)).toEqual([[60, 20], [60, 20], [60, 20]]);
  });

  it('keep their measured size when an LED changes state or a knob turns', () => {
    const { hook, pot } = setup();
    hook.rerender({ mode: 'schematic', leds: { someLed: true } });
    expect(sizes(hook)).toEqual([[60, 20], [60, 20], [60, 20]]);
    act(() => hook.result.current.circuit.updateComponent(pot.id, { parameters: { ...pot.parameters, position: 0.9 } }));
    expect(sizes(hook)).toEqual([[60, 20], [60, 20], [60, 20]]);
  });

  it('are measured again when their shape changes: another view, or a quarter turn', () => {
    const { hook, r1, r2 } = setup();
    act(() => hook.result.current.circuit.updateComponent(r1.id, { rotation: 90 }));
    const byId = (id: string) => hook.result.current.sync.nodes.find((n) => n.id === id)!;
    expect(byId(r1.id).width).toBeUndefined();
    expect(byId(r2.id).width).toBe(60);

    hook.rerender({ mode: 'board', leds: {} });
    expect(byId(r2.id).width).toBeUndefined();
  });
});

describe('unsaved changes', () => {
  it('are there after an edit, gone after undoing it, and gone after a save', () => {
    const { hook, r1 } = setup();
    const circuit = () => hook.result.current.circuit;
    expect(circuit().isDirty).toBe(true); // three parts were added

    act(() => circuit().markSaved(circuit().circuit.withName('Saved once')));
    expect(circuit().isDirty).toBe(false);
    expect(circuit().circuit.name).toBe('Saved once');

    act(() => circuit().updateComponent(r1.id, { label: 'R1' }));
    expect(circuit().isDirty).toBe(true);
    act(() => circuit().undo());
    expect(circuit().isDirty).toBe(false);
  });

  it('do not cost the undo history when saving, and undo does not undo the name', () => {
    const { hook } = setup();
    const circuit = () => hook.result.current.circuit;
    act(() => circuit().markSaved(circuit().circuit.withName('Named')));
    expect(circuit().canUndo).toBe(true);
    act(() => circuit().undo());
    expect(circuit().circuit.name).toBe('Named');
    expect(circuit().circuit.getComponents()).toHaveLength(2);
  });

  it('are not claimed for a circuit that was just opened, unless it was restored unsaved', () => {
    const { hook } = setup();
    const circuit = () => hook.result.current.circuit;
    const other = circuit().circuit.withName('Other');
    act(() => circuit().loadCircuit(other));
    expect(circuit().isDirty).toBe(false);
    act(() => circuit().loadCircuit(other, { dirty: true }));
    expect(circuit().isDirty).toBe(true);
  });
});

describe('selecting wires', () => {
  const wire = (hook: ReturnType<typeof setup>['hook'], id: string, a: { id: ComponentId; pins: { id: string }[] }, b: { id: ComponentId; pins: { id: string }[] }) =>
    act(() => hook.result.current.circuit.addConnection({
      id: id as never, net: `net-${id}` as never,
      from: { componentId: a.id, pinId: a.pins[1].id as never },
      to: { componentId: b.id, pinId: b.pins[0].id as never },
    }));

  it('selects the wire that was clicked, on that click', () => {
    const { hook, r1, r2, pot } = setup();
    wire(hook, 'a', r1, r2);
    wire(hook, 'b', r2, pot);
    const selected = () => hook.result.current.sync.edges.filter((e) => e.selected).map((e) => e.id);

    act(() => hook.result.current.sync.onEdgesChange([{ id: 'a', type: 'select', selected: true }]));
    expect(selected()).toEqual(['a']);
    expect(hook.result.current.circuit.selectedConnections).toEqual(['a']);

    // Clicking another wire: React Flow selects it and deselects the first
    act(() => hook.result.current.sync.onEdgesChange([
      { id: 'b', type: 'select', selected: true }, { id: 'a', type: 'select', selected: false },
    ]));
    expect(selected()).toEqual(['b']);
  });
});

describe('selecting parts', () => {
  const selected = (hook: ReturnType<typeof setup>['hook']) => hook.result.current.sync.nodes.filter((n) => n.selected).map((n) => n.id);

  it('selects the part React Flow says was clicked, and tells the circuit', () => {
    const { hook, r1, r2 } = setup();
    act(() => hook.result.current.sync.onNodesChange([{ id: r1.id, type: 'select', selected: true }]));
    expect(selected(hook)).toEqual([r1.id]);
    expect(hook.result.current.circuit.selectedComponents).toEqual([r1.id]);
    // Clicking another: it is selected and the first is not
    act(() => hook.result.current.sync.onNodesChange([
      { id: r2.id, type: 'select', selected: true }, { id: r1.id, type: 'select', selected: false },
    ]));
    expect(selected(hook)).toEqual([r2.id]);
  });

  it('stays selected when the click also changed the circuit (a switch, a knob)', () => {
    // The selection and the edit arrive in one go; neither may undo the other
    const { hook, pot } = setup();
    act(() => {
      hook.result.current.sync.onNodesChange([{ id: pot.id, type: 'select', selected: true }]);
      hook.result.current.circuit.updateComponent(pot.id, { parameters: { ...pot.parameters, position: 0.9 } });
    });
    expect(selected(hook)).toEqual([pot.id]);
    expect(hook.result.current.circuit.selectedComponents).toEqual([pot.id]);
    expect(hook.result.current.circuit.circuit.getComponent(pot.id)!.parameters.position).toBe(0.9);
  });

  it('a part picked while a wire was selected leaves only the part selected', () => {
    const { hook, r1, r2 } = setup();
    act(() => hook.result.current.circuit.addConnection({
      id: 'w' as never, net: 'n' as never,
      from: { componentId: r1.id, pinId: r1.pins[1].id },
      to: { componentId: r2.id, pinId: r2.pins[0].id },
    }));
    act(() => hook.result.current.sync.onEdgesChange([{ id: 'w', type: 'select', selected: true }]));
    // One click: React Flow reports the part selected and the wire not, one after the other
    act(() => {
      hook.result.current.sync.onNodesChange([{ id: r1.id, type: 'select', selected: true }]);
      hook.result.current.sync.onEdgesChange([{ id: 'w', type: 'select', selected: false }]);
    });
    expect(hook.result.current.circuit.selectedComponents).toEqual([r1.id]);
    expect(hook.result.current.circuit.selectedConnections).toEqual([]);
  });

  it('a part that is deleted is no longer selected', () => {
    const { hook, r1, r2 } = setup();
    act(() => hook.result.current.sync.onNodesChange([{ id: r1.id, type: 'select', selected: true }]));
    act(() => hook.result.current.sync.deleteComponents([r1.id]));
    expect(hook.result.current.circuit.selectedComponents).toEqual([]);
    act(() => hook.result.current.sync.onNodesChange([{ id: r2.id, type: 'select', selected: true }]));
    expect(hook.result.current.circuit.selectedComponents).toEqual([r2.id]);
  });
});

describe('deleting parts', () => {
  it('removes a part and the wires on it', () => {
    const { hook, r1, r2 } = setup();
    act(() => hook.result.current.circuit.addConnection({
      id: 'w' as never, net: 'n' as never,
      from: { componentId: r1.id, pinId: r1.pins[1].id },
      to: { componentId: r2.id, pinId: r2.pins[0].id },
    }));
    act(() => hook.result.current.sync.deleteComponents([r1.id]));
    expect(hook.result.current.circuit.circuit.getComponent(r1.id)).toBeUndefined();
    expect(hook.result.current.circuit.circuit.getConnections()).toHaveLength(0);
  });
});

describe('coloring wires', () => {
  function wired() {
    const ctx = setup();
    const { hook, r1, r2, pot } = ctx;
    const add = (id: string, from: { componentId: ComponentId; pinId: string }, to: { componentId: ComponentId; pinId: string }) =>
      act(() => hook.result.current.circuit.addConnection({ id: id as never, net: `n-${id}` as never, from: from as never, to: to as never }));
    // r1 pin 2 feeds both r2 and the pot: one net of two wires. A third wire is on its own.
    add('a', { componentId: r1.id, pinId: r1.pins[1].id }, { componentId: r2.id, pinId: r2.pins[0].id });
    add('b', { componentId: r1.id, pinId: r1.pins[1].id }, { componentId: pot.id, pinId: pot.pins[0].id });
    add('c', { componentId: r2.id, pinId: r2.pins[1].id }, { componentId: pot.id, pinId: pot.pins[2].id });
    const shown = () => Object.fromEntries(hook.result.current.sync.edges.map((e) => [e.id, e.data.userColor]));
    return { ...ctx, shown };
  }

  it('colors the whole net the wire belongs to, as one undo step', () => {
    const { hook, shown } = wired();
    act(() => hook.result.current.circuit.setWireColor(['a' as never], 'green'));
    expect(shown()).toEqual({ a: '#1E9E4A', b: '#1E9E4A', c: undefined });
    expect(hook.result.current.circuit.circuit.getConnections().map((c) => c.color)).toEqual(['green', 'green', undefined]);

    act(() => hook.result.current.circuit.undo());
    expect(shown()).toEqual({ a: undefined, b: undefined, c: undefined });
  });

  it('uses the shade for the view being shown', () => {
    const { hook, shown } = wired();
    act(() => hook.result.current.circuit.setWireColor(['c' as never], 'yellow'));
    expect(shown().c).toBe('#B58900');
    hook.rerender({ mode: 'board', leds: {} });
    expect(shown().c).toBe('#FFE04D');
  });

  it('goes back to the default color, and does nothing when there is nothing to change', () => {
    const { hook, shown, undoAll } = wired();
    act(() => hook.result.current.circuit.setWireColor(['b' as never], 'red'));
    act(() => hook.result.current.circuit.setWireColor(['a' as never], undefined));
    expect(shown()).toEqual({ a: undefined, b: undefined, c: undefined });
    act(() => hook.result.current.circuit.setWireColor(['a' as never], undefined));
    // 3 parts + 3 wires + color + clear; the repeat added nothing
    expect(undoAll()).toBe(8);
  });

  it('gives a wire added to a colored net that color', () => {
    const { hook, r2, pot, shown } = wired();
    act(() => hook.result.current.circuit.setWireColor(['c' as never], 'blue'));
    act(() => hook.result.current.circuit.addConnection({
      id: 'd' as never, net: 'n-d' as never,
      from: { componentId: r2.id, pinId: r2.pins[1].id }, to: { componentId: pot.id, pinId: pot.pins[1].id },
    }));
    expect(shown().d).toBe('#1F6FD6');
  });

  it('does not restart anything electrical: only the color changes', () => {
    const { hook } = wired();
    const ends = () => hook.result.current.circuit.circuit.getConnections().map(({ id, from, to }) => ({ id, from, to }));
    const before = ends();
    act(() => hook.result.current.circuit.setWireColor(['a' as never], 'purple'));
    expect(ends()).toEqual(before);
  });
});


describe('deleting', () => {
  /** r1, r2 and the pot's end and wiper in a row: r1 - r2 - pot. */
  function row() {
    const ctx = setup();
    const { hook, r1, r2, pot } = ctx;
    const wire = (id: string, from: { componentId: ComponentId; pinId: never }, to: { componentId: ComponentId; pinId: never }) =>
      act(() => hook.result.current.circuit.addConnection({ id: id as never, net: `n-${id}` as never, from, to }));
    wire('a', { componentId: r1.id, pinId: r1.pins[1].id as never }, { componentId: r2.id, pinId: r2.pins[0].id as never });
    wire('b', { componentId: r2.id, pinId: r2.pins[1].id as never }, { componentId: pot.id, pinId: pot.pins[0].id as never });
    const circuit = () => hook.result.current.circuit.circuit;
    const wires = () => circuit().getConnections().map((c) => `${c.from.componentId === r1.id ? 'r1' : c.from.componentId === r2.id ? 'r2' : 'pot'}-${c.to.componentId === r1.id ? 'r1' : c.to.componentId === r2.id ? 'r2' : 'pot'}`);
    return { ...ctx, circuit, wires };
  }

  it('closes the wire a part sat in, as one undo step', () => {
    const { hook, r2, circuit, wires } = row();
    act(() => hook.result.current.sync.deleteComponents([r2.id]));
    expect(circuit().getComponent(r2.id)).toBeUndefined();
    expect(wires()).toEqual(['r1-pot']);

    act(() => hook.result.current.circuit.undo());
    expect(circuit().getComponent(r2.id)).toBeDefined();
    expect(wires().sort()).toEqual(['r1-r2', 'r2-pot']);
  });

  it('deletes what is selected, parts and wires together, in one step', () => {
    const { hook, r2, circuit, wires, undoAll } = row();
    act(() => hook.result.current.circuit.setSelection([r2.id], ['a' as never]));
    act(() => hook.result.current.sync.deleteSelection());
    // The wire was asked to go too, so there is nothing to close
    expect(circuit().getComponent(r2.id)).toBeUndefined();
    expect(wires()).toEqual([]);
    // 3 parts, 2 wires, 1 delete
    expect(undoAll()).toBe(6);
  });

  it('does nothing, and records nothing, with nothing selected', () => {
    const { hook, circuit, undoAll } = row();
    act(() => hook.result.current.sync.deleteSelection());
    expect(circuit().getComponents()).toHaveLength(3);
    expect(undoAll()).toBe(5);
  });
});

describe('a part held over a wire it is about to go into', () => {
  it('is left out of the routing, so the wire stays under it', () => {
    const dark = {};
    const hook = renderHook(
      ({ floating }: { floating: string | null }) => ({ circuit: useCircuit(), sync: useCircuitSync('schematic', dark, floating) }),
      { wrapper, initialProps: { floating: null as string | null } },
    );
    const r1 = createComponentFromDefinition(resistorDefinition, { x: 100, y: 100 });
    const r2 = createComponentFromDefinition(resistorDefinition, { x: 500, y: 100 });
    const loose = createComponentFromDefinition(resistorDefinition, { x: 300, y: 100 });
    act(() => {
      for (const part of [r1, r2, loose]) hook.result.current.circuit.addComponent(part);
      hook.result.current.circuit.addConnection({
        id: 'w' as never, net: 'n' as never,
        from: { componentId: r1.id, pinId: r1.pins[1].id }, to: { componentId: r2.id, pinId: r2.pins[0].id },
      });
    });
    const straight = () => hook.result.current.sync.routes.get('w')!.points.every((p) => p.y === 100);
    expect(straight()).toBe(false); // the wire goes round the part in its way
    hook.rerender({ floating: loose.id });
    expect(straight()).toBe(true);
  });
});
