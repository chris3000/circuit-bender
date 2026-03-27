import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component } from '@/types/circuit';

interface DraggableComponentProps {
  component: Component;
}

export const DraggableComponent: React.FC<DraggableComponentProps> = ({ component }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.id,
    data: { component },
  });

  const registry = ComponentRegistry.getInstance();
  const definition = registry.get(component.type);

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
      ref={setNodeRef}
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
};
