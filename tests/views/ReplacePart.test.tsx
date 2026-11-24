/**
 * Swapping a part: the list that opens beside a double-clicked part, the
 * parts shelf when it is asked for every part, and the inspector's button.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { theLoop } from '@/classes/theLoop';
import { classCircuit } from '@/classes';
import { place } from '@/examples/circuits';
import type { Component } from '@/types/circuit';
import { ComponentDrawer } from '@/views/ComponentDrawer/ComponentDrawer';
import { Inspector } from '@/views/Inspector/Inspector';
import { ReplacePartProvider, useReplacePart, type ReplacePart } from '@/views/ReplacePart/ReplacePartContext';
import { ReplacePopover } from '@/views/ReplacePart/ReplacePopover';
import { ALL_PARTS } from './allParts';

let state: ReturnType<typeof useCircuit>;
let replace: ReplacePart;
function Watch() {
  state = useCircuit();
  replace = useReplacePart();
  return null;
}

/** Class 1's loop on the canvas, with the shelf, the list and the inspector around it. */
function setUp(circuit: Circuit = classCircuit(theLoop)) {
  render(
    <CircuitProvider initial={{ circuit, dirty: false }}>
      <ReplacePartProvider>
        <ReactFlowProvider>
          <Watch />
          <ComponentDrawer />
          <ReplacePopover viewMode="schematic" />
          <Inspector viewMode="schematic" onDeleteComponents={(parts) => { for (const id of parts) state.removeComponent(id); }} />
        </ReactFlowProvider>
      </ReplacePartProvider>
    </CircuitProvider>,
  );
  const one = (type: string): Component => state.circuit.getComponents().find((c) => c.type === type)!;
  return { one, resistor: one('resistor'), toggle: one('switch'), led: one('led') };
}

const popover = () => screen.queryByTestId('replace-popover');
const inPopover = (key: string) => within(screen.getByTestId('replace-popover')).getByTestId(`shelf-item-${key}`);
const onShelf = (key: string) => within(screen.getByTestId('component-drawer')).getAllByTestId(`shelf-item-${key}`).at(-1)!;
const kinds = () => state.circuit.getComponents().map((c) => c.type).sort();
/** Whether a wire runs between two legs, named "switch.2" and the like. */
function wired(a: string, b: string): boolean {
  const name = (end: { componentId: string; pinId: string }) => {
    const part = state.circuit.getComponent(end.componentId as never)!;
    return `${part.type}.${part.pins.find((p) => p.id === end.pinId)!.label}`;
  };
  return state.circuit.getConnections().some((c) => [name(c.from), name(c.to)].sort().join() === [a, b].sort().join());
}

