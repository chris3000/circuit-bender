import React, { useEffect, useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import SchematicView from '@/views/SchematicView';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { snapToGrid } from '@/utils/grid';
import type { Component } from '@/types/circuit';

// Helper component that adds components and creates a wire between them
function SetupHelper({
  components,
  createWire,
}: {
  components: Component[];
  createWire?: boolean;
}) {
  const { addComponent, addConnection } = useCircuit();
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) {
      components.forEach((c) => addComponent(c));
      if (createWire && components.length >= 2) {
        addConnection({
          id: 'conn-1' as any,
          from: {
            componentId: components[0].id,
            pinId: components[0].pins[1].id,
          },
          to: {
            componentId: components[1].id,
            pinId: components[1].pins[0].id,
          },
          net: 'net-1' as any,
        });
      }
      setAdded(true);
    }
  }, [added, addComponent, addConnection, components, createWire]);
  return null;
}

describe('Selection', () => {
  let comp1: Component;
  let comp2: Component;

  beforeEach(() => {
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    registry.register(resistorDefinition);

    comp1 = createComponentFromDefinition(resistorDefinition, {
      x: snapToGrid(100),
      y: snapToGrid(200),
    });

    comp2 = createComponentFromDefinition(resistorDefinition, {
      x: snapToGrid(300),
      y: snapToGrid(200),
    });
  });

  it('should select a component on click in select mode', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <SetupHelper components={[comp1]} />
          <SchematicView />
        </DndContext>
      </CircuitProvider>
    );

    // Default is select mode, click component
    const component = screen.getByTestId(`component-${comp1.id}`);
    fireEvent.click(component);

    expect(component).toHaveAttribute('data-selected', 'true');
  });

  it('should delete selected component on Delete key', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <SetupHelper components={[comp1]} />
          <SchematicView />
        </DndContext>
      </CircuitProvider>
    );

    // Select the component
    const component = screen.getByTestId(`component-${comp1.id}`);
    fireEvent.click(component);
    expect(component).toHaveAttribute('data-selected', 'true');

    // Press Delete key
    fireEvent.keyDown(window, { key: 'Delete' });

    // Component should be removed from DOM
    expect(screen.queryByTestId(`component-${comp1.id}`)).not.toBeInTheDocument();
  });

  it('should clear selection on Escape key', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <SetupHelper components={[comp1]} />
          <SchematicView />
        </DndContext>
      </CircuitProvider>
    );

    // Select the component
    const component = screen.getByTestId(`component-${comp1.id}`);
    fireEvent.click(component);
    expect(component).toHaveAttribute('data-selected', 'true');

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });

    // Component should no longer be selected
    expect(component).toHaveAttribute('data-selected', 'false');
  });

  it('should clear selection on canvas click', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <SetupHelper components={[comp1]} />
          <SchematicView />
        </DndContext>
      </CircuitProvider>
    );

    // Select the component
    const component = screen.getByTestId(`component-${comp1.id}`);
    fireEvent.click(component);
    expect(component).toHaveAttribute('data-selected', 'true');

    // Click the canvas (SVG element)
    const svg = screen.getByTestId('schematic-svg');
    fireEvent.click(svg);

    // Component should no longer be selected
    expect(component).toHaveAttribute('data-selected', 'false');
  });

  it('should select a wire on click', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <SetupHelper components={[comp1, comp2]} createWire />
          <SchematicView />
        </DndContext>
      </CircuitProvider>
    );

    // Click the wire
    const wire = screen.getByTestId('wire-conn-1');
    fireEvent.click(wire);

    // Wire should show selected style (green stroke)
    expect(wire).toHaveAttribute('stroke', '#4CAF50');
  });

  it('should delete selected wire on Backspace key', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <SetupHelper components={[comp1, comp2]} createWire />
          <SchematicView />
        </DndContext>
      </CircuitProvider>
    );

    // Click the wire to select it
    const wire = screen.getByTestId('wire-conn-1');
    fireEvent.click(wire);
    expect(wire).toHaveAttribute('stroke', '#4CAF50');

    // Press Backspace key
    fireEvent.keyDown(window, { key: 'Backspace' });

    // Wire should be removed
    expect(screen.queryByTestId('wire-conn-1')).not.toBeInTheDocument();
  });

  it('should not select component in wire mode', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <SetupHelper components={[comp1]} />
          <SchematicView />
        </DndContext>
      </CircuitProvider>
    );

    // Switch to wire mode
    fireEvent.keyDown(window, { key: 'w' });

    // Click component
    const component = screen.getByTestId(`component-${comp1.id}`);
    fireEvent.click(component);

    // Should NOT be selected
    expect(component).toHaveAttribute('data-selected', 'false');
  });

  it('should replace selection when clicking another component', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <SetupHelper components={[comp1, comp2]} />
          <SchematicView />
        </DndContext>
      </CircuitProvider>
    );

    // Select first component
    const component1 = screen.getByTestId(`component-${comp1.id}`);
    fireEvent.click(component1);
    expect(component1).toHaveAttribute('data-selected', 'true');

    // Select second component
    const component2 = screen.getByTestId(`component-${comp2.id}`);
    fireEvent.click(component2);

    // First should be deselected, second selected
    expect(component1).toHaveAttribute('data-selected', 'false');
    expect(component2).toHaveAttribute('data-selected', 'true');
  });
});
