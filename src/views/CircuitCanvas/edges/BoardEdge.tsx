import { memo } from 'react';
import { type EdgeProps, getSmoothStepPath } from 'reactflow';
import { buildRoundedPath } from '@/utils/wiring';
import { useWireRoute } from '../routing/useWireRoutes';
import { useIsSpliceTarget } from './spliceTarget';

const WIRE_WIDTH = { power: 3, ground: 2.5, signal: 2 } as const;

export const BoardEdge = memo(function BoardEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data,
}: EdgeProps) {
  const wireType = (data?.wireType || 'signal') as 'power' | 'ground' | 'signal';
  // The user's color for this wire if it has one, else the convention: red power, black ground, blue signal
  const userColor = data?.userColor as string | undefined;
  const wireColor = userColor ?? ((data?.wireColor || '#4a82c4') as string);
  const strokeWidth = selected ? WIRE_WIDTH[wireType] + 1 : WIRE_WIDTH[wireType];
  // Selected, a colored wire keeps its color and gets a halo, so the color being chosen can be seen
  const color = selected && !userColor ? '#FF2D55' : wireColor;

  // A part is held over this wire: let go, and it goes in here
  const taking = useIsSpliceTarget(id);
  const route = useWireRoute(id);
  const edgePath = route
    ? buildRoundedPath(route.points, 8)
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 20 })[0];
  const start = route ? route.points[0] : { x: sourceX, y: sourceY };
  const end = route ? route.points[route.points.length - 1] : { x: targetX, y: targetY };

  return (
    <g>
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      {((selected && userColor) || taking) && (
        <path d={edgePath} fill="none" stroke="#FF2D55" strokeOpacity={0.55} strokeWidth={strokeWidth + (taking ? 10 : 6)} strokeLinecap="round"
          data-testid={taking ? 'splice-target' : undefined} />
      )}
      <path id={id} d={edgePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.85} />
      {route?.dots.map((dot) => (
        <circle key={`${dot.x},${dot.y}`} cx={dot.x} cy={dot.y} r={strokeWidth + 1} fill={color} />
      ))}
      <circle cx={start.x} cy={start.y} r={strokeWidth * 0.8} fill="#c4a24e" opacity="0.9" />
      <circle cx={end.x} cy={end.y} r={strokeWidth * 0.8} fill="#c4a24e" opacity="0.9" />
    </g>
  );
});
