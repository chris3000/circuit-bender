import { memo, useCallback } from 'react';
import { type EdgeProps, useReactFlow } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { generateOrthogonalPath } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import type { ComponentId, PinId } from '@/types/circuit';

export const SchematicEdge = memo(function SchematicEdge({
  id, sourceX, sourceY, targetX, targetY, selected, data,
}: EdgeProps) {
  const { addComponent, addConnection, removeConnection, circuit } = useCircuit();
  const { screenToFlowPosition } = useReactFlow();
  const pathData = generateOrthogonalPath(sourceX, sourceY, targetX, targetY);

  // Double-click wire → insert junction (splits wire into two halves)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const registry = ComponentRegistry.getInstance();
    const junctionDef = registry.get('junction');
    if (!junctionDef) return;

    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const snapped = { x: Math.round(pos.x / 20) * 20, y: Math.round(pos.y / 20) * 20 };
    const junction = createComponentFromDefinition(junctionDef, snapped);
    const junctionPinId = junction.pins[0].id;

    // Find the original connection
    const conn = circuit.getConnections().find(c => c.id === (data?.connectionId as string));
    if (!conn) return;

    // Add junction, remove original wire, create two new wires through junction
    addComponent(junction);
    removeConnection(conn.id);
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
  }, [data, circuit, addComponent, addConnection, removeConnection, screenToFlowPosition]);

  return (
    <g onDoubleClick={handleDoubleClick}>
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={pathData} fill="none" stroke={selected ? '#FF2D55' : '#333'} strokeWidth={selected ? 3 : 2} strokeLinecap="round" />
    </g>
  );
});
