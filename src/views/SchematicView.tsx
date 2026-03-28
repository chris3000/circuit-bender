import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import { GRID_SIZE, snapToGrid } from '@/utils/grid';
import { validateConnection } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import { DROPPABLE_CANVAS_ID } from '@/constants/dnd';
import { DraggableComponent } from './SchematicView/DraggableComponent';
import { Toolbar } from './SchematicView/Toolbar';
import { PreviewWire } from './SchematicView/PreviewWire';
import { Wire } from './SchematicView/Wire';
import type { ToolMode } from './SchematicView/Toolbar';
import type { ComponentId, PinId, ConnectionId } from '@/types/circuit';
import styles from './SchematicView.module.css';

const GRID_COLOR = '#e0e0e0';

type WiringState =
  | { status: 'idle' }
  | {
      status: 'in-progress';
      fromComponentId: ComponentId;
      fromPinId: PinId;
      startX: number;
      startY: number;
    };

function SchematicView() {
  const {
    circuit,
    updateComponent,
    addConnection,
    removeComponent,
    removeConnection,
    selectedComponents,
    selectedConnections,
    setSelection,
    clearSelection,
  } = useCircuit();
  const [zoom, setZoom] = useState(1);
  const [pan] = useState({ x: 0, y: 0 });
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [wiringState, setWiringState] = useState<WiringState>({ status: 'idle' });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_CANVAS_ID,
  });

  const components = useMemo(() => circuit.getComponents(), [circuit]);
  const connections = useMemo(() => circuit.getConnections(), [circuit]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'w') {
        setToolMode('wire');
      } else if (key === 'v') {
        setToolMode('select');
        setWiringState({ status: 'idle' });
      } else if (key === 'escape') {
        setToolMode('select');
        setWiringState({ status: 'idle' });
        clearSelection();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Remove all selected items
        selectedComponents.forEach((id) => removeComponent(id));
        selectedConnections.forEach((id) => removeConnection(id));
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedComponents, selectedConnections, removeComponent, removeConnection, clearSelection]);

  const handleToolModeChange = useCallback((mode: ToolMode) => {
    setToolMode(mode);
    if (mode !== 'wire') {
      setWiringState({ status: 'idle' });
    }
  }, []);

  const wiringStateRef = useRef<WiringState>(wiringState);
  wiringStateRef.current = wiringState;

  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;

  const handlePinClick = useCallback((componentId: ComponentId, pinId: PinId) => {
    const currentState = wiringStateRef.current;
    const currentCircuit = circuitRef.current;

    if (currentState.status === 'idle') {
      // Start wiring from this pin
      const component = currentCircuit.getComponent(componentId);
      const pin = component?.pins.find(p => p.id === pinId);
      if (!component || !pin) return;

      const startX = component.position.schematic.x + pin.position.x;
      const startY = component.position.schematic.y + pin.position.y;

      setWiringState({
        status: 'in-progress',
        fromComponentId: componentId,
        fromPinId: pinId,
        startX,
        startY,
      });
    } else {
      // Complete wiring: validate and create connection
      const validation = validateConnection(
        currentState.fromComponentId,
        currentState.fromPinId,
        componentId,
        pinId,
        currentCircuit
      );

      if (!validation.valid) {
        // TODO: Replace alert with toast notification
        alert(validation.error);
        setWiringState({ status: 'idle' });
        return;
      }

      addConnection({
        id: generateConnectionId(),
        from: { componentId: currentState.fromComponentId, pinId: currentState.fromPinId },
        to: { componentId, pinId },
        net: generateNetId(),
      });

      setWiringState({ status: 'idle' });
    }
  }, [addConnection]);

  const wiringStatusRef = useRef(wiringState.status);
  wiringStatusRef.current = wiringState.status;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (wiringStatusRef.current !== 'in-progress') return;

      const svg = svgRef.current;
      if (!svg) return;

      // Convert screen coordinates to SVG coordinates
      const rect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;

      const scaleX = viewBox.width / rect.width;
      const scaleY = viewBox.height / rect.height;

      const cursorX = (e.clientX - rect.left) * scaleX + viewBox.x;
      const cursorY = (e.clientY - rect.top) * scaleY + viewBox.y;

      setCursorPos({ x: cursorX, y: cursorY });
    },
    []
  );

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

  const wiresWithPositions = useMemo(() => {
    return connections.map(conn => {
      const fromComp = circuit.getComponent(conn.from.componentId);
      const toComp = circuit.getComponent(conn.to.componentId);
      const fromPin = fromComp?.pins.find(p => p.id === conn.from.pinId);
      const toPin = toComp?.pins.find(p => p.id === conn.to.pinId);

      return {
        connectionId: conn.id,
        fromX: fromComp && fromPin ? fromComp.position.schematic.x + fromPin.position.x : 0,
        fromY: fromComp && fromPin ? fromComp.position.schematic.y + fromPin.position.y : 0,
        toX: toComp && toPin ? toComp.position.schematic.x + toPin.position.x : 0,
        toY: toComp && toPin ? toComp.position.schematic.y + toPin.position.y : 0,
      };
    });
  }, [connections, circuit]);

  const handleComponentClick = useCallback((componentId: ComponentId) => {
    setSelection([componentId], []);
  }, [setSelection]);

  const handleWireClick = useCallback((connectionId: ConnectionId) => {
    setSelection([], [connectionId]);
  }, [setSelection]);

  const handleCanvasClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

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
        <Toolbar toolMode={toolMode} onToolModeChange={handleToolModeChange} />

        <svg
          ref={svgRef}
          className={styles.canvas}
          data-testid="schematic-svg"
          viewBox={`${-pan.x} ${-pan.y} ${1000 / zoom} ${800 / zoom}`}
          onMouseMove={handleMouseMove}
          onClick={handleCanvasClick}
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
              <DraggableComponent
                key={component.id}
                component={component}
                toolMode={toolMode}
                isSelected={selectedComponents.includes(component.id)}
                onPinClick={handlePinClick}
                onClick={() => handleComponentClick(component.id)}
              />
            ))}
          </DndContext>

          {/* Render committed connections */}
          {wiresWithPositions.map((wire) => (
            <Wire
              key={wire.connectionId}
              connectionId={wire.connectionId}
              fromX={wire.fromX}
              fromY={wire.fromY}
              toX={wire.toX}
              toY={wire.toY}
              isSelected={selectedConnections.includes(wire.connectionId)}
              onClick={handleWireClick}
            />
          ))}

          {/* Render preview wire when wiring is in progress */}
          {wiringState.status === 'in-progress' && (
            <PreviewWire
              fromX={wiringState.startX}
              fromY={wiringState.startY}
              toX={cursorPos.x}
              toY={cursorPos.y}
            />
          )}
        </svg>
      </div>
    </div>
  );
}

export default SchematicView;
