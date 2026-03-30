import { useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type ReactFlowInstance,
} from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { pointToSegmentDistance, getEdgeSegments } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import type { ComponentId, PinId } from '@/types/circuit';
import { useCircuitSync } from './useCircuitSync';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { ConnectionLine } from './ConnectionLine';
import { Toolbar } from '@/views/SchematicView/Toolbar';

interface CircuitCanvasProps {
  viewMode: 'schematic' | 'board';
  onToggleView: () => void;
  ledStates: Record<string, boolean>;
  onPotChange?: (componentId: string, position: number) => void;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
}

function CircuitCanvasInner({
  viewMode, onToggleView, ledStates, onPotChange, onAddProbe,
}: CircuitCanvasProps) {
  const { addComponent, addConnection, removeConnection, undo, redo, canUndo, canRedo, circuit } = useCircuit();
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    isValidConnection, onSelectionChange, onNodesDelete, onEdgesDelete,
  } = useCircuitSync(viewMode, ledStates, onPotChange, onAddProbe);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const componentType = e.dataTransfer.getData('application/circuit-component');
    if (!componentType || !reactFlowInstance.current) return;
    const registry = ComponentRegistry.getInstance();
    const definition = registry.get(componentType);
    if (!definition) return;
    const position = reactFlowInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const component = createComponentFromDefinition(definition, { x: position.x, y: position.y });
    addComponent(component);
  }, [addComponent]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || e.key === 'y')) { e.preventDefault(); redo(); }
  }, [undo, redo]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    if (!reactFlowInstance.current) return;
    const clientX = 'clientX' in event ? event.clientX : event.touches[0].clientX;
    const clientY = 'clientY' in event ? event.clientY : event.touches[0].clientY;
    const dropPos = reactFlowInstance.current.screenToFlowPosition({ x: clientX, y: clientY });

    const allEdges = reactFlowInstance.current.getEdges();
    const allNodes = reactFlowInstance.current.getNodes();
    const THRESHOLD = 15;

    for (const edge of allEdges) {
      const sourceNode = allNodes.find(n => n.id === edge.source);
      const targetNode = allNodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) continue;

      const srcComp = sourceNode.data?.component;
      const tgtComp = targetNode.data?.component;
      if (!srcComp || !tgtComp) continue;

      const sourcePin = srcComp.pins?.find((p: { id: string }) => p.id === edge.sourceHandle);
      const targetPin = tgtComp.pins?.find((p: { id: string }) => p.id === edge.targetHandle);
      if (!sourcePin || !targetPin) continue;

      const sx = sourceNode.position.x + sourcePin.position.x;
      const sy = sourceNode.position.y + sourcePin.position.y;
      const tx = targetNode.position.x + targetPin.position.x;
      const ty = targetNode.position.y + targetPin.position.y;

      const segments = getEdgeSegments(sx, sy, tx, ty, edge.data?.waypoints);
      for (const seg of segments) {
        const dist = pointToSegmentDistance(dropPos.x, dropPos.y, seg.x1, seg.y1, seg.x2, seg.y2);
        if (dist < THRESHOLD) {
          // Found a nearby wire — insert junction
          const registry = ComponentRegistry.getInstance();
          const junctionDef = registry.get('junction');
          if (!junctionDef) return;

          const snapped = { x: Math.round(dropPos.x / 20) * 20, y: Math.round(dropPos.y / 20) * 20 };
          const junction = createComponentFromDefinition(junctionDef, snapped);
          const junctionPinId = junction.pins[0].id;

          addComponent(junction);

          // Get original connection
          const conn = circuit.getConnections().find(c => c.id === edge.id);
          if (!conn) return;

          // Remove original wire
          removeConnection(conn.id);

          // Create two new wires through junction
          addConnection({
            id: generateConnectionId(),
            from: conn.from,
            to: { componentId: junction.id as ComponentId, pinId: junctionPinId as PinId },
            net: generateNetId(),
          });
          addConnection({
            id: generateConnectionId(),
            from: { componentId: junction.id as ComponentId, pinId: junctionPinId as PinId },
            to: conn.to,
            net: generateNetId(),
          });

          return;
        }
      }
    }
  }, [addComponent, addConnection, removeConnection, circuit]);

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }} onKeyDown={onKeyDown} tabIndex={0}>
      <Toolbar onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} activeView={viewMode} onToggleView={onToggleView} />
      <ReactFlow
        nodes={nodes} edges={edges}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        connectionLineComponent={ConnectionLine}
        isValidConnection={isValidConnection}
        onInit={onInit}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onConnectEnd={onConnectEnd} onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete}
        onDrop={onDrop} onDragOver={onDragOver}
        snapToGrid={true} snapGrid={[20, 20]}
        nodeOrigin={[0.5, 0.5]}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
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
