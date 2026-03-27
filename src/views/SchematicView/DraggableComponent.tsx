import React, { useCallback, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { PinComponent } from './Pin';
import type { Component, ComponentId, PinId } from '@/types/circuit';
import type { ToolMode } from './Toolbar';

interface DraggableComponentProps {
  component: Component;
  toolMode: ToolMode;
  onPinClick: (componentId: ComponentId, pinId: PinId) => void;
}

export const DraggableComponent = React.memo(function DraggableComponent({
  component,
  toolMode,
  onPinClick,
}: DraggableComponentProps) {
  const isWireMode = toolMode === 'wire';

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.id,
    data: { component },
    disabled: isWireMode,
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
    cursor: isWireMode ? 'default' : 'move',
    opacity: isDragging ? 0.5 : 1,
  };

  if (transform) {
    style.transform = `translate(${transform.x}px, ${transform.y}px)`;
  }

  // Only spread drag listeners/attributes when not in wire mode
  const dragProps = isWireMode ? {} : { ...listeners, ...attributes };

  return (
    <g
      ref={svgRef}
      data-testid={`component-${component.id}`}
      data-draggable={isWireMode ? 'false' : 'true'}
      style={style}
      {...dragProps}
    >
      <g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>
        {definition.schematic.symbol.render(component.parameters)}
        {/* Render pins after the symbol */}
        {component.pins.map((pin) => (
          <PinComponent
            key={pin.id}
            pin={pin}
            componentId={component.id}
            toolMode={toolMode}
            onPinClick={onPinClick}
          />
        ))}
      </g>
    </g>
  );
});
