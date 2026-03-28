import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import { PinComponent } from './Pin';
import type { Component, ComponentId, PinId } from '@/types/circuit';
import type { ToolMode } from './Toolbar';

interface DraggableComponentProps {
  component: Component;
  toolMode: ToolMode;
  isSelected: boolean;
  onPinClick: (componentId: ComponentId, pinId: PinId) => void;
  onClick: () => void;
  onEditParameter?: (componentId: ComponentId) => void;
}

export const DraggableComponent = React.memo(function DraggableComponent({
  component,
  toolMode,
  isSelected,
  onPinClick,
  onClick,
  onEditParameter,
}: DraggableComponentProps) {
  const isWireMode = toolMode === 'wire';
  const { updateComponent } = useCircuit();

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

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (toolMode !== 'select') return;
      e.stopPropagation();
      if (
        (component.type === 'resistor' || component.type === 'capacitor') &&
        onEditParameter
      ) {
        onEditParameter(component.id);
      }
    },
    [toolMode, component.id, component.type, onEditParameter]
  );

  // Potentiometer drag interaction
  const potDragRef = useRef<{
    startY: number;
    startPosition: number;
  } | null>(null);

  const componentRef = useRef(component);
  componentRef.current = component;

  useEffect(() => {
    if (component.type !== 'potentiometer' || toolMode !== 'select') return;

    // Clean up function handles removing listeners
    return () => {
      potDragRef.current = null;
    };
  }, [component.type, toolMode]);

  const handlePotMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only activate wiper drag with Alt key held
      if (component.type !== 'potentiometer' || toolMode !== 'select' || !e.altKey) return;

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
    [toolMode, component.type, updateComponent]
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
      onDoubleClick={handleDoubleClick}
      onMouseDown={component.type === 'potentiometer' ? handlePotMouseDown : undefined}
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
        {/* Visual hint for potentiometer wiper adjustment */}
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
