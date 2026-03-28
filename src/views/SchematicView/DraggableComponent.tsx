import React, { useCallback, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { PinComponent } from './Pin';
import type { Component, ComponentId, PinId } from '@/types/circuit';
import type { ToolMode } from './Toolbar';

interface DraggableComponentProps {
  component: Component;
  toolMode: ToolMode;
  isSelected: boolean;
  onPinClick: (componentId: ComponentId, pinId: PinId) => void;
  onClick: () => void;
}

export const DraggableComponent = React.memo(function DraggableComponent({
  component,
  toolMode,
  isSelected,
  onPinClick,
  onClick,
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

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (toolMode !== 'select') return;
      e.stopPropagation();
      onClick();
    },
    [toolMode, onClick]
  );

  if (!definition) return null;

  const { width, height } = definition.schematic.dimensions;

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
      data-selected={isSelected ? 'true' : 'false'}
      style={style}
      onClick={handleClick}
      {...dragProps}
    >
      <g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>
        {/* Selection highlight rendered before symbol */}
        {isSelected && (
          <rect
            x={-width / 2 - 5}
            y={-height / 2 - 5}
            width={width + 10}
            height={height + 10}
            fill="none"
            stroke="#4CAF50"
            strokeWidth="2"
            rx="4"
            data-testid={`selection-highlight-${component.id}`}
          />
        )}
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
