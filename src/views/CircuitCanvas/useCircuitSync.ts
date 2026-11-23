import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import type { Node, Edge, NodeChange, EdgeChange, Connection as RFConnection } from 'reactflow';
import { applyNodeChanges } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { validateConnection } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import { getWireColor, getWireType } from './edges/wireUtils';
import { resolveWireColors } from '@/utils/wireColors';
import type { Component, ComponentId, PinId, ConnectionId } from '@/types/circuit';
import { useWireRoutes, type PlacedComponent } from './routing/useWireRoutes';

export interface CircuitNodeData {
  component: Component;
  viewMode: 'schematic' | 'board';
  ledOn: boolean;
}

export function useCircuitSync(
  viewMode: 'schematic' | 'board',
  ledStates: Record<string, boolean>,
) {
  const {
    circuit,
    addConnection,
    removeComponent,
    removeConnection,
    moveComponents,
    selectedComponents,
    selectedConnections,
    setSelection,
    clearSelection,
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
        ledOn: ledStates[comp.id] ?? false,
      },
    }));
  }, [components, viewMode, ledStates, selectedComponents]);

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

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type !== 'position') continue;
      if (change.dragging) draggingIds.current.add(change.id);
      else draggingIds.current.delete(change.id);
    }
    // Only the canvas's own copy changes here. The circuit hears about a move
    // once, when the drag ends (onNodeDragStop): a state updater must not
    // reach into another component's state, and one drag is one undo step.
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

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
    () => nodes.map((n) => ({ component: n.data.component, position: n.position })),
    [nodes],
  );
  const routes = useWireRoutes(placed, connections, viewMode);

  // Wires are derived from the circuit, so the only change React Flow can make
  // to them here is which are selected. That has to be taken up at once: React
  // Flow marks its own copy as selected and expects to be given the same back,
  // and if it is not, the canvas shows the wire that was clicked the time before.
  const selection = useRef({ components: selectedComponents, connections: selectedConnections });
  selection.current = { components: selectedComponents, connections: selectedConnections };
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const selected = new Set<string>(selection.current.connections);
    let changed = false;
    for (const change of changes) {
      if (change.type !== 'select' || change.selected === selected.has(change.id)) continue;
      if (change.selected) selected.add(change.id);
      else selected.delete(change.id);
      changed = true;
    }
    if (changed) setSelection(selection.current.components, [...selected] as ConnectionId[]);
  }, [setSelection]);

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

  const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
    const compIds = selNodes.map(n => n.id as ComponentId);
    const connIds = selEdges.map(e => e.id as ConnectionId);
    if (compIds.length === 0 && connIds.length === 0) {
      clearSelection();
    } else {
      setSelection(compIds, connIds);
    }
  }, [setSelection, clearSelection]);

  /** Remove parts, whoever asks: the Delete key on the canvas or the inspector's button. */
  const deleteComponents = useCallback((ids: ComponentId[]) => {
    for (const id of ids) {
      // Smart junction delete: if a junction has exactly 2 wires, reconnect them
      if (circuit.getComponent(id)?.type === 'junction') {
        const junctionId = id;
        const conns = circuit.getConnections();
        const junctionConns = conns.filter(
          c => c.from.componentId === junctionId || c.to.componentId === junctionId
        );
        if (junctionConns.length === 2) {
          // Find the two "other" endpoints (not the junction)
          const endpoints = junctionConns.map(c =>
            c.from.componentId === junctionId ? c.to : c.from
          );
          // Remove both wires and the junction, then reconnect
          for (const c of junctionConns) removeConnection(c.id);
          removeComponent(junctionId);
          const color = junctionConns.find(c => c.color)?.color;
          addConnection({
            id: generateConnectionId(),
            from: { componentId: endpoints[0].componentId, pinId: endpoints[0].pinId },
            to: { componentId: endpoints[1].componentId, pinId: endpoints[1].pinId },
            net: generateNetId(),
            ...(color ? { color } : {}),
          });
          continue;
        }
      }
      removeComponent(id);
    }
  }, [removeComponent, removeConnection, addConnection, circuit]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    deleteComponents(deleted.map((node) => node.id as ComponentId));
  }, [deleteComponents]);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const edge of deleted) {
      removeConnection(edge.id as ConnectionId);
    }
  }, [removeConnection]);

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
    onSelectionChange,
    onNodesDelete,
    onEdgesDelete,
    deleteComponents,
  };
}
