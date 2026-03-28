import { memo } from 'react';
import { type EdgeProps } from 'reactflow';
import { generateOrthogonalPath } from '@/utils/wiring';

export const SchematicEdge = memo(function SchematicEdge({
  id, sourceX, sourceY, targetX, targetY, selected,
}: EdgeProps) {
  const pathData = generateOrthogonalPath(sourceX, sourceY, targetX, targetY);
  return (
    <g>
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={pathData} fill="none" stroke={selected ? '#FF2D55' : '#333'} strokeWidth={selected ? 3 : 2} strokeLinecap="round" />
    </g>
  );
});
