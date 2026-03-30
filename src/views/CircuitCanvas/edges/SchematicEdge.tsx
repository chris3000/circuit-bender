import { memo, useCallback } from 'react';
import { type EdgeProps, useReactFlow } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { generateWaypointPath } from '@/utils/wiring';
import type { ConnectionId } from '@/types/circuit';

export const SchematicEdge = memo(function SchematicEdge({
  id, sourceX, sourceY, targetX, targetY, selected, data,
}: EdgeProps) {
  const { updateConnection } = useCircuit();
  const { screenToFlowPosition } = useReactFlow();
  const waypoints = (data?.waypoints as { x: number; y: number }[] | undefined) || [];
  const connectionId = data?.connectionId as string;
  const pathData = generateWaypointPath(sourceX, sourceY, targetX, targetY, waypoints.length > 0 ? waypoints : undefined);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const snapped = { x: Math.round(pos.x / 20) * 20, y: Math.round(pos.y / 20) * 20 };
    // Find which segment the click is closest to, insert waypoint there
    const allPoints = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < allPoints.length - 1; i++) {
      const mid = { x: (allPoints[i].x + allPoints[i + 1].x) / 2, y: (allPoints[i].y + allPoints[i + 1].y) / 2 };
      const d = Math.hypot(snapped.x - mid.x, snapped.y - mid.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const newWaypoints = [...waypoints];
    newWaypoints.splice(bestIdx, 0, snapped);
    updateConnection(connectionId as ConnectionId, { waypoints: newWaypoints });
  }, [connectionId, waypoints, sourceX, sourceY, targetX, targetY, updateConnection, screenToFlowPosition]);

  const handleWaypointDrag = useCallback((idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (moveEvt: PointerEvent) => {
      const pos = screenToFlowPosition({ x: moveEvt.clientX, y: moveEvt.clientY });
      const snapped = { x: Math.round(pos.x / 20) * 20, y: Math.round(pos.y / 20) * 20 };
      const newWaypoints = [...waypoints];
      newWaypoints[idx] = snapped;
      updateConnection(connectionId as ConnectionId, { waypoints: newWaypoints });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [connectionId, waypoints, updateConnection, screenToFlowPosition]);

  return (
    <g onDoubleClick={handleDoubleClick}>
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={pathData} fill="none" stroke={selected ? '#FF2D55' : '#333'} strokeWidth={selected ? 3 : 2} strokeLinecap="round" />
      {waypoints.map((wp, i) => (
        <rect
          key={i}
          x={wp.x - 4} y={wp.y - 4} width={8} height={8}
          transform={`rotate(45, ${wp.x}, ${wp.y})`}
          fill={selected ? '#FF2D55' : '#999'}
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => handleWaypointDrag(i, e)}
        />
      ))}
    </g>
  );
});
