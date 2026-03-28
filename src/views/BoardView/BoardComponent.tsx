import React, { useCallback, useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import { BoardPin } from './BoardPin';
import type { Component, ComponentId, PinId } from '@/types/circuit';

interface BoardComponentProps {
  component: Component;
  isSelected: boolean;
  ledOn?: boolean;
  onPinDown: (componentId: ComponentId, pinId: PinId) => void;
  onPinUp: (componentId: ComponentId, pinId: PinId) => void;
  onClick: () => void;
  onEditParameter?: (componentId: ComponentId) => void;
  onPotChange?: (componentId: ComponentId, position: number) => void;
  refDes?: string;
}

export const BoardComponent = React.memo(function BoardComponent({
  component,
  isSelected,
  ledOn = false,
  onPinDown,
  onPinUp,
  onClick,
  onEditParameter,
  onPotChange,
  refDes,
}: BoardComponentProps) {
  const { updateComponent } = useCircuit();
  const [hovered, setHovered] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.id,
    data: { component },
  });

  const svgRef = useCallback(
    (element: SVGGElement | null) => {
      setNodeRef(element as unknown as HTMLElement | null);
    },
    [setNodeRef]
  );

  const definition = useMemo(
    () => ComponentRegistry.getInstance().get(component.type),
    [component.type]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick();
    },
    [onClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (
        (component.type === 'resistor' || component.type === 'capacitor') &&
        onEditParameter
      ) {
        onEditParameter(component.id);
      }
    },
    [component.id, component.type, onEditParameter]
  );

  const handleDialDrag = useCallback(
    (e: React.PointerEvent) => {
      if (component.type !== 'potentiometer') return;
      e.stopPropagation();
      e.preventDefault();

      const svgEl = (e.target as SVGElement).ownerSVGElement;
      if (!svgEl) return;

      // Get the component center in screen coordinates
      const ctm = svgEl.getScreenCTM();
      if (!ctm) return;
      const centerX = component.position.x * ctm.a + ctm.e;
      const centerY = component.position.y * ctm.d + ctm.f;

      const onMove = (moveEvent: PointerEvent) => {
        // Angle from component center to cursor
        const dx = moveEvent.clientX - centerX;
        const dy = moveEvent.clientY - centerY;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        // Map angle to 0-1: -135° = 0, +135° = 1 (270° sweep, dead zone at bottom)
        let normalized = (angle + 135) / 270;
        normalized = Math.max(0, Math.min(1, normalized));
        updateComponent(component.id, {
          parameters: { ...component.parameters, position: normalized },
        });
        if (onPotChange) onPotChange(component.id, normalized);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [component, updateComponent, onPotChange]
  );

  if (!definition) return null;

  const { width, height } = definition.board.dimensions;

  const style: React.CSSProperties = {
    cursor: 'move',
    opacity: isDragging ? 0.5 : 1,
  };

  if (transform) {
    style.transform = `translate(${transform.x}px, ${transform.y}px)`;
  }

  return (
    <g
      ref={svgRef}
      data-testid={`board-component-${component.id}`}
      data-draggable="true"
      data-selected={isSelected ? 'true' : 'false'}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      {...listeners}
      {...attributes}
    >
      <g
        transform={`translate(${component.position.x}, ${component.position.y})`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <rect
          x={-width / 2 - 5}
          y={-height / 2 - 5}
          width={width + 10}
          height={height + 10}
          fill="transparent"
          rx="4"
        />
        {isSelected && (
          <rect
            x={-width / 2 - 5}
            y={-height / 2 - 5}
            width={width + 10}
            height={height + 10}
            fill="none"
            stroke="#FF2D55"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />
        )}
        {component.type === 'led' && ledOn && (
          <>
            <ellipse cx="0" cy="0" rx="50" ry="50" fill="url(#ledGlow)" />
            <ellipse cx="0" cy="0" rx="25" ry="25" fill="url(#ledGlow)" />
          </>
        )}
        <g filter={hovered && !isDragging ? 'url(#hoverGlow)' : 'url(#componentShadow)'}>
          {definition.board.symbol.render(component.parameters)}
        </g>
        {component.pins.map((pin) => (
          <BoardPin
            key={pin.id}
            pin={pin}
            componentId={component.id}
            onPinDown={onPinDown}
            onPinUp={onPinUp}
          />
        ))}
        {refDes && (
          <text
            x={0}
            y={-height / 2 - 8}
            textAnchor="middle"
            fontSize="8"
            fill="#d4ecd4"
            opacity="0.6"
            fontFamily="Courier New"
            style={{ pointerEvents: 'none' }}
          >
            {refDes}
          </text>
        )}
        {component.type === 'potentiometer' && (() => {
          const pos = (component.parameters.position as number) ?? 0.5;
          return (
            <g>
              {/* Invisible drag target over the dial */}
              <circle
                cx={0}
                cy={0}
                r={24}
                fill="transparent"
                style={{ cursor: 'grab' }}
                onPointerDown={handleDialDrag}
              />
              {/* Percentage label below */}
              <text x={0} y={height / 2 + 14} textAnchor="middle" fontSize="9" fill="#d4ecd4" opacity="0.7" fontFamily="Courier New" pointerEvents="none">
                {Math.round(pos * 100)}%
              </text>
            </g>
          );
        })()}
      </g>
    </g>
  );
});
