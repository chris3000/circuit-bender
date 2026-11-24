import { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useStoreApi,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { pointToPolylineDistance } from '@/utils/wiring';
import { joinAtWire, rotateParts, spliceIntoWire, throughPins } from '@/utils/circuitEdits';
import { isTextField } from '@/utils/keyboard';
import type { Component, ComponentId, PinId, Position2D } from '@/types/circuit';
import { useCircuitSync } from './useCircuitSync';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { ConnectionLine } from './ConnectionLine';
import { computeWireRoutes, WireRoutesContext, type WireRoutes } from './routing/useWireRoutes';
import { SpliceTargetContext } from './edges/spliceTarget';
import { placeOnWire, SPLICE_REACH } from './splice';
import { Toolbar } from '@/views/SchematicView/Toolbar';
import { partInTheAir, readPartDrag } from '@/views/ComponentDrawer/dragData';
import { useReplacePart } from '@/views/ReplacePart/ReplacePartContext';
import { ReplacePopover } from '@/views/ReplacePart/ReplacePopover';
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
  /** How brightly each LED is lit, 0 to 1, by part id. */
  lights: Record<string, number>;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
  /** Whether the circuit is running. */
  playing?: boolean;
  /** Hold a jumper between two points of the running circuit, or let go of it (null). */
  onBend?: (bend: Bend | null) => void;
}

