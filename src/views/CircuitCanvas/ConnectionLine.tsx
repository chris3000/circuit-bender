import { type ConnectionLineComponentProps } from 'reactflow';
import { generateSmartPath } from '@/utils/wiring';

export function ConnectionLine({ fromX, fromY, fromPosition, toX, toY }: ConnectionLineComponentProps) {
  const pathData = generateSmartPath(
    fromX, fromY, fromPosition,
    toX, toY, 'left', // target position unknown during drag — default to left
  );
  return (
    <g>
      <path d={pathData} fill="none" stroke="#999" strokeWidth={2} strokeDasharray="4 3" />
    </g>
  );
}
