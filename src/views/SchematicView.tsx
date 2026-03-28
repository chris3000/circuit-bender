import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { DndContext, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
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
import { ParameterEditor } from './SchematicView/ParameterEditor';
import { formatValue } from '@/utils/parameterParser';
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

interface SchematicViewProps {
  activeView?: 'schematic' | 'breadboard';
  onToggleView?: () => void;
  ledStates?: Record<string, boolean>;
  onPotChange?: (componentId: string, position: number) => void;
}

function SchematicView({ activeView, onToggleView, ledStates = {}, onPotChange }: SchematicViewProps = {}) {
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
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCircuit();
  const [zoom, setZoom] = useState(1);
  const [pan] = useState({ x: 0, y: 0 });
  const [wiringState, setWiringState] = useState<WiringState>({ status: 'idle' });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [editingComponentId, setEditingComponentId] = useState<ComponentId | null>(null);
  const [dragState, setDragState] = useState<{ id: string; dx: number; dy: number } | null>(null);
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'escape') {
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
  }, [selectedComponents, selectedConnections, removeComponent, removeConnection, clearSelection, undo, redo]);

  const wiringStateRef = useRef<WiringState>(wiringState);
  wiringStateRef.current = wiringState;

  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;

  // Mouse down on a pin starts wiring
  const handlePinDown = useCallback((componentId: ComponentId, pinId: PinId) => {
    const currentCircuit = circuitRef.current;
    const component = currentCircuit.getComponent(componentId);
    const pin = component?.pins.find(p => p.id === pinId);
    if (!component || !pin) return;

    const startX = component.position.schematic.x + pin.position.x;
    const startY = component.position.schematic.y + pin.position.y;

    setCursorPos({ x: startX, y: startY });
    setWiringState({
      status: 'in-progress',
      fromComponentId: componentId,
      fromPinId: pinId,
      startX,
      startY,
    });
  }, []);

  // Mouse up on a pin completes wiring
  const handlePinUp = useCallback((componentId: ComponentId, pinId: PinId) => {
    const currentState = wiringStateRef.current;
    if (currentState.status !== 'in-progress') return;

    const currentCircuit = circuitRef.current;
    const validation = validateConnection(
      currentState.fromComponentId,
      currentState.fromPinId,
      componentId,
      pinId,
      currentCircuit
    );

    if (!validation.valid) {
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
  }, [addConnection]);

  const wiringStatusRef = useRef(wiringState.status);
  wiringStatusRef.current = wiringState.status;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (wiringStatusRef.current !== 'in-progress') return;

      const svg = svgRef.current;
      if (!svg) return;

      // Use SVG's own coordinate transform for accurate mapping
      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const inverseCTM = ctm.inverse();
      const cursorX = inverseCTM.a * e.clientX + inverseCTM.c * e.clientY + inverseCTM.e;
      const cursorY = inverseCTM.b * e.clientX + inverseCTM.d * e.clientY + inverseCTM.f;

      setCursorPos({ x: cursorX, y: cursorY });
    },
    []
  );

  const handleComponentDragMove = useCallback((event: DragMoveEvent) => {
    const { active, delta } = event;
    setDragState({ id: active.id as string, dx: delta.x, dy: delta.y });
  }, []);

  const handleComponentMove = useCallback((event: DragEndEvent) => {
    setDragState(null);

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

  const handleComponentDragCancel = useCallback(() => {
    setDragState(null);
  }, []);

  const wiresWithPositions = useMemo(() => {
    return connections.map(conn => {
      const fromComp = circuit.getComponent(conn.from.componentId);
      const toComp = circuit.getComponent(conn.to.componentId);
      const fromPin = fromComp?.pins.find(p => p.id === conn.from.pinId);
      const toPin = toComp?.pins.find(p => p.id === conn.to.pinId);

      // Apply drag offset if this component is being dragged
      const fromDrag = dragState && fromComp && dragState.id === fromComp.id ? dragState : null;
      const toDrag = dragState && toComp && dragState.id === toComp.id ? dragState : null;

      return {
        connectionId: conn.id,
        fromX: fromComp && fromPin ? fromComp.position.schematic.x + fromPin.position.x + (fromDrag?.dx ?? 0) : 0,
        fromY: fromComp && fromPin ? fromComp.position.schematic.y + fromPin.position.y + (fromDrag?.dy ?? 0) : 0,
        toX: toComp && toPin ? toComp.position.schematic.x + toPin.position.x + (toDrag?.dx ?? 0) : 0,
        toY: toComp && toPin ? toComp.position.schematic.y + toPin.position.y + (toDrag?.dy ?? 0) : 0,
      };
    });
  }, [connections, circuit, dragState]);

  const handleComponentClick = useCallback((componentId: ComponentId) => {
    setSelection([componentId], []);
  }, [setSelection]);

  const handleWireClick = useCallback((connectionId: ConnectionId) => {
    setSelection([], [connectionId]);
  }, [setSelection]);

  const handleCanvasClick = useCallback(() => {
    clearSelection();
    setEditingComponentId(null);
    setWiringState({ status: 'idle' });
  }, [clearSelection]);

  const handleEditParameter = useCallback((componentId: ComponentId) => {
    setEditingComponentId(componentId);
  }, []);

  const handleParameterConfirm = useCallback(
    (rawValue: number, displayValue: string) => {
      if (!editingComponentId) return;
      const comp = circuit.getComponent(editingComponentId);
      if (!comp) return;

      const paramKey = comp.type === 'resistor' ? 'resistance' : 'capacitance';
      updateComponent(editingComponentId, {
        parameters: {
          ...comp.parameters,
          [paramKey]: rawValue,
          value: displayValue,
        },
      });
      setEditingComponentId(null);
    },
    [editingComponentId, circuit, updateComponent]
  );

  const handleParameterCancel = useCallback(() => {
    setEditingComponentId(null);
  }, []);

  return (
    <div className={styles.container}>
      <div
        ref={setNodeRef}
        data-testid="schematic-drop-zone"
        className={styles.dropZone}
        style={{
          outline: isOver ? '2px dashed #FF2D55' : 'none',
        }}
      >
        <Toolbar
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          activeView={activeView}
          onToggleView={onToggleView}
          zoom={zoom}
          onZoomIn={() => setZoom(Math.min(zoom + 0.1, 3))}
          onZoomOut={() => setZoom(Math.max(zoom - 0.1, 0.5))}
        />

        {components.length === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            fontFamily: "'Courier New', Courier, monospace",
            zIndex: 5,
            pointerEvents: 'none',
          }}>
            <div style={{
              width: 48,
              height: 48,
              background: '#EBEBEB',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M12,4 L12,20 M4,12 L20,12" stroke="#999" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, color: '#999', fontWeight: 'bold' }}>
              Drag a component to start
            </div>
            <div style={{ fontSize: 10, color: '#CCC', marginTop: 4 }}>
              from the sidebar on the left
            </div>
          </div>
        )}

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
            <pattern id="dotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.8" fill="#CCC" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width="100%" height="100%" fill="url(#dotGrid)" opacity="0.3" />

          <rect
            data-testid="schematic-grid"
            x={-pan.x}
            y={-pan.y}
            width={10000}
            height={10000}
            fill="url(#grid)"
          />

          {/* Render placed components with drag-to-move support */}
          <DndContext onDragMove={handleComponentDragMove} onDragEnd={handleComponentMove} onDragCancel={handleComponentDragCancel}>
            {components.map((component) => (
              <DraggableComponent
                key={component.id}
                component={component}
                isSelected={selectedComponents.includes(component.id)}
                ledOn={ledStates[component.id] || false}
                onPinDown={handlePinDown}
                onPinUp={handlePinUp}
                onClick={() => handleComponentClick(component.id)}
                onEditParameter={handleEditParameter}
                onPotChange={onPotChange}
              />
            ))}
          </DndContext>

          {/* Render inline parameter editor */}
          {editingComponentId && (() => {
            const comp = circuit.getComponent(editingComponentId);
            if (!comp) return null;
            const paramKey = comp.type === 'resistor' ? 'resistance' : 'capacitance';
            const numValue = comp.parameters[paramKey] as number;
            const displayValue = comp.parameters.value as string ?? formatValue(numValue, paramKey);
            return (
              <ParameterEditor
                value={displayValue}
                parameterKey={paramKey}
                position={comp.position.schematic}
                onConfirm={handleParameterConfirm}
                onCancel={handleParameterCancel}
              />
            );
          })()}

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
