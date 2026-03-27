import { useState, useCallback, useMemo } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { CircuitProvider } from './context/CircuitContext';
import { useCircuit } from './context/CircuitContext';
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { createComponentFromDefinition } from './utils/componentFactory';
import { snapToGrid } from './utils/grid';
import { DROPPABLE_CANVAS_ID } from './constants/dnd';
import { ComponentSymbol } from './components/ComponentSymbol';
import SchematicView from './views/SchematicView';
import { ComponentDrawer } from './views/ComponentDrawer';

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

    if (!over || over.id !== DROPPABLE_CANVAS_ID) {
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

    // Calculate drop position from dnd-kit event coordinates
    const overRect = over.rect;
    const activeRect = active.rect.current.translated;

    if (!activeRect) {
      return;
    }

    // The center of the dragged item relative to the droppable area
    const x = activeRect.left - overRect.left + activeRect.width / 2;
    const y = activeRect.top - overRect.top + activeRect.height / 2;

    const snappedX = snapToGrid(x);
    const snappedY = snapToGrid(y);

    const component = createComponentFromDefinition(definition, {
      x: snappedX,
      y: snappedY,
    });

    addComponent(component);
  }, [addComponent]);

  const handleDragCancel = useCallback(() => {
    setActiveType(null);
  }, []);

  const activeDefinition = useMemo(
    () => activeType ? ComponentRegistry.getInstance().get(activeType) : null,
    [activeType]
  );

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
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
            <ComponentSymbol
              definition={activeDefinition}
              width={60}
              height={60}
            />
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
