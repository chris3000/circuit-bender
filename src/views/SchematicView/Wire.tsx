import React, { useMemo } from 'react';
import { generateOrthogonalPath } from '@/utils/wiring';
import type { Connection } from '@/types/circuit';
import { Circuit } from '@/models/Circuit';

interface WireProps {
  connection: Connection;
  circuit: Circuit;
  isSelected: boolean;
  onClick: (connectionId: string) => void;
}

export const Wire = React.memo(function Wire({
  connection,
  circuit,
  isSelected,
  onClick,
}: WireProps) {
  const pathData = useMemo(() => {
    const fromComponent = circuit.getComponent(connection.from.componentId);
    const toComponent = circuit.getComponent(connection.to.componentId);

    if (!fromComponent || !toComponent) return null;

    const fromPin = fromComponent.pins.find(
      (p) => p.id === connection.from.pinId
    );
    const toPin = toComponent.pins.find(
      (p) => p.id === connection.to.pinId
    );

    if (!fromPin || !toPin) return null;

    // Calculate absolute pin positions (component position + pin relative position)
    const fromX = fromComponent.position.schematic.x + fromPin.position.x;
    const fromY = fromComponent.position.schematic.y + fromPin.position.y;
    const toX = toComponent.position.schematic.x + toPin.position.x;
    const toY = toComponent.position.schematic.y + toPin.position.y;

    return generateOrthogonalPath(fromX, fromY, toX, toY);
  }, [connection, circuit]);

  if (!pathData) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(connection.id);
  };

  return (
    <path
      data-testid={`wire-${connection.id}`}
      d={pathData}
      fill="none"
      stroke={isSelected ? '#4CAF50' : '#333'}
      strokeWidth={isSelected ? 3 : 2}
      style={{ cursor: 'pointer' }}
      onClick={handleClick}
    />
  );
});
