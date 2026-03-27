import React, { useMemo } from 'react';
import type { ComponentId, PinId } from '@/types/circuit';
import { Circuit } from '@/models/Circuit';

interface PreviewWireProps {
  fromComponentId: ComponentId;
  fromPinId: PinId;
  toX: number;
  toY: number;
  circuit: Circuit;
}

export const PreviewWire = React.memo(function PreviewWire({
  fromComponentId,
  fromPinId,
  toX,
  toY,
  circuit,
}: PreviewWireProps) {
  const startPos = useMemo(() => {
    const component = circuit.getComponent(fromComponentId);
    if (!component) return null;

    const pin = component.pins.find((p) => p.id === fromPinId);
    if (!pin) return null;

    return {
      x: component.position.schematic.x + pin.position.x,
      y: component.position.schematic.y + pin.position.y,
    };
  }, [circuit, fromComponentId, fromPinId]);

  if (!startPos) return null;

  const { x: x1, y: y1 } = startPos;
  const midX = (x1 + toX) / 2;

  // Manhattan routing: horizontal -> vertical -> horizontal
  const pathD = `M ${x1},${y1} H ${midX} V ${toY} H ${toX}`;

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
