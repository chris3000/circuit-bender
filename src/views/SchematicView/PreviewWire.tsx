import React from 'react';

interface PreviewWireProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export const PreviewWire = React.memo(function PreviewWire({
  fromX,
  fromY,
  toX,
  toY,
}: PreviewWireProps) {
  const midX = (fromX + toX) / 2;

  // Manhattan routing: horizontal -> vertical -> horizontal
  const pathD = `M ${fromX},${fromY} H ${midX} V ${toY} H ${toX}`;

  return (
    <path
      data-testid="preview-wire"
      d={pathD}
      fill="none"
      stroke="#999"
      strokeWidth={2}
      strokeDasharray="4 4"
      pointerEvents="none"
    />
  );
});
