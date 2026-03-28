import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { DndContext, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import { validateConnection } from '@/utils/wiring';
import { generateOrthogonalPath } from '@/utils/wiring';
import { DROPPABLE_BOARD_ID } from '@/constants/dnd';
import { snapToGrid } from '@/utils/grid';
import { BoardBackground } from './BoardBackground';
import { BoardComponent } from './BoardComponent';
import { BoardWire, getWireColor } from './BoardWire';
import { ParameterEditor } from '@/views/SchematicView/ParameterEditor';
import { Toolbar } from '@/views/SchematicView/Toolbar';
import type { ComponentId, PinId, ConnectionId } from '@/types/circuit';
import { generateConnectionId, generateNetId } from '@/utils/ids';

interface BoardViewProps {
  activeView: 'schematic' | 'board';
  onToggleView: () => void;
  ledStates?: Record<string, boolean>;
  onPotChange?: (componentId: string, position: number) => void;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
}

interface WiringState {
  active: boolean;
  fromComponentId?: ComponentId;
  fromPinId?: PinId;
}

export default function BoardView({
  activeView,
  onToggleView,
  ledStates = {},
  onPotChange,
  onAddProbe,
}: BoardViewProps) {
  const {
    circuit,
    addConnection,
    removeComponent,
    removeConnection,
    updateComponent,
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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [wiringState, setWiringState] = useState<WiringState>({ active: false });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [editingComponentId, setEditingComponentId] = useState<ComponentId | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { setNodeRef } = useDroppable({ id: DROPPABLE_BOARD_ID });

  const [dragState, setDragState] = useState<{ id: string; dx: number; dy: number } | null>(null);

  const components = useMemo(() => circuit.getComponents(), [circuit]);
  const connections = useMemo(() => circuit.getConnections(), [circuit]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        selectedComponents.forEach(id => removeComponent(id));
        selectedConnections.forEach(id => removeConnection(id));
        clearSelection();
      } else if (e.key === 'Escape') {
        setWiringState({ active: false });
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, removeComponent, removeConnection, selectedComponents, selectedConnections, clearSelection]);

  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()?.inverse());
    return { x: svgP.x, y: svgP.y };
  }, []);

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (wiringState.active) {
        setCursorPos(screenToSvg(e.clientX, e.clientY));
      }
    },
    [wiringState.active, screenToSvg]
  );

  const handlePinDown = useCallback(
    (componentId: ComponentId, pinId: PinId) => {
      setWiringState({ active: true, fromComponentId: componentId, fromPinId: pinId });
    },
    []
  );

  const handlePinUp = useCallback(
    (componentId: ComponentId, pinId: PinId) => {
      if (!wiringState.active || !wiringState.fromComponentId || !wiringState.fromPinId) return;

      const result = validateConnection(
        wiringState.fromComponentId,
        wiringState.fromPinId,
        componentId,
        pinId,
        circuit
      );

      if (result.valid) {
        addConnection({
          id: generateConnectionId(),
          from: { componentId: wiringState.fromComponentId, pinId: wiringState.fromPinId },
          to: { componentId, pinId },
          net: generateNetId(),
        });
      }

      setWiringState({ active: false });
    },
    [wiringState, circuit, addConnection]
  );

  const handleComponentClick = useCallback(
    (componentId: ComponentId) => {
      setSelection([componentId], []);
    },
    [setSelection]
  );

  const handleWireClick = useCallback(
    (connectionId: ConnectionId) => {
      setSelection([], [connectionId]);
    },
    [setSelection]
  );

  const handleWireContextMenu = useCallback(
    (connectionId: ConnectionId, _e: React.MouseEvent) => {
      if (!onAddProbe) return;
      const conn = connections.find(c => c.id === connectionId);
      if (!conn) return;
      const comp = circuit.getComponent(conn.from.componentId);
      const pin = comp?.pins.find(p => p.id === conn.from.pinId);
      if (comp && pin) {
        onAddProbe(conn.from.componentId, conn.from.pinId, `${comp.type}:${pin.label}`);
      }
    },
    [connections, circuit, onAddProbe]
  );

  // Component drag handlers
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
    const newX = snapToGrid(component.position.x + delta.x);
    const newY = snapToGrid(component.position.y + delta.y);
    if (newX === component.position.x && newY === component.position.y) return;
    updateComponent(componentId, { position: { x: newX, y: newY } });
  }, [circuit, updateComponent]);

  const handleComponentDragCancel = useCallback(() => {
    setDragState(null);
  }, []);

  const handleCanvasClick = useCallback(() => {
    clearSelection();
    setWiringState({ active: false });
  }, [clearSelection]);

  const handleEditParameter = useCallback((componentId: ComponentId) => {
    setEditingComponentId(componentId);
  }, []);

  const getPinPosition = useCallback(
    (componentId: ComponentId, pinId: PinId) => {
      const comp = circuit.getComponent(componentId);
      if (!comp) return { x: 0, y: 0 };
      const pin = comp.pins.find(p => p.id === pinId);
      if (!pin) return { x: 0, y: 0 };
      return {
        x: comp.position.x + pin.position.x,
        y: comp.position.y + pin.position.y,
      };
    },
    [circuit]
  );

  const viewBox = useMemo(() => {
    const w = 1200 / zoom;
    const h = 800 / zoom;
    return `${-w / 2 + pan.x} ${-h / 2 + pan.y} ${w} ${h}`;
  }, [zoom, pan]);

  // Suppress unused variable warning for setPan — kept for future panning interaction
  void setPan;

  return (
    <div
      ref={setNodeRef}
      style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
    >
      <Toolbar
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        activeView={activeView}
        onToggleView={onToggleView}
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(z * 1.2, 5))}
        onZoomOut={() => setZoom(z => Math.max(z / 1.2, 0.2))}
      />
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={viewBox}
        style={{ display: 'block' }}
        onMouseMove={handleSvgMouseMove}
        onClick={handleCanvasClick}
      >
        <BoardBackground />

        {connections.map((conn) => {
          const fromComp = circuit.getComponent(conn.from.componentId);
          const toComp = circuit.getComponent(conn.to.componentId);
          const fromPin = fromComp?.pins.find(p => p.id === conn.from.pinId);
          const toPin = toComp?.pins.find(p => p.id === conn.to.pinId);
          const fromDrag = dragState && fromComp && dragState.id === fromComp.id ? dragState : null;
          const toDrag = dragState && toComp && dragState.id === toComp.id ? dragState : null;

          return (
            <BoardWire
              key={conn.id}
              connectionId={conn.id}
              fromX={fromComp && fromPin ? fromComp.position.x + fromPin.position.x + (fromDrag?.dx ?? 0) : 0}
              fromY={fromComp && fromPin ? fromComp.position.y + fromPin.position.y + (fromDrag?.dy ?? 0) : 0}
              toX={toComp && toPin ? toComp.position.x + toPin.position.x + (toDrag?.dx ?? 0) : 0}
              toY={toComp && toPin ? toComp.position.y + toPin.position.y + (toDrag?.dy ?? 0) : 0}
              color={getWireColor(
                fromComp?.type || '',
                fromPin?.type || '',
                toComp?.type || '',
                toPin?.type || '',
              )}
              isSelected={selectedConnections.includes(conn.id)}
              onClick={handleWireClick}
              onContextMenu={handleWireContextMenu}
            />
          );
        })}

        <DndContext onDragMove={handleComponentDragMove} onDragEnd={handleComponentMove} onDragCancel={handleComponentDragCancel}>
          {components.map((comp) => (
            <BoardComponent
              key={comp.id}
              component={comp}
              isSelected={selectedComponents.includes(comp.id)}
              ledOn={ledStates[comp.id]}
              onPinDown={handlePinDown}
              onPinUp={handlePinUp}
              onClick={() => handleComponentClick(comp.id)}
              onEditParameter={handleEditParameter}
              onPotChange={onPotChange}
            />
          ))}
        </DndContext>

        {wiringState.active && wiringState.fromComponentId && wiringState.fromPinId && (
          <path
            d={generateOrthogonalPath(
              getPinPosition(wiringState.fromComponentId, wiringState.fromPinId).x,
              getPinPosition(wiringState.fromComponentId, wiringState.fromPinId).y,
              cursorPos.x,
              cursorPos.y,
            )}
            fill="none"
            stroke="#a8d8a8"
            strokeWidth="2"
            strokeDasharray="4 3"
            pointerEvents="none"
            opacity="0.7"
          />
        )}

        {editingComponentId && (() => {
          const comp = circuit.getComponent(editingComponentId);
          if (!comp) return null;
          const paramKey = comp.type === 'resistor' ? 'resistance' : comp.type === 'capacitor' ? 'capacitance' : null;
          if (!paramKey) return null;
          return (
            <ParameterEditor
              value={String(comp.parameters.value || '')}
              parameterKey={paramKey as 'resistance' | 'capacitance'}
              position={{ x: comp.position.x, y: comp.position.y - 40 }}
              onConfirm={(rawValue, displayValue) => {
                updateComponent(editingComponentId, {
                  parameters: { ...comp.parameters, [paramKey]: rawValue, value: displayValue },
                });
                setEditingComponentId(null);
              }}
              onCancel={() => setEditingComponentId(null)}
            />
          );
        })()}
      </svg>
    </div>
  );
}
