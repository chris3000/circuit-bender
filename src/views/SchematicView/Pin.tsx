import React, { useState, useCallback } from 'react';
import type { Pin, ComponentId, PinId } from '@/types/circuit';
import type { ToolMode } from './Toolbar';

interface PinComponentProps {
  pin: Pin;
  componentId: ComponentId;
  toolMode: ToolMode;
  onPinClick: (componentId: ComponentId, pinId: PinId) => void;
}

export const PinComponent = React.memo(function PinComponent({
  pin,
  componentId,
  toolMode,
  onPinClick,
}: PinComponentProps) {
  const [hovered, setHovered] = useState(false);

  const isWireMode = toolMode === 'wire';
  const isActive = isWireMode && hovered;

  const radius = isActive ? 6 : 4;
  const fill = isActive ? '#4CAF50' : '#666';
  const cursor = isWireMode ? 'crosshair' : 'default';

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isWireMode) return;
      e.stopPropagation();
      onPinClick(componentId, pin.id);
    },
    [isWireMode, onPinClick, componentId, pin.id]
  );

  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  return (
    <circle
      data-testid={`pin-${componentId}-${pin.id}`}
      cx={pin.position.x}
      cy={pin.position.y}
      r={radius}
      fill={fill}
      stroke={isActive ? '#388E3C' : 'transparent'}
      strokeWidth={isActive ? 1.5 : 0}
      style={{ cursor, transition: 'r 0.1s ease, fill 0.1s ease' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onPointerDown={(e) => {
        if (isWireMode) e.stopPropagation();
      }}
    />
  );
});
