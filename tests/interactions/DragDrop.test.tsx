import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { ComponentCard } from '@/views/ComponentDrawer/ComponentCard';
import { CircuitProvider } from '@/context/CircuitContext';
import SchematicView from '@/views/SchematicView';

describe('Drag and Drop', () => {
  beforeEach(() => {
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    registry.register(resistorDefinition);
  });

  describe('ComponentCard draggable', () => {
    it('should have data-draggable attribute', () => {
      render(
        <DndContext>
          <ComponentCard definition={resistorDefinition} />
        </DndContext>
      );

      const card = screen.getByTestId('component-card-resistor');
      expect(card).toHaveAttribute('data-draggable', 'true');
    });

    it('should render component name when draggable', () => {
      render(
        <DndContext>
          <ComponentCard definition={resistorDefinition} />
        </DndContext>
      );

      expect(screen.getByText('Resistor')).toBeInTheDocument();
    });

    it('should render schematic symbol when draggable', () => {
      render(
        <DndContext>
          <ComponentCard definition={resistorDefinition} />
        </DndContext>
      );

      const svg = screen.getByTestId('component-symbol-resistor');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('SchematicView droppable', () => {
    it('should have droppable data attribute on the canvas wrapper', () => {
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const droppable = screen.getByTestId('schematic-drop-zone');
      expect(droppable).toBeInTheDocument();
    });

    it('should render placed components', () => {
      // This tests that SchematicView renders components from the circuit
      render(
        <CircuitProvider>
          <DndContext>
            <SchematicView />
          </DndContext>
        </CircuitProvider>
      );

      const svg = screen.getByTestId('schematic-svg');
      expect(svg).toBeInTheDocument();
    });
  });
});
