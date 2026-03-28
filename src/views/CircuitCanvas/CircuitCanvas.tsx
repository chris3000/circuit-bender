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
  const { addComponent, undo, redo, canUndo, canRedo } = useCircuit();
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
        onConnect={onConnect} onSelectionChange={onSelectionChange}
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
