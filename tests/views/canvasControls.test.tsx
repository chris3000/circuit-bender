/**
 * The controls a part has on the canvas itself (a dial beside the symbol, a
 * symbol that is held down), the same controls in the inspector, and the
 * toolbar's way into the bend tool.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from 'reactflow';
import { useEffect } from 'react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import { Circuit } from '@/models/Circuit';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { ControlNode } from '@/views/CircuitCanvas/nodes/ControlNode';
import type { CircuitNodeData } from '@/views/CircuitCanvas/useCircuitSync';
import { Inspector } from '@/views/Inspector/Inspector';
import { Toolbar } from '@/views/SchematicView/Toolbar';
import type { Component } from '@/types/circuit';
import { ALL_PARTS } from './allParts';

beforeEach(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

let circuit: Circuit;
let canUndo = false;

/** One part of the given kind on a canvas of its own, drawn as the canvas draws it. */
function onCanvas(type: string, viewMode: 'schematic' | 'board' = 'schematic') {
  const part = createComponentFromDefinition(ComponentRegistry.getInstance().get(type)!, { x: 0, y: 0 });
  function Node() {
    const state = useCircuit();
    circuit = state.circuit;
    canUndo = state.canUndo;
    const component = state.circuit.getComponent(part.id);
    if (!component) return null;
    const props = { id: part.id, data: { component, viewMode, ledOn: false }, selected: false } as unknown as NodeProps<CircuitNodeData>;
    return <ControlNode {...props} />;
  }
  const view = render(
    <CircuitProvider initial={{ circuit: new Circuit('Test').addComponent(part), dirty: false }}>
      <ReactFlowProvider><Node /></ReactFlowProvider>
    </CircuitProvider>,
  );
  const value = (key: string) => circuit.getComponent(part.id)!.parameters[key];
  return { part, value, view };
}

describe('a dial on a part', () => {
  it('shows where the part is set', () => {
    onCanvas('ldr');
    expect(screen.getByTestId('node-dial')).toHaveAttribute('data-position', '0.5');
  });

  it('turns up when dragged up and down when dragged down, as one undo step', () => {
    const { value } = onCanvas('ldr');
    const handle = screen.getByTitle(/^Light: drag up or down/);
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 85 });
    expect(value('light')).toBe(0.6);
    fireEvent.pointerMove(window, { clientX: 100, clientY: 55 });
    expect(value('light')).toBe(0.8);
    fireEvent.pointerMove(window, { clientX: 100, clientY: -400 });
    expect(value('light')).toBe(1);
    fireEvent.pointerUp(window);
    expect(screen.getByTestId('node-dial')).toHaveAttribute('data-position', '1');

    // The pointer is let go: moving it does nothing more
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300 });
    expect(value('light')).toBe(1);
    expect(canUndo).toBe(true);
  });

  it('starves the supply from the dial beside it, and says by how much', () => {
    const { value } = onCanvas('power');
    expect(screen.getByTestId('node-dial')).toHaveTextContent('STARVE');
    fireEvent.pointerDown(screen.getByTitle(/^Starve: drag up or down/), { button: 0, clientX: 0, clientY: 200 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 140 });
    expect(value('starve')).toBe(0.4);
    fireEvent.pointerUp(window);
    expect(screen.getByTestId('node-dial')).toHaveTextContent('40%');
    expect(value('voltage')).toBe(9);
  });

  it('ignores the other mouse buttons', () => {
    const { value } = onCanvas('ldr');
    fireEvent.pointerDown(screen.getByTitle(/^Light: drag up or down/), { button: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 0 });
    expect(value('light')).toBe(0.5);
  });

  it('is there on the board too', () => {
    onCanvas('ldr', 'board');
    expect(screen.getByTestId('node-dial')).toBeInTheDocument();
  });
});

