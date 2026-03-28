import { useMemo, useCallback } from 'react';
import type { Node, Edge, NodeChange, EdgeChange, Connection as RFConnection } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { validateConnection } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import { getWireColor, getWireType } from './edges/wireUtils';
import type { Component, ComponentId, PinId, ConnectionId } from '@/types/circuit';

export interface CircuitNodeData {
  component: Component;
  viewMode: 'schematic' | 'board';
  ledOn: boolean;
  onPotChange?: (componentId: string, position: number) => void;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
}

export function useCircuitSync(
  viewMode: 'schematic' | 'board',
  ledStates: Record<string, boolean>,
  onPotChange?: (componentId: string, position: number) => void,
  onAddProbe?: (componentId: string, pinId: string, label: string) => void,
) {
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
  } = useCircuit();

  const components = useMemo(() => circuit.getComponents(), [circuit]);
  const connections = useMemo(() => circuit.getConnections(), [circuit]);

  // --- Downstream: Circuit -> React Flow ---

  const nodes: Node<CircuitNodeData>[] = useMemo(() => {
    return components.map((comp) => ({
      id: comp.id,
      type: comp.type,
      position: { x: comp.position.x, y: comp.position.y },
      selected: selectedComponents.includes(comp.id),
      data: {
        component: comp,
        viewMode,
        ledOn: ledStates[comp.id] ?? false,
        onPotChange,
        onAddProbe,
      },
    }));
  }, [components, viewMode, ledStates, selectedComponents, onPotChange, onAddProbe]);

  const edges: Edge[] = useMemo(() => {
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
        },
      };
    });
  }, [connections, circuit, viewMode, selectedConnections]);

  // --- Upstream: React Flow -> Circuit ---

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        updateComponent(change.id as ComponentId, {
          position: { x: change.position.x, y: change.position.y },
        });
      }
    }
  }, [updateComponent]);

  const onEdgesChange = useCallback((_changes: EdgeChange[]) => {
    // Edge removal is handled by onEdgesDelete
  }, []);

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

  const onNodesDelete = useCallback((deleted: Node[]) => {
    for (const node of deleted) {
      removeComponent(node.id as ComponentId);
    }
  }, [removeComponent]);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const edge of deleted) {
      removeConnection(edge.id as ConnectionId);
    }
  }, [removeConnection]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    onSelectionChange,
    onNodesDelete,
    onEdgesDelete,
  };
}
