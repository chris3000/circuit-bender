import React, { useState, useCallback } from 'react';
import type { Pin, ComponentId, PinId } from '@/types/circuit';

interface PinComponentProps {
  pin: Pin;
  componentId: ComponentId;
  onPinClick: (componentId: ComponentId, pinId: PinId) => void;
}

export const PinComponent = React.memo(function PinComponent({
  pin,
  componentId,
  onPinClick,
}: PinComponentProps) {
  const [hovered, setHovered] = useState(false);

  const isActive = hovered;

  const radius = isActive ? 8 : 5;
  const fill = isActive ? '#FF2D55' : '#999';
  const cursor = 'crosshair';

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPinClick(componentId, pin.id);
    },
    [onPinClick, componentId, pin.id]
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
      stroke={isActive ? '#FF2D55' : 'transparent'}
      strokeWidth={isActive ? 1.5 : 0}
      style={{ cursor, transition: 'r 0.1s ease, fill 0.1s ease' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    />
  );
});