describe('a part that is held', () => {
  it('closes a push button while it is pressed, with nothing to undo', () => {
    const { value } = onCanvas('pushbutton');
    const zone = screen.getByTestId('node-hold');
    expect(zone).toHaveAttribute('data-held', 'false');
    fireEvent.pointerDown(zone, { button: 0, clientY: 100 });
    expect(value('closed')).toBe(1);
    expect(screen.getByTestId('node-hold')).toHaveAttribute('data-held', 'true');
    // Dragging about does not change a button
    fireEvent.pointerMove(window, { clientY: 20 });
    expect(value('closed')).toBe(1);
    fireEvent.pointerUp(window);
    expect(value('closed')).toBe(0);
    expect(canUndo).toBe(false);
  });

  it('touches the contacts, harder as the pointer is dragged up, and lets go', () => {
    const { value } = onCanvas('body-contact');
    const zone = screen.getByTestId('node-hold');
    fireEvent.pointerDown(zone, { button: 0, clientY: 100 });
    expect(value('touch')).toBe(0.6);
    fireEvent.pointerMove(window, { clientY: 70 });
    expect(value('touch')).toBe(0.9);
    fireEvent.pointerMove(window, { clientY: -500 });
    expect(value('touch')).toBe(1);
    fireEvent.pointerMove(window, { clientY: 900 });
    expect(value('touch')).toBe(0.05); // still touching, as lightly as can be
    fireEvent.pointerUp(window);
    expect(value('touch')).toBe(0);
    expect(canUndo).toBe(false);
  });

  it('is let go if the pointer is lost', () => {
    const { value } = onCanvas('pushbutton');
    fireEvent.pointerDown(screen.getByTestId('node-hold'), { button: 0 });
    fireEvent.pointerCancel(window);
    expect(value('closed')).toBe(0);
  });

  it('is let go if the part is taken off the canvas under the finger', () => {
    const { part, view } = onCanvas('pushbutton');
    fireEvent.pointerDown(screen.getByTestId('node-hold'), { button: 0 });
    expect(circuit.getComponent(part.id)!.parameters.closed).toBe(1);
    function Watch() { circuit = useCircuit().circuit; return null; }
    view.rerender(<CircuitProvider initial={null}><ReactFlowProvider><Watch /></ReactFlowProvider></CircuitProvider>);
    expect(circuit.getComponent(part.id)!.parameters.closed).toBe(0);
  });
});

describe('the same controls in the inspector', () => {
  function inspect(type: string) {
    const part = createComponentFromDefinition(ComponentRegistry.getInstance().get(type)!, { x: 0, y: 0 });
    function Select() {
      const state = useCircuit();
      circuit = state.circuit;
      canUndo = state.canUndo;
      const { setSelection } = state;
      useEffect(() => setSelection([part.id], []), [setSelection]);
      return null;
    }
    render(
      <CircuitProvider initial={{ circuit: new Circuit('Test').addComponent(part), dirty: false }}>
        <Select />
        <Inspector viewMode="schematic" onDeleteComponents={vi.fn()} />
      </CircuitProvider>,
    );
    const now = (): Component => circuit.getComponent(part.id)!;
    return { part, now };
  }

  it.each([
    ['power', 'Starve', 'starve', '0.35', 0.35],
    ['ldr', 'Light', 'light', '0.8', 0.8],
    ['body-contact', 'Touch', 'touch', '0.25', 0.25],
    ['lm386', 'Gain', 'gain', '120', 120],
  ])('a %s has a %s slider', (type, label, parameter, typed, expected) => {
    const { now } = inspect(type);
    const slider = within(screen.getByTestId('inspector')).getByLabelText(new RegExp(`^${label}`));
    expect(slider).toHaveAttribute('type', 'range');
    fireEvent.change(slider, { target: { value: typed } });
    expect(now().parameters[parameter]).toBe(expected);
  });

  it('holds a push button down and lets it up', () => {
    const { now } = inspect('pushbutton');
    const group = within(screen.getByRole('group', { name: 'Button position' }));
    expect(group.getByRole('button', { name: 'Up' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(group.getByRole('button', { name: 'Held down' }));
    expect(now().parameters.closed).toBe(1);
    expect(group.getByRole('button', { name: 'Held down' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(group.getByRole('button', { name: 'Up' }));
    expect(now().parameters.closed).toBe(0);
  });

  it('still sets the supply voltage, and leaves the starve knob where it is', () => {
    const { now } = inspect('power');
    fireEvent.change(within(screen.getByTestId('inspector')).getByLabelText(/^Starve/), { target: { value: '0.5' } });
    const voltage = within(screen.getByTestId('inspector')).getByLabelText('Voltage');
    fireEvent.change(voltage, { target: { value: '5' } });
    fireEvent.keyDown(voltage, { key: 'Enter' });
    expect(now().parameters).toMatchObject({ voltage: 5, starve: 0.5 });
  });
});

describe('the bend button on the toolbar', () => {
  it('turns the tool on and off, and shows which', () => {
    const onToggleBend = vi.fn();
    const { rerender } = render(<Toolbar activeView="schematic" onSelectView={() => {}} bending={false} onToggleBend={onToggleBend} />);
    const button = screen.getByTestId('bend-toggle');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onToggleBend).toHaveBeenCalledTimes(1);
    rerender(<Toolbar activeView="schematic" onSelectView={() => {}} bending onToggleBend={onToggleBend} />);
    expect(screen.getByTestId('bend-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('is not offered where there is nothing to bend', () => {
    render(<Toolbar activeView="cover" onSelectView={() => {}} />);
    expect(screen.queryByTestId('bend-toggle')).toBeNull();
  });
});
