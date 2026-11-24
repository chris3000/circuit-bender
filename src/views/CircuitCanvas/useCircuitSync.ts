import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import type { Node, Edge, NodeChange, EdgeChange, Connection as RFConnection } from 'reactflow';
import { applyNodeChanges } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { validateConnection } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import { removeFromCircuit } from '@/utils/circuitEdits';
import { getWireColor, getWireType } from './edges/wireUtils';
import { resolveWireColors } from '@/utils/wireColors';
import type { Component, ComponentId, PinId, ConnectionId } from '@/types/circuit';
import { useWireRoutes, type PlacedComponent } from './routing/useWireRoutes';

export interface CircuitNodeData {
  component: Component;
  viewMode: 'schematic' | 'board';
  /** For an LED: how brightly it is lit, 0 to 1. */
  light: number;
}

export function useCircuitSync(
  viewMode: 'schematic' | 'board',
  lights: Record<string, number>,
  /**
   * A part held over a wire it is about to go into: wires are drawn as if it
   * were not there, so the wire stays under it instead of running round it.
   */
  floating: string | null = null,
) {
  const {
    circuit,
    addConnection,
    editCircuit,
    moveComponents,
    selectedComponents,
    selectedConnections,
    setSelection,
  } = useCircuit();

  const components = useMemo(() => circuit.getComponents(), [circuit]);
  const connections = useMemo(() => circuit.getConnections(), [circuit]);

  // --- Derive nodes from circuit (source of truth) ---

  const derivedNodes: Node<CircuitNodeData>[] = useMemo(() => {
    return components.map((comp) => ({
      id: comp.id,
      type: comp.type,
      position: { x: comp.position.x, y: comp.position.y },
      selected: selectedComponents.includes(comp.id),
      data: {
        component: comp,
        viewMode,
        light: lights[comp.id] ?? 0,
      },
    }));
  }, [components, viewMode, lights, selectedComponents]);

  // Use state for nodes so React Flow can apply drag changes
  const [nodes, setNodes] = useState<Node<CircuitNodeData>[]>(derivedNodes);

  // Track which nodes are mid-drag so we don't overwrite their positions
  const draggingIds = useRef<Set<string>>(new Set());

  // Sync derived nodes into state when the circuit changes
  useEffect(() => {
    setNodes((prev) => {
      const previous = new Map(prev.map((n) => [n.id, n]));
      return derivedNodes.map((derived) => {
        const existing = previous.get(derived.id);
        if (!existing) return derived;
        const next = { ...derived };
        // Keep the size React Flow measured. A node without one is hidden
        // until it has been measured again, so dropping it would blank and
        // re-measure every part on each selection, knob turn or LED blink.
        const sameShape = existing.type === derived.type
          && existing.data.viewMode === derived.data.viewMode
          && (existing.data.component.rotation || 0) === (derived.data.component.rotation || 0);
        if (sameShape) {
          next.width = existing.width;
          next.height = existing.height;
        }
        // A part being dragged stays under the pointer
        if (draggingIds.current.has(derived.id)) next.position = existing.position;
        return next;
      });
    });
  }, [derivedNodes]);

  const edges: Edge[] = useMemo(() => {
    const userColors = resolveWireColors(connections);
    return connections.map((conn) => {
      const fromComp = circuit.getComponent(conn.from.componentId);
      const toComp = circuit.getComponent(conn.to.componentId);
      const fromPin = fromComp?.pins.find(p => p.id === conn.from.pinId);
      const toPin = toComp?.pins.find(p => p.id === conn.to.pinId);

      return {
        id: conn.id,
        type: viewMode,
        source: conn.from.componentId,
        target: conn.to.componentId,
        sourceHandle: conn.from.pinId,
        targetHandle: conn.to.pinId,
        selected: selectedConnections.includes(conn.id),
        data: {
          wireColor: getWireColor(
            fromComp?.type || '', fromPin?.type || '',
            toComp?.type || '', toPin?.type || '',
          ),
          wireType: getWireType(
            fromComp?.type || '', fromPin?.type || '',
            toComp?.type || '', toPin?.type || '',
          ),
          // The color the user gave this wire's net, in the shade for this view
          userColor: userColors.get(conn.id)?.[viewMode],
          connectionId: conn.id,
          sourceComp: conn.from.componentId,
          sourcePin: conn.from.pinId,
          targetComp: conn.to.componentId,
          targetPin: conn.to.pinId,
        },
      };
    });
  }, [connections, circuit, viewMode, selectedConnections]);

  // --- Upstream: React Flow -> Circuit ---

  // What is selected lives in the circuit's context, and React Flow is told
  // through the nodes and edges it is given. The other way, a click on the
  // canvas reaches the context through the change React Flow reports for it
  // (here and in onEdgesChange), taken up at once. Not through React Flow's
  // onSelectionChange: that also fires when the selection it is *given*
  // changes, and a part that changes the circuit when it is clicked (a
  // switch) then has two versions of the selection chasing each other for good.
  const selection = useRef({ components: selectedComponents, connections: selectedConnections });
  selection.current = { components: selectedComponents, connections: selectedConnections };
  /** Apply the 'select' changes among `changes` to one of the two lists; true if it changed. */
  const takeUpSelection = useCallback((changes: Array<NodeChange | EdgeChange>, of: 'components' | 'connections') => {
    const selected = new Set<string>(selection.current[of]);
    let changed = false;
    for (const change of changes) {
      if (change.type !== 'select' || change.selected === selected.has(change.id)) continue;
      if (change.selected) selected.add(change.id);
      else selected.delete(change.id);
      changed = true;
    }
    if (!changed) return;
    // Both lists can change in one click (a part picked while a wire was): the
    // second to be taken up must see what the first did, before any render
    selection.current = { ...selection.current, [of]: [...selected] };
    setSelection(selection.current.components as ComponentId[], selection.current.connections as ConnectionId[]);
  }, [setSelection]);

  // What is no longer on the canvas (deleted, or undone away) is no longer selected
  useEffect(() => {
    const parts = selectedComponents.filter((id) => circuit.getComponent(id) !== undefined);
    const wires = selectedConnections.filter((id) => connections.some((c) => c.id === id));
    if (parts.length !== selectedComponents.length || wires.length !== selectedConnections.length) setSelection(parts, wires);
  }, [circuit, connections, selectedComponents, selectedConnections, setSelection]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type !== 'position') continue;
      if (change.dragging) draggingIds.current.add(change.id);
      else draggingIds.current.delete(change.id);
    }
    takeUpSelection(changes, 'components');
    // Only the canvas's own copy changes here. The circuit hears about a move
    // once, when the drag ends (onNodeDragStop): a state updater must not
    // reach into another component's state, and one drag is one undo step.
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, [takeUpSelection]);

  /** A drag ended: move the dragged parts in the circuit, as a single undo step. */
  const onNodeDragStop = useCallback((_event: unknown, _node: Node, dragged: Node[]) => {
    moveComponents(dragged.map((n) => ({
      componentId: n.id as ComponentId,
      position: { x: n.position.x, y: n.position.y },
    })));
  }, [moveComponents]);

  const onSelectionDragStop = useCallback((_event: unknown, dragged: Node[]) => {
    moveComponents(dragged.map((n) => ({
      componentId: n.id as ComponentId,
      position: { x: n.position.x, y: n.position.y },
    })));
  }, [moveComponents]);

  // --- Wire routes follow the parts where they are on screen, including mid-drag ---

  const placed: PlacedComponent[] = useMemo(
    () => nodes.filter((n) => n.id !== floating).map((n) => ({ component: n.data.component, position: n.position })),
    [nodes, floating],
  );
  const routes = useWireRoutes(placed, connections, viewMode);

  // Wires are derived from the circuit, so the only change React Flow can make
  // to them here is which are selected. That has to be taken up at once: React
  // Flow marks its own copy as selected and expects to be given the same back,
  // and if it is not, the canvas shows the wire that was clicked the time before.
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    takeUpSelection(changes, 'connections');
  }, [takeUpSelection]);

  const onConnect = useCallback((connection: RFConnection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;

    const fromCompId = connection.source as ComponentId;
    const fromPinId = connection.sourceHandle as PinId;
    const toCompId = connection.target as ComponentId;
    const toPinId = connection.targetHandle as PinId;

    const result = validateConnection(fromCompId, fromPinId, toCompId, toPinId, circuit);
    if (!result.valid) return;

    addConnection({
      id: generateConnectionId(),
      from: { componentId: fromCompId, pinId: fromPinId },
      to: { componentId: toCompId, pinId: toPinId },
      net: generateNetId(),
    });
  }, [circuit, addConnection]);

  const isValidConnection = useCallback((connection: RFConnection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false;
    const result = validateConnection(
      connection.source as ComponentId,
      connection.sourceHandle as PinId,
      connection.target as ComponentId,
      connection.targetHandle as PinId,
      circuit,
    );
    return result.valid;
  }, [circuit]);

  /**
   * Remove parts, and wires with them: the Delete key and the inspector's
   * button both come here. One undo step, and a part that sat in a wire
   * leaves the wire whole (`removeFromCircuit`).
   */
  const deleteComponents = useCallback((ids: ComponentId[], wires: ConnectionId[] = []) => {
    editCircuit((c) => removeFromCircuit(c, ids, wires));
  }, [editCircuit]);

  /** Delete whatever is selected. */
  const deleteSelection = useCallback(() => {
    const { components: parts, connections: wires } = selection.current;
    if (parts.length + wires.length === 0) return;
    deleteComponents(parts as ComponentId[], wires as ConnectionId[]);
  }, [deleteComponents]);

  return {
    nodes,
    edges,
    routes,
    onNodesChange,
    onNodeDragStop,
    onSelectionDragStop,
    onEdgesChange,
    onConnect,
    isValidConnection,
    deleteComponents,
    deleteSelection,
  };
}
