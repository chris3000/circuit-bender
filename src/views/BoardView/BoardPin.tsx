import React, { useState, useCallback } from 'react';
import type { Pin, ComponentId, PinId } from '@/types/circuit';

interface BoardPinProps {
  pin: Pin;
  componentId: ComponentId;
  onPinDown: (componentId: ComponentId, pinId: PinId) => void;
  onPinUp: (componentId: ComponentId, pinId: PinId) => void;
}

export const BoardPin = React.memo(function BoardPin({
  pin,
  componentId,
  onPinDown,
  onPinUp,
}: BoardPinProps) {
  const [hovered, setHovered] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onPinDown(componentId, pin.id);
    },
    [componentId, pin.id, onPinDown]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onPinUp(componentId, pin.id);
    },
    [componentId, pin.id, onPinUp]
  );

  return (
    <g
      transform={`translate(${pin.position.x}, ${pin.position.y})`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ cursor: 'crosshair' }}
    >
      <circle
        r={hovered ? 7 : 6}
        fill="url(#padGradient)"
        stroke={hovered ? '#FF2D55' : '#8a6e2c'}
        strokeWidth={hovered ? 1.5 : 0.8}
      />
      <circle r="2" fill="#1a6b3c" />
    </g>
  );
});
