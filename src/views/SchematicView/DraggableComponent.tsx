import React, { useCallback, useMemo, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import { PinComponent } from './Pin';
import type { Component, ComponentId, PinId } from '@/types/circuit';

interface DraggableComponentProps {
  component: Component;
  isSelected: boolean;
  ledOn?: boolean;
  onPinDown: (componentId: ComponentId, pinId: PinId) => void;
  onPinUp: (componentId: ComponentId, pinId: PinId) => void;
  onClick: () => void;
  onEditParameter?: (componentId: ComponentId) => void;
  onPotChange?: (componentId: ComponentId, position: number) => void;
}

export const DraggableComponent = React.memo(function DraggableComponent({
  component,
  isSelected,
  ledOn = false,
  onPinDown,
  onPinUp,
  onClick,
  onEditParameter,
  onPotChange,
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

  // Potentiometer dial interaction
  const handleDialDrag = useCallback(
    (e: React.PointerEvent) => {
      if (component.type !== 'potentiometer') return;
      e.stopPropagation();
      e.preventDefault();

      const svgEl = (e.target as SVGElement).ownerSVGElement;
      if (!svgEl) return;

      const ctm = svgEl.getScreenCTM();
      if (!ctm) return;
      const centerX = component.position.x * ctm.a + ctm.e;
      const centerY = component.position.y * ctm.d + ctm.f;

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - centerX;
        const dy = moveEvent.clientY - centerY;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
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
      {...listeners}
      {...attributes}
    >
      <g transform={`translate(${component.position.x}, ${component.position.y})`}>
        {/* Invisible hit area for dragging from anywhere on the component */}
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
            data-testid={`selection-highlight-${component.id}`}
          />
        )}
        {/* LED glow effect when on */}
        {component.type === 'led' && ledOn && (
          <>
            <circle cx="0" cy="0" r="20" fill="red" opacity="0.15" filter="url(#glow)" />
            <circle cx="0" cy="0" r="12" fill="red" opacity="0.3" />
          </>
        )}
        {definition.schematic.symbol.render(component.parameters)}
        {component.pins.map((pin) => (
          <PinComponent
            key={pin.id}
            pin={pin}
            componentId={component.id}
            onPinDown={onPinDown}
            onPinUp={onPinUp}
          />
        ))}
        {/* Potentiometer dial */}
        {component.type === 'potentiometer' && (() => {
          const pos = (component.parameters.position as number) ?? 0.5;
          const dialY = height / 2 + 20;
          const dialR = 12;
          const angle = -135 + pos * 270;
          const rad = (angle * Math.PI) / 180;
          return (
            <g transform={`translate(0, ${dialY})`}>
              {/* Dial body */}
              <circle cx={0} cy={0} r={dialR} fill="#555" stroke="#777" strokeWidth="1" />
              {/* Position indicator */}
              <line
                x1={0} y1={0}
                x2={Math.cos(rad) * (dialR - 3)}
                y2={Math.sin(rad) * (dialR - 3)}
                stroke="#FF2D55"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Center dot */}
              <circle cx={0} cy={0} r="2" fill="#999" />
              {/* Invisible drag target */}
              <circle
                cx={0} cy={0} r={dialR}
                fill="transparent"
                style={{ cursor: 'grab' }}
                onPointerDown={handleDialDrag}
              />
              {/* Label */}
              <text x={0} y={dialR + 12} textAnchor="middle" fontSize="8" fill="#999" pointerEvents="none">
                {Math.round(pos * 100)}%
              </text>
            </g>
          );
        })()}
      </g>
    </g>
  );
});
