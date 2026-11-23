import { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Edge,
  type ReactFlowInstance,
} from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { pointToPolylineDistance } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import type { ComponentId, PinId } from '@/types/circuit';
import { useCircuitSync } from './useCircuitSync';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { ConnectionLine } from './ConnectionLine';
import { WireRoutesContext } from './routing/useWireRoutes';
import { Toolbar } from '@/views/SchematicView/Toolbar';
import { readPartDrag } from '@/views/ComponentDrawer/dragData';
import { Inspector } from '@/views/Inspector/Inspector';
import { EmptyState } from './EmptyState';
import type { ActiveView } from '@/views/viewModes';
import { BendTool, type Bend } from './BendTool';

const DELETE_KEYS = ['Backspace', 'Delete'];

interface CircuitCanvasProps {
  viewMode: 'schematic' | 'board';
  /** The view the app is showing: this canvas drawn as `viewMode`, or the cover. */
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  /**
   * Out of sight while the cover is shown. The canvas stays where it is (and
   * the size it is), so coming back finds it as it was left.
   */
  hidden?: boolean;
  ledStates: Record<string, boolean>;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
  /** Whether the circuit is running. */
  playing?: boolean;
  /** Hold a jumper between two points of the running circuit, or let go of it (null). */
  onBend?: (bend: Bend | null) => void;
}

