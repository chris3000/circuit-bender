import { memo } from 'react';
import { type EdgeProps, getSmoothStepPath } from 'reactflow';

const WIRE_WIDTH = { power: 3, ground: 2.5, signal: 2 } as const;

export const BoardEdge = memo(function BoardEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data,
}: EdgeProps) {
  const wireType = (data?.wireType || 'signal') as 'power' | 'ground' | 'signal';
  const wireColor = (data?.wireColor || '#4a82c4') as string;
  const strokeWidth = selected ? WIRE_WIDTH[wireType] + 1 : WIRE_WIDTH[wireType];

  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 20 });

  return (
    <g>
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={edgePath} fill="none" stroke={selected ? '#FF2D55' : wireColor} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.85} />
      <circle cx={sourceX} cy={sourceY} r={strokeWidth * 0.8} fill="#c4a24e" opacity="0.9" />
      <circle cx={targetX} cy={targetY} r={strokeWidth * 0.8} fill="#c4a24e" opacity="0.9" />
    </g>
  );
});
