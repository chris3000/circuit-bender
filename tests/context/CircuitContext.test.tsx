import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import type { Component, ComponentId } from '@/types/circuit';

function TestComponent() {
  const { circuit, addComponent, removeComponent } = useCircuit();

  const handleAdd = () => {
    const component: Component = {
      id: 'test-comp' as ComponentId,
      type: 'resistor',
      position: { x: 0, y: 0 },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };
    addComponent(component);
  };

  const handleRemove = () => {
    removeComponent('test-comp' as ComponentId);
  };

  return (
    <div>
      <div data-testid="count">{circuit.getComponents().length}</div>
      <button onClick={handleAdd}>Add</button>
      <button onClick={handleRemove}>Remove</button>
    </div>
  );
}

describe('CircuitContext', () => {
  it('should provide circuit state', () => {
    render(
      <CircuitProvider>
        <TestComponent />
      </CircuitProvider>
    );

    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('should add component', () => {
    render(
      <CircuitProvider>
        <TestComponent />
      </CircuitProvider>
    );

    act(() => {
      screen.getByText('Add').click();
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('should remove component', () => {
    render(
      <CircuitProvider>
        <TestComponent />
      </CircuitProvider>
    );

    act(() => {
      screen.getByText('Add').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    act(() => {
      screen.getByText('Remove').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });
});

describe('editCircuit', () => {
  let state: ReturnType<typeof useCircuit>;
  function Watch() { state = useCircuit(); return null; }
  const part = (id: string): Component => ({
    id: id as ComponentId, type: 'resistor', position: { x: 0, y: 0 }, rotation: 0, parameters: {}, pins: [],
    state: { voltages: new Map(), currents: new Map() },
  });

  it('makes a change of several parts one undo step', () => {
    render(<CircuitProvider><Watch /></CircuitProvider>);
    act(() => state.editCircuit((c) => c.addComponent(part('a')).addComponent(part('b'))));
    expect(state.circuit.getComponents()).toHaveLength(2);
    expect(state.isDirty).toBe(true);
    act(() => state.undo());
    expect(state.circuit.getComponents()).toHaveLength(0);
    expect(state.canUndo).toBe(false);
    act(() => state.redo());
    expect(state.circuit.getComponents()).toHaveLength(2);
  });

  it('records nothing for an edit that changes nothing', () => {
    render(<CircuitProvider><Watch /></CircuitProvider>);
    act(() => state.editCircuit((c) => c));
    expect(state.canUndo).toBe(false);
    expect(state.isDirty).toBe(false);
  });
});
