import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import type { Component, ComponentId } from '@/types/circuit';

function makeComponent(id: string): Component {
  return {
    id: id as ComponentId,
    type: 'resistor',
    position: {
      schematic: { x: 0, y: 0 },
      breadboard: { row: 0, column: 0 },
    },
    rotation: 0,
    parameters: {},
    pins: [],
    state: { voltages: new Map(), currents: new Map() },
  };
}

function UndoRedoTestHarness() {
  const {
    circuit,
    addComponent,
    removeComponent,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCircuit();

  return React.createElement('div', null,
    React.createElement('div', { 'data-testid': 'count' }, circuit.getComponents().length),
    React.createElement('div', { 'data-testid': 'canUndo' }, String(canUndo)),
    React.createElement('div', { 'data-testid': 'canRedo' }, String(canRedo)),
    React.createElement('button', {
      'data-testid': 'add',
      onClick: () => addComponent(makeComponent('comp-1')),
    }, 'Add'),
    React.createElement('button', {
      'data-testid': 'add2',
      onClick: () => addComponent(makeComponent('comp-2')),
    }, 'Add2'),
    React.createElement('button', {
      'data-testid': 'remove',
      onClick: () => removeComponent('comp-1' as ComponentId),
    }, 'Remove'),
    React.createElement('button', { 'data-testid': 'undo', onClick: undo }, 'Undo'),
    React.createElement('button', { 'data-testid': 'redo', onClick: redo }, 'Redo'),
  );
}

function renderHarness() {
  return render(
    React.createElement(CircuitProvider, null,
      React.createElement(UndoRedoTestHarness)
    )
  );
}

describe('Undo/Redo System', () => {
  it('should undo adding a component', () => {
    renderHarness();

    act(() => { screen.getByTestId('add').click(); });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    act(() => { screen.getByTestId('undo').click(); });
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('should redo after undo', () => {
    renderHarness();

    act(() => { screen.getByTestId('add').click(); });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    act(() => { screen.getByTestId('undo').click(); });
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    act(() => { screen.getByTestId('redo').click(); });
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('should clear redo stack on new mutation', () => {
    renderHarness();

    act(() => { screen.getByTestId('add').click(); });
    act(() => { screen.getByTestId('undo').click(); });
    expect(screen.getByTestId('canRedo')).toHaveTextContent('true');

    // New mutation should clear redo stack
    act(() => { screen.getByTestId('add2').click(); });
    expect(screen.getByTestId('canRedo')).toHaveTextContent('false');
  });

  it('should report canUndo and canRedo correctly', () => {
    renderHarness();

    // Initially, neither undo nor redo is available
    expect(screen.getByTestId('canUndo')).toHaveTextContent('false');
    expect(screen.getByTestId('canRedo')).toHaveTextContent('false');

    // After mutation, canUndo is true
    act(() => { screen.getByTestId('add').click(); });
    expect(screen.getByTestId('canUndo')).toHaveTextContent('true');
    expect(screen.getByTestId('canRedo')).toHaveTextContent('false');

    // After undo, canRedo is true, canUndo is false
    act(() => { screen.getByTestId('undo').click(); });
    expect(screen.getByTestId('canUndo')).toHaveTextContent('false');
    expect(screen.getByTestId('canRedo')).toHaveTextContent('true');

    // After redo, canUndo is true, canRedo is false
    act(() => { screen.getByTestId('redo').click(); });
    expect(screen.getByTestId('canUndo')).toHaveTextContent('true');
    expect(screen.getByTestId('canRedo')).toHaveTextContent('false');
  });

});

// Separate describe for stack cap test with a dedicated harness
describe('Undo/Redo Stack Cap', () => {
  it('should cap undo stack at 50 entries', () => {
    let contextRef: ReturnType<typeof useCircuit> | null = null;

    function CapHarness() {
      const ctx = useCircuit();
      contextRef = ctx;
      return React.createElement('div', { 'data-testid': 'cap-count' },
        ctx.circuit.getComponents().length
      );
    }

    render(
      React.createElement(CircuitProvider, null,
        React.createElement(CapHarness)
      )
    );

    // Add 55 components one at a time
    for (let i = 0; i < 55; i++) {
      act(() => {
        contextRef!.addComponent(makeComponent(`cap-${i}`));
      });
    }

    expect(screen.getByTestId('cap-count')).toHaveTextContent('55');

    // Undo 50 times (the max stack size)
    for (let i = 0; i < 50; i++) {
      act(() => {
        contextRef!.undo();
      });
    }

    // Should have 5 components remaining (55 - 50 = 5)
    expect(screen.getByTestId('cap-count')).toHaveTextContent('5');

    // canUndo should now be false — stack was capped at 50
    expect(contextRef!.canUndo).toBe(false);
  });
});
