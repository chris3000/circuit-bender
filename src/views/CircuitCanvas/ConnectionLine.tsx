import { type ConnectionLineComponentProps } from 'reactflow';
import { generateOrthogonalPath } from '@/utils/wiring';

export function ConnectionLine({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  const pathData = generateOrthogonalPath(fromX, fromY, toX, toY);
  return (
    <g>
      <path d={pathData} fill="none" stroke="#999" strokeWidth={2} strokeDasharray="4 3" />
    </g>
  );
}
