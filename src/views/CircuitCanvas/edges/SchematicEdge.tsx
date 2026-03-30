import { memo } from 'react';
import { type EdgeProps } from 'reactflow';
import { generateWaypointPath } from '@/utils/wiring';

export const SchematicEdge = memo(function SchematicEdge({
  id, sourceX, sourceY, targetX, targetY, selected, data,
}: EdgeProps) {
  const waypoints = data?.waypoints as { x: number; y: number }[] | undefined;
  const pathData = generateWaypointPath(sourceX, sourceY, targetX, targetY, waypoints);

  return (
    <g>
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={pathData} fill="none" stroke={selected ? '#FF2D55' : '#333'} strokeWidth={selected ? 3 : 2} strokeLinecap="round" />
      {waypoints?.map((wp, i) => (
        <rect
          key={i}
          x={wp.x - 4} y={wp.y - 4} width={8} height={8}
          transform={`rotate(45, ${wp.x}, ${wp.y})`}
          fill={selected ? '#FF2D55' : '#999'}
          style={{ cursor: 'grab' }}
        />
      ))}
    </g>
  );
});
