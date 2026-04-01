import { memo, useCallback, useState } from 'react';
import { type EdgeProps, useReactFlow, useStore } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { generateSmartPath } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import type { ComponentId, PinId } from '@/types/circuit';

// Shared hovered net state — when one wire is hovered, all wires sharing
// an endpoint highlight. Simple module-level state since edges are all in
// the same React tree.
let hoveredEdgeEndpoints: Set<string> | null = null;
let hoverListeners: Set<() => void> = new Set();

function setHoveredNet(endpoints: Set<string> | null) {
  hoveredEdgeEndpoints = endpoints;
  hoverListeners.forEach(fn => fn());
}

function useHoveredNet(): Set<string> | null {
  const [, forceUpdate] = useState(0);
  useState(() => {
    const listener = () => forceUpdate(n => n + 1);
    hoverListeners.add(listener);
    return () => { hoverListeners.delete(listener); };
  });
  return hoveredEdgeEndpoints;
}

export const SchematicEdge = memo(function SchematicEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data,
}: EdgeProps) {
  const { addComponent, addConnection, removeConnection, circuit } = useCircuit();
  const { screenToFlowPosition } = useReactFlow();
  const pathData = generateSmartPath(
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  );

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

  // Net highlighting: compute this edge's endpoints as keys
  const sourceKey = `${data?.connectionId}:src:${sourceX},${sourceY}`;
  const targetKey = `${data?.connectionId}:tgt:${targetX},${targetY}`;
  const edgeSourcePin = `${(data as Record<string, unknown>)?.sourceComp}::${(data as Record<string, unknown>)?.sourcePin}`;
  const edgeTargetPin = `${(data as Record<string, unknown>)?.targetComp}::${(data as Record<string, unknown>)?.targetPin}`;

  const hovered = useHoveredNet();
  const isNetHighlighted = hovered !== null && (hovered.has(edgeSourcePin) || hovered.has(edgeTargetPin));

  const handleMouseEnter = useCallback(() => {
    // Build the set of all pin keys this edge touches
    const pins = new Set<string>();
    pins.add(edgeSourcePin);
    pins.add(edgeTargetPin);
    // Also find all other connections sharing these pins
    const conns = circuit.getConnections();
    for (const c of conns) {
      const fp = `${c.from.componentId}::${c.from.pinId}`;
      const tp = `${c.to.componentId}::${c.to.pinId}`;
      if (pins.has(fp) || pins.has(tp)) {
        pins.add(fp);
        pins.add(tp);
      }
    }
    // Second pass to catch transitive connections through junctions
    for (const c of conns) {
      const fp = `${c.from.componentId}::${c.from.pinId}`;
      const tp = `${c.to.componentId}::${c.to.pinId}`;
      if (pins.has(fp) || pins.has(tp)) {
        pins.add(fp);
        pins.add(tp);
      }
    }
    setHoveredNet(pins);
  }, [edgeSourcePin, edgeTargetPin, circuit]);

  const handleMouseLeave = useCallback(() => {
    setHoveredNet(null);
  }, []);

  const strokeColor = selected ? '#FF2D55' : isNetHighlighted ? '#2196F3' : '#333';
  const strokeW = selected ? 3 : isNetHighlighted ? 2.5 : 2;

  return (
    <g onDoubleClick={handleDoubleClick} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={pathData} fill="none" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="round" />
    </g>
  );
});