beforeEach(() => {
  localStorage.clear();
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

describe('the list beside a part', () => {
  it('is not there until a part is to be swapped, and the shelf is for dragging', () => {
    setUp();
    expect(popover()).toBeNull();
    expect(screen.queryByTestId('shelf-replacing')).toBeNull();
    expect(onShelf('led')).toHaveAttribute('draggable', 'true');
  });

  it('says what is being swapped and offers its other values and the parts like it', () => {
    const { resistor } = setUp();
    act(() => replace.begin(resistor.id));
    expect(screen.getByTestId('replace-what')).toHaveTextContent('Resistor 470Ω');
    const values = within(screen.getByTestId('replace-values')).getAllByRole('button').map((e) => e.getAttribute('data-testid'));
    expect(values).toContain('shelf-item-resistor@1000');
    expect(values).not.toContain('shelf-item-resistor@470'); // the value it has
    expect(values).toHaveLength(11);
    const similar = within(screen.getByTestId('replace-similar')).getAllByRole('button').map((e) => e.getAttribute('data-testid'));
    // The pot comes in the stock value nearest 470 Ω
    expect(similar).toEqual(['shelf-item-potentiometer@1000', 'shelf-item-ldr', 'shelf-item-body-contact', 'shelf-item-optocoupler']);
    expect(inPopover('potentiometer@1000')).toHaveTextContent('Potentiometer');
    expect(inPopover('potentiometer@1000')).toHaveTextContent('1kΩ');
  });

  it('names a named part by its name', () => {
    const { toggle } = setUp();
    act(() => state.updateComponent(toggle.id, { label: 'LIGHT' }));
    act(() => replace.begin(toggle.id));
    expect(screen.getByTestId('replace-what')).toHaveTextContent('LIGHT (Switch)');
  });

  it('changes the value at a click, as one undo step, and closes', () => {
    const { resistor } = setUp();
    act(() => replace.begin(resistor.id));
    fireEvent.click(inPopover('resistor@1000'));
    expect(popover()).toBeNull();
    expect(state.circuit.getComponent(resistor.id)!.parameters).toMatchObject({ resistance: 1000, value: '1kΩ' });
    expect(state.selectedComponents).toEqual([resistor.id]);
    act(() => state.undo());
    expect(state.circuit.getComponent(resistor.id)!.parameters.resistance).toBe(470);
    expect(state.canUndo).toBe(false);
  });

  it('has the box for typing a value ready, so double-click, type, Enter changes it', () => {
    const { resistor } = setUp();
    act(() => replace.begin(resistor.id));
    const box = screen.getByLabelText('New resistance');
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: '3k3' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(state.circuit.getComponent(resistor.id)!.parameters).toMatchObject({ resistance: 3300, value: '3.3kΩ' });
    expect(popover()).toBeNull();
  });

  it('refuses what is not a value, and says how one is written', () => {
    const { resistor } = setUp();
    act(() => replace.begin(resistor.id));
    const box = screen.getByLabelText('New resistance');
    fireEvent.change(box, { target: { value: 'banana' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('4.7k');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(state.circuit.getComponent(resistor.id)!.parameters.resistance).toBe(470);
    expect(state.canUndo).toBe(false);
    // Enter on nothing typed is not a mistake
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(popover()).not.toBeNull();
  });

  it('puts a like part in its place with its wires, selected, as one undo step', () => {
    const { resistor } = setUp();
    const wires = state.circuit.getConnections().length;
    act(() => replace.begin(resistor.id));
    fireEvent.click(inPopover('potentiometer@1000'));
    expect(popover()).toBeNull();
    expect(kinds()).not.toContain('resistor');
    const pot = state.circuit.getComponents().find((c) => c.type === 'potentiometer')!;
    expect(pot.position).toEqual(resistor.position);
    expect(pot.parameters.maxResistance).toBe(1000);
    expect(wired('switch.2', 'potentiometer.1')).toBe(true);
    expect(wired('potentiometer.2', 'led.A')).toBe(true);
    expect(state.circuit.getConnections()).toHaveLength(wires);
    expect(state.selectedComponents).toEqual([pot.id]);
    act(() => state.undo());
    expect(kinds()).toContain('resistor');
    expect(wired('switch.2', 'resistor.1')).toBe(true);
    expect(state.canUndo).toBe(false);
  });

  it('keeps keys pressed in it from the canvas, and closes on Escape or a press elsewhere', () => {
    const { resistor } = setUp();
    act(() => replace.begin(resistor.id));
    let heard = 0;
    const listen = () => { heard++; };
    document.body.addEventListener('keydown', listen);
    fireEvent.keyDown(screen.getByLabelText('New resistance'), { key: 'r' });
    fireEvent.keyDown(screen.getByLabelText('New resistance'), { key: 'Backspace' });
    document.body.removeEventListener('keydown', listen);
    expect(heard).toBe(0);
    expect(popover()).not.toBeNull();

    fireEvent.keyDown(screen.getByLabelText('New resistance'), { key: 'Escape' });
    expect(popover()).toBeNull();

    act(() => replace.begin(resistor.id));
    fireEvent.pointerDown(screen.getByTestId('replace-values'));
    expect(popover()).not.toBeNull(); // a press inside is not a press elsewhere
    fireEvent.pointerDown(document.body);
    expect(popover()).toBeNull();
    expect(state.canUndo).toBe(false);
  });

  it('closes by its button', () => {
    const { resistor } = setUp();
    act(() => replace.begin(resistor.id));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(popover()).toBeNull();
  });

  it('goes when the part does', () => {
    const { resistor } = setUp();
    act(() => replace.begin(resistor.id));
    act(() => state.removeComponent(resistor.id));
    expect(popover()).toBeNull();
    expect(replace.target).toBeNull();
  });

  it('for a part like no other, says so and still leads to every part', () => {
    const chip = place('ne555', 200, 200);
    setUp(new Circuit('Test').addComponent(chip));
    act(() => replace.begin(chip.id));
    expect(screen.queryByTestId('replace-values')).toBeNull();
    expect(screen.queryByTestId('replace-similar')).toBeNull();
    expect(screen.queryByLabelText(/^New /)).toBeNull();
    expect(popover()).toHaveTextContent('Nothing else is quite like this part');
    expect(screen.getByTestId('replace-all')).toBeInTheDocument();
  });

  it('greys out a like part that has too few legs for the wires', () => {
    // A speaker with both legs wired cannot become an audio output, which has one
    const speaker = place('speaker', 200, 200), a = place('resistor', 0, 0), b = place('resistor', 400, 0);
    const wire = (id: string, from: Component, to: Component, pin: number) => ({
      id: id as never, net: id as never,
      from: { componentId: from.id, pinId: from.pins[1].id }, to: { componentId: to.id, pinId: to.pins[pin].id },
    });
    const circuit = new Circuit('Test').addComponent(speaker).addComponent(a).addComponent(b)
      .addConnection(wire('w1', a, speaker, 0)).addConnection(wire('w2', b, speaker, 1));
    setUp(circuit);
    act(() => replace.begin(speaker.id));
    expect(inPopover('audio-output')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(inPopover('audio-output'));
    expect(kinds()).toContain('speaker');
    expect(popover()).not.toBeNull();
  });

  it('is never offered for a junction dot', () => {
    const dot = place('junction', 200, 200);
    setUp(new Circuit('Test').addComponent(dot));
    act(() => replace.begin(dot.id));
    expect(popover()).toBeNull();
    expect(replace.target).toBeNull();
  });
});

describe('every part: the shelf does the choosing', () => {
  function widened() {
    const ctx = setUp();
    act(() => replace.begin(ctx.resistor.id));
    fireEvent.click(screen.getByTestId('replace-all'));
    return ctx;
  }

  it('takes over from the list, and says what is being replaced', () => {
    widened();
    expect(popover()).toBeNull();
    expect(screen.getByTestId('shelf-replacing')).toHaveTextContent('Resistor 470Ω');
    expect(screen.getByLabelText('Search parts')).toHaveFocus();
  });

  it('makes its tiles for clicking, and greys out those with too few legs', () => {
    widened();
    expect(onShelf('led')).not.toHaveAttribute('draggable');
    expect(onShelf('led')).toHaveAttribute('role', 'button');
    expect(onShelf('led')).not.toHaveAttribute('aria-disabled');
    for (const key of ['ground', 'audio-output', 'junction']) expect(onShelf(key), key).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(onShelf('ground'));
    expect(kinds()).toContain('resistor');
    expect(screen.getByTestId('shelf-replacing')).toBeInTheDocument();
  });

  it('puts the part clicked in its place, and is a shelf again', () => {
    const { resistor } = widened();
    fireEvent.click(onShelf('led'));
    expect(screen.queryByTestId('shelf-replacing')).toBeNull();
    expect(onShelf('led')).toHaveAttribute('draggable', 'true');
    expect(kinds().filter((k) => k === 'led')).toHaveLength(2);
    expect(kinds()).not.toContain('resistor');
    const swapped = state.circuit.getComponents().find((c) => c.type === 'led' && c.position.x === resistor.position.x)!;
    expect(state.selectedComponents).toEqual([swapped.id]);
    // What was used is remembered like a part dragged off the shelf
    expect(JSON.parse(localStorage.getItem('circuit_bender_shelf')!).recent[0]).toBe('led');
    act(() => state.undo());
    expect(kinds()).toContain('resistor');
    expect(state.canUndo).toBe(false);
  });

  it('finds a part by typing, values that are not stocked included', () => {
    const { resistor } = widened();
    fireEvent.change(screen.getByLabelText('Search parts'), { target: { value: '33.2k' } });
    fireEvent.click(onShelf('resistor@33200'));
    expect(state.circuit.getComponent(resistor.id)!.parameters.resistance).toBe(33200);
  });

  it('is called off by Cancel or Escape, changing nothing', () => {
    widened();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('shelf-replacing')).toBeNull();
    expect(replace.target).toBeNull();

    act(() => replace.begin(state.circuit.getComponents().find((c) => c.type === 'resistor')!.id));
    act(() => replace.widen());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('shelf-replacing')).toBeNull();
    expect(state.canUndo).toBe(false);
  });

  it('unfolds a shelf that was folded away, for as long as it is needed', () => {
    localStorage.setItem('circuit_bender_shelf', JSON.stringify({ hidden: true }));
    const { resistor } = setUp();
    expect(screen.getByLabelText('Show the parts shelf')).toBeInTheDocument();
    act(() => replace.begin(resistor.id));
    act(() => replace.widen());
    fireEvent.click(onShelf('led'));
    expect(kinds()).not.toContain('resistor');
    expect(screen.getByLabelText('Show the parts shelf')).toBeInTheDocument();
  });
});

describe('the inspector', () => {
  it('has a Replace button for one part, which opens the list', () => {
    const { resistor } = setUp();
    expect(screen.queryByTestId('inspector-replace')).toBeNull();
    act(() => state.setSelection([resistor.id], []));
    fireEvent.click(screen.getByTestId('inspector-replace'));
    expect(screen.getByTestId('replace-what')).toHaveTextContent('Resistor 470Ω');
  });

  it('has none for several parts, a wire or a junction dot', () => {
    const { resistor, led } = setUp();
    act(() => state.setSelection([resistor.id, led.id], []));
    expect(screen.queryByTestId('inspector-replace')).toBeNull();
    act(() => state.setSelection([], [state.circuit.getConnections()[0].id]));
    expect(screen.queryByTestId('inspector-replace')).toBeNull();
    const dot = place('junction', 0, 0);
    act(() => state.addComponent(dot));
    act(() => state.setSelection([dot.id], []));
    expect(screen.queryByTestId('inspector-replace')).toBeNull();
  });
});
