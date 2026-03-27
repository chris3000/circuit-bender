import { useState, useCallback } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { CircuitProvider } from './context/CircuitContext';
import { useCircuit } from './context/CircuitContext';
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { createComponentFromDefinition } from './utils/componentFactory';
import SchematicView from './views/SchematicView';
import { ComponentDrawer } from './views/ComponentDrawer';

const GRID_SIZE = 20;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function AppContent() {
  const { addComponent } = useCircuit();
  const [activeType, setActiveType] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const componentType = event.active.data.current?.componentType;
    if (componentType) {
      setActiveType(componentType);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveType(null);

    const { active, over } = event;

    if (!over || over.id !== 'schematic-canvas') {
      return;
    }

    const componentType = active.data.current?.componentType;
    if (!componentType) {
      return;
    }

    const registry = ComponentRegistry.getInstance();
    const definition = registry.get(componentType);
    if (!definition) {
      return;
    }

    // For now, use hardcoded center position - actual mouse position comes later
    const snappedX = snapToGrid(200);
    const snappedY = snapToGrid(200);

    const component = createComponentFromDefinition(definition, {
      x: snappedX,
      y: snappedY,
    });

    addComponent(component);
  }, [addComponent]);

  const activeDefinition = activeType
    ? ComponentRegistry.getInstance().get(activeType)
    : null;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="app">
        <header className="app-header">
          <h1>Circuit Bender</h1>
        </header>
        <main className="app-main">
          <ComponentDrawer />
          <SchematicView />
        </main>
      </div>
      <DragOverlay>
        {activeDefinition ? (
          <div style={{ opacity: 0.8, cursor: 'grabbing' }}>
            <svg
              width={60}
              height={60}
              viewBox={`${-activeDefinition.schematic.symbol.width / 2} ${-activeDefinition.schematic.symbol.height / 2} ${activeDefinition.schematic.symbol.width} ${activeDefinition.schematic.symbol.height}`}
            >
              {activeDefinition.schematic.symbol.render(activeDefinition.defaultParameters)}
            </svg>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function App() {
  return (
    <CircuitProvider>
      <AppContent />
    </CircuitProvider>
  );
}

export default App;
