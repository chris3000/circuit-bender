import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import { GRID_SIZE } from '@/utils/grid';
import { DROPPABLE_CANVAS_ID } from '@/constants/dnd';
import styles from './SchematicView.module.css';

const GRID_COLOR = '#e0e0e0';

function SchematicView() {
  const { circuit } = useCircuit();
  const [zoom, setZoom] = useState(1);
  const [pan] = useState({ x: 0, y: 0 });

  const { setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_CANVAS_ID,
  });

  const components = circuit.getComponents();

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

          {/* Render placed components */}
          {components.map((component) => (
            <g
              key={component.id}
              data-testid={`placed-component-${component.id}`}
              transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}
            >
              <circle r="5" fill="blue" />
              <text y="15" textAnchor="middle" fontSize="10">
                {component.type}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default SchematicView;
