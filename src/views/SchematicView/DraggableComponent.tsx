import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import { PinComponent } from './Pin';
import type { Component, ComponentId, PinId } from '@/types/circuit';

interface DraggableComponentProps {
  component: Component;
  isSelected: boolean;
  onPinClick: (componentId: ComponentId, pinId: PinId) => void;
  onClick: () => void;
  onEditParameter?: (componentId: ComponentId) => void;
}

export const DraggableComponent = React.memo(function DraggableComponent({
  component,
  isSelected,
  onPinClick,
  onClick,
  onEditParameter,
}: DraggableComponentProps) {
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

  // Potentiometer drag interaction
  const potDragRef = useRef<{
    startY: number;
    startPosition: number;
  } | null>(null);

  const componentRef = useRef(component);
  componentRef.current = component;

  useEffect(() => {
    if (component.type !== 'potentiometer') return;
    return () => {
      potDragRef.current = null;
    };
  }, [component.type]);

  const handlePotMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (component.type !== 'potentiometer' || !e.altKey) return;

      e.stopPropagation();
      e.preventDefault();

      const currentPosition = (componentRef.current.parameters.position as number) ?? 0.5;
      potDragRef.current = {
        startY: e.clientY,
        startPosition: currentPosition,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!potDragRef.current) return;

        const deltaY = potDragRef.current.startY - moveEvent.clientY;
        const sensitivity = 100;
        const newPosition = Math.max(
          0,
          Math.min(1, potDragRef.current.startPosition + deltaY / sensitivity)
        );

        updateComponent(componentRef.current.id, {
          parameters: {
            ...componentRef.current.parameters,
            position: newPosition,
          },
        });
      };

      const handleMouseUp = () => {
        potDragRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [component.type, updateComponent]
  );

  if (!definition) return null;

  const { width, height } = definition.schematic.dimensions;

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
      data-testid={`component-${component.id}`}
      data-draggable="true"
      data-selected={isSelected ? 'true' : 'false'}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={component.type === 'potentiometer' ? handlePotMouseDown : undefined}
      {...listeners}
      {...attributes}
    >
      <g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>
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
            data-testid={`selection-highlight-${component.id}`}
          />
        )}
        {definition.schematic.symbol.render(component.parameters)}
        {component.pins.map((pin) => (
          <PinComponent
            key={pin.id}
            pin={pin}
            componentId={component.id}
            onPinClick={onPinClick}
          />
        ))}
        {isSelected && component.type === 'potentiometer' && (
          <text
            x={0}
            y={height / 2 + 16}
            textAnchor="middle"
            fontSize="9"
            fill="#888"
            pointerEvents="none"
          >
            Alt+drag to adjust
          </text>
        )}
      </g>
    </g>
  );
});
