import React, { useCallback, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component } from '@/types/circuit';

interface DraggableComponentProps {
  component: Component;
}

export const DraggableComponent = React.memo(function DraggableComponent({ component }: DraggableComponentProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.id,
    data: { component },
  });

  // Bridge SVGGElement to the HTMLElement ref that dnd-kit expects.
  // SVGGElement shares the same base Element interface that dnd-kit
  // needs for measurement (getBoundingClientRect), so the cast is safe.
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

  if (!definition) return null;

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
      style={style}
      {...listeners}
      {...attributes}
    >
      <g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>
        {definition.schematic.symbol.render(component.parameters)}
      </g>
    </g>
  );
});
