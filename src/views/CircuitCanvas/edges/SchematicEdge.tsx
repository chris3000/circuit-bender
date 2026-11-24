import { memo, useCallback, useSyncExternalStore } from 'react';
import { type EdgeProps, useReactFlow } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { buildRoundedPath, generateSmartPath } from '@/utils/wiring';
import { joinAtWire } from '@/utils/circuitEdits';
import type { ConnectionId } from '@/types/circuit';
import { useWireRoute } from '../routing/useWireRoutes';
import { useIsSpliceTarget } from './spliceTarget';

// Shared hovered net state — when one wire is hovered, all wires sharing
// an endpoint highlight. Simple module-level state since edges are all in
// the same React tree.
let hoveredEdgeEndpoints: Set<string> | null = null;
const hoverListeners: Set<() => void> = new Set();

function setHoveredNet(endpoints: Set<string> | null) {
  hoveredEdgeEndpoints = endpoints;
  hoverListeners.forEach(fn => fn());
}

function subscribeToHover(listener: () => void): () => void {
  hoverListeners.add(listener);
  return () => { hoverListeners.delete(listener); };
}

function useHoveredNet(): Set<string> | null {
  return useSyncExternalStore(subscribeToHover, () => hoveredEdgeEndpoints);
}

export const SchematicEdge = memo(function SchematicEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data,
}: EdgeProps) {
  const { editCircuit, circuit } = useCircuit();
  const { screenToFlowPosition } = useReactFlow();
  // The router's path avoids parts and other wires; until it has one (the
  // first frame of a new wire) draw a plain path between the two pins
  const route = useWireRoute(id);
  const pathData = route
    ? buildRoundedPath(route.points)
    : generateSmartPath(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition);

  // Double-click wire → insert junction (splits wire into two halves)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const registry = ComponentRegistry.getInstance();
    const junctionDef = registry.get('junction');
    if (!junctionDef) return;

    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const snapped = { x: Math.round(pos.x / 20) * 20, y: Math.round(pos.y / 20) * 20 };
    const junction = createComponentFromDefinition(junctionDef, snapped);
    const connectionId = data?.connectionId as ConnectionId | undefined;
    if (!connectionId) return;
    // The wire is cut at the dot and both halves go to it: one undo step
    editCircuit((c) => joinAtWire(c, connectionId, junction));
  }, [data, editCircuit, screenToFlowPosition]);

  // Net highlighting: this edge's endpoints as keys
  const edgeSourcePin = `${(data as Record<string, unknown>)?.sourceComp}::${(data as Record<string, unknown>)?.sourcePin}`;
  const edgeTargetPin = `${(data as Record<string, unknown>)?.targetComp}::${(data as Record<string, unknown>)?.targetPin}`;

  // A part is held over this wire: let go, and it goes in here
  const taking = useIsSpliceTarget(id);
  const hovered = useHoveredNet();
  const isNetHighlighted = hovered !== null && (hovered.has(edgeSourcePin) || hovered.has(edgeTargetPin));

  const handleMouseEnter = useCallback(() => {
    // Build the set of all pin keys this edge touches
    const pins = new Set<string>();
    pins.add(edgeSourcePin);
    pins.add(edgeTargetPin);
    // Then everything wired to those pins, however many wires away
    const conns = circuit.getConnections();
    for (let grew = true; grew;) {
      grew = false;
      for (const c of conns) {
        const fp = `${c.from.componentId}::${c.from.pinId}`;
        const tp = `${c.to.componentId}::${c.to.pinId}`;
        if (pins.has(fp) !== pins.has(tp)) {
          pins.add(fp);
          pins.add(tp);
          grew = true;
        }
      }
    }
    setHoveredNet(pins);
  }, [edgeSourcePin, edgeTargetPin, circuit]);

  const handleMouseLeave = useCallback(() => {
    setHoveredNet(null);
  }, []);

  // A wire the user has colored keeps its color whatever else is going on:
  // selected, it gets a pink halo instead of turning pink, so the color being
  // chosen can be seen; hovered, its net thickens instead of turning blue
  const userColor = data?.userColor as string | undefined;
  const strokeColor = userColor ?? (selected ? '#FF2D55' : isNetHighlighted ? '#2196F3' : '#333');
  const strokeW = selected ? 3 : isNetHighlighted ? 2.5 : 2;

  return (
    <g onDoubleClick={handleDoubleClick} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      {((selected && userColor) || taking) && (
        <path d={pathData} fill="none" stroke="#FF2D55" strokeOpacity={0.35} strokeWidth={strokeW + (taking ? 10 : 6)} strokeLinecap="round"
          data-testid={taking ? 'splice-target' : undefined} />
      )}
      <path id={id} d={pathData} fill="none" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="round" />
      {/* A dot where wires join, so a junction cannot be mistaken for a crossing */}
      {route?.dots.map((dot) => (
        <circle key={`${dot.x},${dot.y}`} cx={dot.x} cy={dot.y} r={strokeW + 1.5} fill={strokeColor} />
      ))}
    </g>
  );
});
