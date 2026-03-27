import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ComponentDefinition } from '@/types/circuit';
import { ComponentSymbol } from '@/components/ComponentSymbol';
import styles from './ComponentCard.module.css';

interface ComponentCardProps {
  definition: ComponentDefinition;
}

export const ComponentCard = React.memo(function ComponentCard({ definition }: ComponentCardProps) {
  const { type, metadata } = definition;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drawer-${type}`,
    data: { componentType: type },
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.card}
      data-testid={`component-card-${type}`}
      data-draggable="true"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      {...listeners}
      {...attributes}
    >
      <div className={styles.symbol}>
        <ComponentSymbol
          definition={definition}
          testId={`component-symbol-${type}`}
        />
      </div>
      <span className={styles.name}>{metadata.name}</span>
      <span
        className={styles.badge}
        data-testid={`category-badge-${type}`}
      >
        {metadata.category}
      </span>
    </div>
  );
});
