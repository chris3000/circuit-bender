import React from 'react';
import type { ConnectionId } from '@/types/circuit';

interface BoardWireProps {
  connectionId: ConnectionId;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  isSelected: boolean;
  onClick: (connectionId: ConnectionId) => void;
  onContextMenu?: (connectionId: ConnectionId, e: React.MouseEvent) => void;
}

function generateCurvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const arcHeight = Math.min(dist * 0.3, 60);
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const cx = mx + nx * arcHeight;
  const cy = my + ny * arcHeight;
  return `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
}

export const BoardWire = React.memo(function BoardWire({
  connectionId,
  fromX,
  fromY,
  toX,
  toY,
  color,
  isSelected,
  onClick,
  onContextMenu,
}: BoardWireProps) {
  const pathData = generateCurvedPath(fromX, fromY, toX, toY);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(connectionId);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) onContextMenu(connectionId, e);
  };

  return (
    <g>
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
      <path
        data-testid={`board-wire-${connectionId}`}
        d={pathData}
        fill="none"
        stroke={isSelected ? '#FF2D55' : color}
        strokeWidth={isSelected ? 3 : 2.5}
        strokeLinecap="round"
        opacity={0.85}
        style={{ cursor: 'pointer', pointerEvents: 'none' }}
      />
    </g>
  );
});

export function getWireColor(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): string {
  if (
    fromComponentType === 'power' || toComponentType === 'power' ||
    fromPinType === 'power' || toPinType === 'power'
  ) {
    return '#e04040';
  }
  if (
    fromComponentType === 'ground' || toComponentType === 'ground' ||
    fromPinType === 'ground' || toPinType === 'ground'
  ) {
    return '#333';
  }
  return '#4a82c4';
}
