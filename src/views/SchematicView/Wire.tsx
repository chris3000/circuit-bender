import React from 'react';
import { generateOrthogonalPath } from '@/utils/wiring';
import type { ConnectionId } from '@/types/circuit';

interface WireProps {
  connectionId: ConnectionId;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isSelected: boolean;
  onClick: (connectionId: ConnectionId) => void;
}

export const Wire = React.memo(function Wire({
  connectionId,
  fromX,
  fromY,
  toX,
  toY,
  isSelected,
  onClick,
}: WireProps) {
  const pathData = generateOrthogonalPath(fromX, fromY, toX, toY);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(connectionId);
  };

  return (
    <path
      data-testid={`wire-${connectionId}`}
      d={pathData}
      fill="none"
      stroke={isSelected ? '#4CAF50' : '#333'}
      strokeWidth={isSelected ? 3 : 2}
      style={{ cursor: 'pointer' }}
      onClick={handleClick}
    />
  );
});
