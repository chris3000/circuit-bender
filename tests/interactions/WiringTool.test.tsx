import React, { useEffect, useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import SchematicView from '@/views/SchematicView';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { snapToGrid } from '@/utils/grid';
import type { Component, ComponentId, PinId } from '@/types/circuit';

// Helper component that adds a component to the circuit on mount
function AddComponentHelper({ component }: { component: Component }) {
  const { addComponent } = useCircuit();
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) {
      addComponent(component);
      setAdded(true);
    }
  }, [added, addComponent, component]);
  return null;
}

describe('Wiring Tool', () => {
  let testComponent: Component;
  let testComponent2: Component;

  beforeEach(() => {
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    registry.register(resistorDefinition);

    testComponent = createComponentFromDefinition(resistorDefinition, {
      x: snapToGrid(100),
      y: snapToGrid(200),
    });

    testComponent2 = createComponentFromDefinition(resistorDefinition, {
      x: snapToGrid(300),
      y: snapToGrid(200),
    });
  });

  describe('Toolbar rendering', () => {
    it('should render toolbar with select and wire buttons', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const selectBtn = screen.getByRole('button', { name: /select/i });
      const wireBtn = screen.getByRole('button', { name: /wire/i });
      expect(selectBtn).toBeInTheDocument();
      expect(wireBtn).toBeInTheDocument();
    });

    it('should have select mode active by default', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const selectBtn = screen.getByRole('button', { name: /select/i });
      expect(selectBtn).toHaveAttribute('data-active', 'true');
    });

    it('should switch active state when wire button is clicked', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const selectBtn = screen.getByRole('button', { name: /select/i });
      const wireBtn = screen.getByRole('button', { name: /wire/i });

      fireEvent.click(wireBtn);

      expect(wireBtn).toHaveAttribute('data-active', 'true');
      expect(selectBtn).toHaveAttribute('data-active', 'false');
    });

    it('should switch back to select mode when select button is clicked', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const selectBtn = screen.getByRole('button', { name: /select/i });
      const wireBtn = screen.getByRole('button', { name: /wire/i });

      fireEvent.click(wireBtn);
      fireEvent.click(selectBtn);

      expect(selectBtn).toHaveAttribute('data-active', 'true');
      expect(wireBtn).toHaveAttribute('data-active', 'false');
    });
  });

  describe('Keyboard shortcuts', () => {
    it('should switch to wire mode when W key is pressed', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      fireEvent.keyDown(window, { key: 'w' });

      const wireBtn = screen.getByRole('button', { name: /wire/i });
      expect(wireBtn).toHaveAttribute('data-active', 'true');
    });

    it('should switch to select mode when V key is pressed', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      // First switch to wire mode
      fireEvent.keyDown(window, { key: 'w' });
      // Then switch back to select mode
      fireEvent.keyDown(window, { key: 'v' });

      const selectBtn = screen.getByRole('button', { name: /select/i });
      expect(selectBtn).toHaveAttribute('data-active', 'true');
    });

    it('should cancel wire mode and reset wiring state when Escape is pressed', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      // Switch to wire mode
      fireEvent.keyDown(window, { key: 'w' });

      // Press Escape to cancel
      fireEvent.keyDown(window, { key: 'Escape' });

      const selectBtn = screen.getByRole('button', { name: /select/i });
      expect(selectBtn).toHaveAttribute('data-active', 'true');
    });

    it('should handle uppercase W key', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      fireEvent.keyDown(window, { key: 'W' });

      const wireBtn = screen.getByRole('button', { name: /wire/i });
      expect(wireBtn).toHaveAttribute('data-active', 'true');
    });

    it('should handle uppercase V key', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      fireEvent.keyDown(window, { key: 'w' });
      fireEvent.keyDown(window, { key: 'V' });

      const selectBtn = screen.getByRole('button', { name: /select/i });
      expect(selectBtn).toHaveAttribute('data-active', 'true');
    });
  });

  describe('Pin rendering', () => {
    it('should render pins on components', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <AddComponentHelper component={testComponent} />
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      // Resistor has 2 pins
      const pins = screen.getAllByTestId(/^pin-/);
      expect(pins.length).toBeGreaterThanOrEqual(2);
    });

    it('should render pins with correct test IDs', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <AddComponentHelper component={testComponent} />
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const pin1 = screen.getByTestId(`pin-${testComponent.id}-${testComponent.pins[0].id}`);
      const pin2 = screen.getByTestId(`pin-${testComponent.id}-${testComponent.pins[1].id}`);
      expect(pin1).toBeInTheDocument();
      expect(pin2).toBeInTheDocument();
    });
  });

  describe('Drag disabled in wire mode', () => {
    it('should disable dragging when in wire mode', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <AddComponentHelper component={testComponent} />
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      // Switch to wire mode
      fireEvent.keyDown(window, { key: 'w' });

      const placedComponent = screen.getByTestId(`component-${testComponent.id}`);
      expect(placedComponent).toHaveAttribute('data-draggable', 'false');
    });

    it('should re-enable dragging when switching back to select mode', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <AddComponentHelper component={testComponent} />
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      // Switch to wire mode
      fireEvent.keyDown(window, { key: 'w' });

      // Switch back to select mode
      fireEvent.keyDown(window, { key: 'v' });

      const placedComponent = screen.getByTestId(`component-${testComponent.id}`);
      expect(placedComponent).toHaveAttribute('data-draggable', 'true');
    });
  });

  describe('Preview wire', () => {
    it('should not render preview wire when not wiring', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <AddComponentHelper component={testComponent} />
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      expect(screen.queryByTestId('preview-wire')).not.toBeInTheDocument();
    });

    it('should render preview wire with correct attributes when wiring is in progress', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <AddComponentHelper component={testComponent} />
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      // Switch to wire mode
      fireEvent.keyDown(window, { key: 'w' });

      // Click a pin to start wiring
      const pin = screen.getByTestId(`pin-${testComponent.id}-${testComponent.pins[0].id}`);
      fireEvent.click(pin);

      // Preview wire should now be rendered
      const previewWire = screen.getByTestId('preview-wire');
      expect(previewWire).toBeInTheDocument();

      // Verify dashed stroke
      expect(previewWire).toHaveAttribute('stroke-dasharray', '4 4');

      // Verify pointer-events is none (doesn't interfere with clicks)
      expect(previewWire).toHaveAttribute('pointer-events', 'none');

      // Verify it has a valid d attribute (path data)
      const d = previewWire.getAttribute('d');
      expect(d).toBeTruthy();
      expect(d).toMatch(/^M\s/); // Path data should start with M (moveto)
    });
  });

  describe('Tool mode state', () => {
    it('should start in select mode by default', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const selectBtn = screen.getByRole('button', { name: /select/i });
      const wireBtn = screen.getByRole('button', { name: /wire/i });
      expect(selectBtn).toHaveAttribute('data-active', 'true');
      expect(wireBtn).toHaveAttribute('data-active', 'false');
    });

    it('should persist tool mode across re-renders', () => {
      const { rerender } = render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      fireEvent.keyDown(window, { key: 'w' });

      // Force re-render
      rerender(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const wireBtn = screen.getByRole('button', { name: /wire/i });
      expect(wireBtn).toHaveAttribute('data-active', 'true');
    });
  });
});
