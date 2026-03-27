import { useState, useCallback } from 'react';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import { GRID_SIZE, snapToGrid } from '@/utils/grid';
import { DROPPABLE_CANVAS_ID } from '@/constants/dnd';
import { DraggableComponent } from './SchematicView/DraggableComponent';
import type { ComponentId } from '@/types/circuit';
import styles from './SchematicView.module.css';

const GRID_COLOR = '#e0e0e0';

function SchematicView() {
  const { circuit, updateComponent } = useCircuit();
  const [zoom, setZoom] = useState(1);
  const [pan] = useState({ x: 0, y: 0 });

  const { setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_CANVAS_ID,
  });

  const components = circuit.getComponents();

  const handleComponentMove = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    const componentId = active.id as ComponentId;
    const component = circuit.getComponent(componentId);
    if (!component) return;

    const newX = snapToGrid(component.position.schematic.x + delta.x);
    const newY = snapToGrid(component.position.schematic.y + delta.y);

    if (newX === component.position.schematic.x && newY === component.position.schematic.y) return;

    updateComponent(componentId, {
      position: {
        ...component.position,
        schematic: { x: newX, y: newY },
      },
    });
  }, [circuit, updateComponent]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(Math.min(zoom + 0.1, 3))}>+</button>
        <button onClick={() => setZoom(Math.max(zoom - 0.1, 0.5))}>-</button>
      </div>

      <div
        ref={setNodeRef}
        data-testid="schematic-drop-zone"
        className={styles.dropZone}
        style={{
          outline: isOver ? '2px dashed #3b82f6' : 'none',
        }}
      >
        <svg
          className={styles.canvas}
          data-testid="schematic-svg"
          viewBox={`${-pan.x} ${-pan.y} ${1000 / zoom} ${800 / zoom}`}
        >
          <defs>
            <pattern
              id="grid"
              width={GRID_SIZE}
              height={GRID_SIZE}
              patternUnits="userSpaceOnUse"
            >
              <rect width={GRID_SIZE} height={GRID_SIZE} fill="white" />
              <path
                d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                fill="none"
                stroke={GRID_COLOR}
                strokeWidth="0.5"
              />
            </pattern>
          </defs>

          <rect
            data-testid="schematic-grid"
            x={-pan.x}
            y={-pan.y}
            width={10000}
            height={10000}
            fill="url(#grid)"
          />

          {/* Render placed components with drag-to-move support */}
          <DndContext onDragEnd={handleComponentMove}>
            {components.map((component) => (
              <DraggableComponent key={component.id} component={component} />
            ))}
          </DndContext>
        </svg>
      </div>
    </div>
  );
}

export default SchematicView;