function CircuitCanvasInner({
  viewMode, activeView, onSelectView, hidden = false, ledStates, onAddProbe, playing = false, onBend,
}: CircuitCanvasProps) {
  const { addComponent, addConnection, removeConnection, updateComponent, selectedComponents, undo, redo, canUndo, canRedo, circuit } = useCircuit();
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const {
    nodes, edges, routes, onNodesChange, onNodeDragStop, onSelectionDragStop, onEdgesChange, onConnect: onConnectSync,
    isValidConnection, onSelectionChange, onNodesDelete, onEdgesDelete, deleteComponents,
  } = useCircuitSync(viewMode, ledStates);
  const routesRef = useRef(routes);
  routesRef.current = routes;

  // The bend tool: while it is on, parts stay put and pins do not start wires,
  // so that pressing on them can pick up a jumper instead
  const surface = useRef<HTMLDivElement>(null);
  const [bendMode, setBendMode] = useState(false);
  const bending = bendMode && !hidden && Boolean(onBend);
  const toggleBend = useCallback(() => setBendMode((on) => !on), []);
  const stopBending = useCallback(() => setBendMode(false), []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = readPartDrag(e.dataTransfer);
    if (!dropped || !reactFlowInstance.current) return;
    const registry = ComponentRegistry.getInstance();
    const definition = registry.get(dropped.type);
    if (!definition) return;
    const position = reactFlowInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    // Parts sit on the same 20px grid they snap to when dragged, so pins line up
    const component = createComponentFromDefinition(definition, {
      x: Math.round(position.x / 20) * 20,
      y: Math.round(position.y / 20) * 20,
    }, dropped.parameters); // the value picked from the shelf
    addComponent(component);
  }, [addComponent]);

  const [flowReady, setFlowReady] = useState(false);
  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
    setFlowReady(true); // parts may have been measured before this; the fit below waits for both
  }, []);

  // A circuit that has just been opened (an example, a save, a file, or the
  // one restored at startup) is brought into view, once React Flow has
  // measured its parts. Not with React Flow's own `fitView` prop: on an empty
  // canvas that waits for the first part and jumps to it, zoomed right in,
  // the moment it is dropped.
  const fitPending = useRef(circuit.getComponents().length > 0);
  const shownCircuit = useRef(circuit.id);
  if (shownCircuit.current !== circuit.id) {
    shownCircuit.current = circuit.id;
    fitPending.current = true;
  }
  useEffect(() => {
    if (!fitPending.current || nodes.length === 0 || !reactFlowInstance.current) return;
    // ...and it is these parts on the canvas, not still the previous circuit's
    if (nodes.length !== circuit.getComponents().length) return;
    if (!nodes.every((n) => n.width && n.height && circuit.getComponent(n.id as ComponentId))) return;
    fitPending.current = false;
    reactFlowInstance.current.fitView({ padding: 0.1 });
  }, [nodes, circuit, flowReady]);

  // A wire dragged from a pin and dropped on another wire joins it there:
  // remember where the drag started, and whether it ended on a pin after all
  const connectSucceeded = useRef(false);
  const connectSource = useRef<{ componentId: ComponentId; pinId: PinId } | null>(null);

  const onConnectStart = useCallback((_event: unknown, params: { nodeId: string | null; handleId: string | null }) => {
    connectSucceeded.current = false;
    connectSource.current = params.nodeId && params.handleId
      ? { componentId: params.nodeId as ComponentId, pinId: params.handleId as PinId }
      : null;
  }, []);

  const onConnect = useCallback((connection: Parameters<typeof onConnectSync>[0]) => {
    connectSucceeded.current = true;
    onConnectSync(connection);
  }, [onConnectSync]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || e.key === 'y')) { e.preventDefault(); redo(); }
    else if ((e.key === 'b' || e.key === 'B') && !e.metaKey && !e.ctrlKey && !e.altKey && onBend) { e.preventDefault(); setBendMode((on) => !on); }
    else if (e.key === 'r' || e.key === 'R') {
      // Rotate selected components 90° clockwise
      if (selectedComponents.length > 0) {
        e.preventDefault();
        for (const compId of selectedComponents) {
          const comp = circuit.getComponent(compId);
          if (comp && comp.type !== 'junction') { // junctions don't rotate
            const newRotation = ((comp.rotation || 0) + 90) % 360;
            updateComponent(compId, { rotation: newRotation });
          }
        }
      }
    }
  }, [undo, redo, selectedComponents, circuit, updateComponent, onBend]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    // Dropped on a pin: the connection is already made
    if (connectSucceeded.current) return;
    const source = connectSource.current;
    if (!reactFlowInstance.current || !source) return;
    const touch = 'changedTouches' in event ? event.changedTouches[0] : event;
    const dropPos = reactFlowInstance.current.screenToFlowPosition({ x: touch.clientX, y: touch.clientY });
    const THRESHOLD = 15;

    // The wire nearest the drop, as drawn, that the dragged pin is not already on
    let nearest: { id: string; distance: number } | null = null;
    for (const [id, route] of routesRef.current) {
      const distance = pointToPolylineDistance(dropPos.x, dropPos.y, route.points);
      if (distance < THRESHOLD && (!nearest || distance < nearest.distance)) nearest = { id, distance };
    }
    const conn = nearest && circuit.getConnections().find(c => c.id === nearest!.id);
    if (!conn) return;
    const touchesSource = (end: { componentId: ComponentId; pinId: PinId }) =>
      end.componentId === source.componentId && end.pinId === source.pinId;
    if (touchesSource(conn.from) || touchesSource(conn.to)) return;

    const junctionDef = ComponentRegistry.getInstance().get('junction');
    if (!junctionDef) return;
    const snapped = { x: Math.round(dropPos.x / 20) * 20, y: Math.round(dropPos.y / 20) * 20 };
    const junction = createComponentFromDefinition(junctionDef, snapped);
    const junctionEnd = { componentId: junction.id as ComponentId, pinId: junction.pins[0].id as PinId };

    // Split the wire at a junction dot and bring the dragged wire to it
    addComponent(junction);
    removeConnection(conn.id);
    for (const end of [conn.from, conn.to, source]) {
      addConnection({
        id: generateConnectionId(), from: end, to: junctionEnd, net: generateNetId(),
        ...(conn.color ? { color: conn.color } : {}), // the pieces of a colored wire keep its color
      });
    }
  }, [addComponent, addConnection, removeConnection, circuit]);

  // Right-click a wire to put an oscilloscope probe on it
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    if (!onAddProbe || !edge.sourceHandle) return;
    const component = circuit.getComponent(edge.source as ComponentId);
    const pin = component?.pins.find(p => p.id === edge.sourceHandle);
    if (!component || !pin) return;
    const part = component.label || ComponentRegistry.getInstance().get(component.type)?.metadata.name || component.type;
    onAddProbe(component.id, pin.id, `${part} ${pin.label}`);
  }, [circuit, onAddProbe]);

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', visibility: hidden ? 'hidden' : undefined }}
      aria-hidden={hidden || undefined} onKeyDown={onKeyDown} tabIndex={0} ref={surface} data-bending={bending || undefined}>
      <Toolbar onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} activeView={activeView} onSelectView={onSelectView}
        bending={bending} onToggleBend={onBend ? toggleBend : undefined} />
      {bending && onBend && (
        <BendTool surface={surface} viewMode={viewMode} routes={routes} playing={playing} onBend={onBend} onClose={stopBending} />
      )}
      <Inspector viewMode={viewMode} onDeleteComponents={deleteComponents} onAddProbe={onAddProbe} />
      {nodes.length === 0 && circuit.getComponents().length === 0 && <EmptyState viewMode={viewMode} />}
      <WireRoutesContext.Provider value={routes}>
      <ReactFlow
        nodes={nodes} edges={edges}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        connectionLineComponent={ConnectionLine}
        isValidConnection={isValidConnection}
        onInit={onInit}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop} onSelectionDragStop={onSelectionDragStop}
        onEdgeContextMenu={onEdgeContextMenu}
        onConnect={onConnect} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd} onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete}
        onDrop={onDrop} onDragOver={onDragOver}
        nodesDraggable={!bending} nodesConnectable={!bending} elementsSelectable={!bending}
        snapToGrid={true} snapGrid={[20, 20]}
        nodeOrigin={[0.5, 0.5]}
        // React Flow listens for these on the whole page: not while the canvas is out of sight
        deleteKeyCode={hidden ? null : DELETE_KEYS}
        // Space plays and stops; the canvas already pans with a plain drag
        panActivationKeyCode={null}
        style={{ background: viewMode === 'schematic' ? '#ffffff' : '#1a6b3c' }}
      >
        <Background
          variant={viewMode === 'schematic' ? 'lines' as any : 'dots' as any}
          gap={20}
          color={viewMode === 'schematic' ? '#e0e0e0' : '#2a8b50'}
          size={viewMode === 'schematic' ? 0.5 : 1}
        />
        <Controls />
        <MiniMap
          nodeColor={() => viewMode === 'schematic' ? '#666' : '#d4ecd4'}
          maskColor={viewMode === 'schematic' ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.3)'}
        />
      </ReactFlow>
      </WireRoutesContext.Provider>
    </div>
  );
}

export default function CircuitCanvas(props: CircuitCanvasProps) {
  return (
    <ReactFlowProvider>
      <CircuitCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
