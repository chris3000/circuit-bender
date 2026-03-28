import React, { useCallback, useMemo } from 'react';
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
}: BoardComponentProps) {
  const { updateComponent } = useCircuit();

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

  const handleSliderDrag = useCallback(
    (e: React.PointerEvent) => {
      if (component.type !== 'potentiometer') return;
      e.stopPropagation();
      e.preventDefault();

      const sliderWidth = 60;
      const startX = e.clientX;
      const currentPosition = (component.parameters.position as number) ?? 0.5;

      const onMove = (moveEvent: PointerEvent) => {
        const svgEl = (e.target as SVGElement).ownerSVGElement;
        const scale = svgEl ? svgEl.getBoundingClientRect().width / svgEl.viewBox.baseVal.width : 1;
        const newPos = Math.max(0, Math.min(1, currentPosition + (moveEvent.clientX - startX) / scale / sliderWidth));
        updateComponent(component.id, {
          parameters: { ...component.parameters, position: newPos },
        });
        if (onPotChange) onPotChange(component.id, newPos);
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
      <g transform={`translate(${component.position.x}, ${component.position.y})`}>
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
          <ellipse cx="0" cy="0" rx="35" ry="35" fill="url(#ledGlow)" />
        )}
        {definition.board.symbol.render(component.parameters)}
        {component.pins.map((pin) => (
          <BoardPin
            key={pin.id}
            pin={pin}
            componentId={component.id}
            onPinDown={onPinDown}
            onPinUp={onPinUp}
          />
        ))}
        {component.type === 'potentiometer' && (() => {
          const pos = (component.parameters.position as number) ?? 0.5;
          const sliderY = height / 2 + 14;
          const sliderW = 60;
          const thumbX = -sliderW / 2 + pos * sliderW;
          return (
            <g>
              <rect x={-sliderW / 2} y={sliderY - 3} width={sliderW} height={6} rx={3} fill="#444" />
              <rect x={-sliderW / 2} y={sliderY - 3} width={pos * sliderW} height={6} rx={3} fill="#FF2D55" />
              <circle cx={thumbX} cy={sliderY} r={7} fill="white" stroke="#FF2D55" strokeWidth={2} style={{ cursor: 'ew-resize' }} onPointerDown={handleSliderDrag} />
              <text x={0} y={sliderY + 16} textAnchor="middle" fontSize="8" fill="#a8d8a8" pointerEvents="none">
                {Math.round(pos * 100)}%
              </text>
            </g>
          );
        })()}
      </g>
    </g>
  );
});