function CircuitCanvasInner({
  viewMode, activeView, onSelectView, hidden = false, lights, onAddProbe, playing = false, onBend,
}: CircuitCanvasProps) {
  const { addComponent, editCircuit, selectedComponents, undo, redo, canUndo, canRedo, circuit } = useCircuit();
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const flow = useStoreApi();

  // The wire a part held over the canvas would land in, shown while it is held,
  // and the part itself when it is one already on the canvas
  const [spliceWire, setSpliceWire] = useState<string | null>(null);
  const [floating, setFloating] = useState<string | null>(null);

  const {
    nodes, edges, routes, onNodesChange, onNodeDragStop: moveDragged, onSelectionDragStop, onEdgesChange, onConnect: onConnectSync,
    isValidConnection, deleteComponents, deleteSelection,
  } = useCircuitSync(viewMode, lights, floating);
  const routesRef = useRef(routes);
  routesRef.current = routes;

  // The bend tool: while it is on, parts stay put and pins do not start wires,
  // so that pressing on them can pick up a jumper instead
  const surface = useRef<HTMLDivElement>(null);
  const [bendMode, setBendMode] = useState(false);
  const bending = bendMode && !hidden && Boolean(onBend);
  const toggleBend = useCallback(() => setBendMode((on) => !on), []);
  const stopBending = useCallback(() => setBendMode(false), []);

  // --- A part let go of on a wire goes into the wire ---

  /** Where the pointer is on the canvas, exactly: React Flow's own conversion snaps to the grid parts sit on. */
  const canvasPoint = useCallback((clientX: number, clientY: number): Position2D | null => {
    const { transform: [x, y, zoom], domNode } = flow.getState();
    const box = (domNode ?? surface.current)?.getBoundingClientRect();
    return box ? { x: (clientX - box.left - x) / zoom, y: (clientY - box.top - y) / zoom } : null;
  }, [flow]);
  /** How near a wire counts as on it: the same on screen however far the canvas is zoomed out. */
  const reach = useCallback(() => SPLICE_REACH / Math.min(1, flow.getState().transform[2]), [flow]);

  // The part coming off the shelf, made once per drag to try against the wires
  const incoming = useRef<{ type: string; part: Component } | null>(null);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const held = partInTheAir();
    const definition = held && ComponentRegistry.getInstance().get(held.type);
    const at = canvasPoint(e.clientX, e.clientY);
    if (!held || !definition || !at) { setSpliceWire(null); return; }
    if (incoming.current?.type !== held.type) {
      incoming.current = { type: held.type, part: createComponentFromDefinition(definition, { x: 0, y: 0 }) };
    }
    setSpliceWire(placeOnWire(incoming.current.part, at, routesRef.current, reach())?.connectionId ?? null);
  }, [canvasPoint, reach]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Leaving for good, not passing over something that lies on the canvas
    if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setSpliceWire(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setSpliceWire(null);
    incoming.current = null;
    const dropped = readPartDrag(e.dataTransfer);
    const at = canvasPoint(e.clientX, e.clientY);
    if (!dropped || !at) return;
    const registry = ComponentRegistry.getInstance();
    const definition = registry.get(dropped.type);
    if (!definition) return;
    // Parts sit on the same 20px grid they snap to when dragged, so pins line up
    const component = createComponentFromDefinition(definition, {
      x: Math.round(at.x / 20) * 20,
      y: Math.round(at.y / 20) * 20,
    }, dropped.parameters); // the value picked from the shelf
    const place = placeOnWire(component, at, routesRef.current, reach());
    if (!place) { addComponent(component); return; }
    // On a wire: the wire is cut and the part goes between its ends, turned to lie along it
    const lying = { ...component, position: place.position, rotation: place.rotation };
    editCircuit((c) => {
      const spliced = spliceIntoWire(c, lying, place.connectionId, place.swap);
      return spliced === c ? c.addComponent(component) : spliced; // the wire went meanwhile: just the part
    });
  }, [addComponent, editCircuit, canvasPoint, reach]);

  // A part with no wires on it yet, dragged onto a wire, goes into it the
  // same way. Only such a part: one that is wired up is being moved about.
  const loose = useRef<{ id: string; from: Position2D; routes: WireRoutes | null } | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const onNodeDragStart = useCallback((_event: unknown, node: Node, dragged: Node[]) => {
    loose.current = null;
    const part = circuit.getComponent(node.id as ComponentId);
    if (dragged.length !== 1 || !part || !throughPins(ComponentRegistry.getInstance().get(part.type))) return;
    if (circuit.getConnections().some((c) => c.from.componentId === part.id || c.to.componentId === part.id)) return;
    loose.current = { id: part.id, from: { ...node.position }, routes: null };
  }, [circuit]);

  /** The wire the part being dragged would land in, where it is now. */
  const landing = useCallback((node: Node) => {
    const held = loose.current;
    const part = held && held.id === node.id ? circuit.getComponent(held.id as ComponentId) : undefined;
    if (!held || !part) return null;
    // Not a drag at all, only a click on a part that happens to lie by a wire
    if (node.position.x === held.from.x && node.position.y === held.from.y) return null;
    // The wires as they run without this part: held over one, it pushes the wire aside on screen
    held.routes ??= computeWireRoutes(
      nodesRef.current.filter((n) => n.id !== part.id).map((n) => ({ component: n.data.component, position: n.position })),
      circuit.getConnections(), viewMode,
    );
    const place = placeOnWire(part, node.position, held.routes, reach());
    return place && { part, place };
  }, [circuit, viewMode, reach]);

  const onNodeDrag = useCallback((_event: unknown, node: Node) => {
    if (!loose.current) return;
    const wire = landing(node)?.place.connectionId ?? null;
    setSpliceWire(wire);
    setFloating(wire ? node.id : null);
  }, [landing]);

  const onNodeDragStop = useCallback((event: unknown, node: Node, dragged: Node[]) => {
    const landed = landing(node);
    loose.current = null;
    setSpliceWire(null);
    setFloating(null);
    if (!landed) { moveDragged(event, node, dragged); return; }
    const { part, place } = landed;
    const moved = { x: node.position.x, y: node.position.y };
    editCircuit((c) => {
      if (!c.getComponent(part.id)) return c;
      const spliced = spliceIntoWire(c, { ...part, position: place.position, rotation: place.rotation }, place.connectionId, place.swap);
      return spliced === c ? c.updateComponent(part.id, { position: moved }) : spliced;
    });
  }, [landing, moveDragged, editCircuit]);

  // --- Delete, and double-click to swap a part ---

  // The keys are heard here, not by React Flow: one press is one undo step,
  // and a part that sat in a wire leaves the wire whole
  useEffect(() => {
    if (hidden || bending) return;
    const onKey = (e: KeyboardEvent) => {
      if (!DELETE_KEYS.includes(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextField(e.target) || document.querySelector('[aria-modal="true"]')) return;
      deleteSelection();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hidden, bending, deleteSelection]);

  const { begin: beginReplace, cancel: cancelReplace, target: replacing } = useReplacePart();
  const onNodeDoubleClick = useCallback((_event: unknown, node: Node) => {
    if (!bending && node.type !== 'junction') beginReplace(node.id as ComponentId);
  }, [bending, beginReplace]);
  // Nothing is swapped on a canvas that is out of sight or being bent
  useEffect(() => {
    if ((hidden || bending) && replacing) cancelReplace();
  }, [hidden, bending, replacing, cancelReplace]);

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
  const emptied = useRef(false);
  if (shownCircuit.current !== circuit.id) {
    shownCircuit.current = circuit.id;
    // An empty canvas has nothing to fit. Left pending, the fit would wait
    // for the first part dropped on it and jump to that, zoomed right in.
    fitPending.current = circuit.getComponents().length > 0;
    emptied.current = !fitPending.current;
  }
  useEffect(() => {
    // A new, empty canvas starts where an empty canvas starts, not wherever the last circuit was being looked at
    if (emptied.current && reactFlowInstance.current) {
      emptied.current = false;
      reactFlowInstance.current.setViewport({ x: 0, y: 0, zoom: 1 });
    }
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
    // Undo and redo are heard for the whole page (`useUndoShortcuts`), not here
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === 'b' || e.key === 'B') && onBend) { e.preventDefault(); setBendMode((on) => !on); }
    else if ((e.key === 'r' || e.key === 'R') && selectedComponents.length > 0) {
      // A quarter turn clockwise for everything selected, as one undo step
      e.preventDefault();
      editCircuit((c) => rotateParts(c, selectedComponents, 90));
    }
  }, [selectedComponents, editCircuit, onBend]);

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

    // Split the wire at a junction dot and bring the dragged wire to it: one undo step
    editCircuit((c) => joinAtWire(c, conn.id, junction, source));
  }, [editCircuit, circuit]);

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
      {!hidden && <ReplacePopover viewMode={viewMode} />}
      {nodes.length === 0 && circuit.getComponents().length === 0 && <EmptyState viewMode={viewMode} />}
      <WireRoutesContext.Provider value={routes}>
      <SpliceTargetContext.Provider value={spliceWire}>
      <ReactFlow
        nodes={nodes} edges={edges}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        connectionLineComponent={ConnectionLine}
        // A pin is one thing, not an output or an input: a wire may end on the
        // pin itself. (React Flow's strict mode only takes a wire that ends
        // near a pin, because what is under the pointer on it is the handle
        // wires start from.)
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        onInit={onInit}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop} onSelectionDragStop={onSelectionDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        // A double-click is for the part or wire under it (swap it, put a dot on it), not for zooming
        zoomOnDoubleClick={false}
        onEdgeContextMenu={onEdgeContextMenu}
        onConnect={onConnect} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd}
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        nodesDraggable={!bending} nodesConnectable={!bending} elementsSelectable={!bending}
        snapToGrid={true} snapGrid={[20, 20]}
        nodeOrigin={[0.5, 0.5]}
        // Deleting is done here (see the key handler above), in one step
        deleteKeyCode={null}
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
      </SpliceTargetContext.Provider>
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
