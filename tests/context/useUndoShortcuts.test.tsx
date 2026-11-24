/**
 * Ctrl/Cmd+Z works wherever the focus is: the keys are heard for the whole
 * page, not by whichever view was clicked last.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import { useUndoShortcuts } from '@/context/useUndoShortcuts';
import { resistor } from '@/examples/circuits';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

function Harness() {
  useUndoShortcuts();
  const { circuit, addComponent } = useCircuit();
  return (
    <div>
      <output data-testid="count">{circuit.getComponents().length}</output>
      <button data-testid="add" onClick={() => addComponent(resistor(1000, 0, 0))}>Add</button>
      {/* A panel that keeps its keys to itself, as the inspector does */}
      <div onKeyDown={(e) => e.stopPropagation()}>
        <button data-testid="panel-button">Rotate</button>
        <input data-testid="typing" />
        <input data-testid="settled" data-settled="true" />
      </div>
    </div>
  );
}

function setUp(parts = 2) {
  render(<CircuitProvider><Harness /></CircuitProvider>);
  for (let i = 0; i < parts; i++) act(() => { screen.getByTestId('add').click(); });
  const count = () => Number(screen.getByTestId('count').textContent);
  return { count };
}

const undoKey = { key: 'z', ctrlKey: true };
const redoKey = { key: 'Z', ctrlKey: true, shiftKey: true };

describe('undo and redo keys', () => {
  it('undo and redo with nothing in particular focused', () => {
    const { count } = setUp();
    fireEvent.keyDown(document.body, undoKey);
    expect(count()).toBe(1);
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(count()).toBe(0);
    fireEvent.keyDown(document.body, redoKey);
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(count()).toBe(2);
  });

  it('are not swallowed by a panel that keeps its keys', () => {
    const { count } = setUp();
    fireEvent.keyDown(screen.getByTestId('panel-button'), undoKey);
    expect(count()).toBe(1);
  });

  it('are taken: the browser and the view under the focus do not act on them too', () => {
    setUp();
    expect(fireEvent.keyDown(document.body, undoKey)).toBe(false); // default prevented
    expect(fireEvent.keyDown(document.body, { key: 'x', ctrlKey: true })).toBe(true);
  });

  it('leave a text box that is being typed in to undo its own typing', () => {
    const { count } = setUp();
    expect(fireEvent.keyDown(screen.getByTestId('typing'), undoKey)).toBe(true);
    expect(count()).toBe(2);
  });

  it('undo the circuit from a text box whose text is already in it', () => {
    const { count } = setUp();
    fireEvent.keyDown(screen.getByTestId('settled'), undoKey);
    expect(count()).toBe(1);
  });

  it('do nothing when there is nothing to undo or redo', () => {
    const { count } = setUp(0);
    fireEvent.keyDown(document.body, undoKey);
    fireEvent.keyDown(document.body, redoKey);
    expect(count()).toBe(0);
  });
});
