import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ComponentDefinition } from '@/types/circuit';
import { ComponentSymbol } from '@/components/ComponentSymbol';
import styles from './ComponentCard.module.css';

interface ComponentCardProps {
  definition: ComponentDefinition;
}

function getValueLabel(definition: ComponentDefinition): string | null {
  const { type, defaultParameters, metadata } = definition;

  // For ICs, show the part number as the value (name label will show description)
  if (metadata.category === 'ic') return type.toUpperCase();

  // For components with a value param, format it nicely
  if (defaultParameters.value) {
    const val = String(defaultParameters.value);
    // Add Ω suffix for resistors/pots if not already present
    if (type === 'resistor' || type === 'potentiometer') {
      return val.includes('Ω') ? val : `${val}Ω`;
    }
    return val;
  }

  return null;
}

function getNameLabel(definition: ComponentDefinition): string {
  const { type, metadata } = definition;
  // For ICs, show a short description instead of duplicating the part number
  if (type === 'cd40106') return 'Schmitt Inv';
  if (type === 'lm741') return 'Op-Amp';
  return metadata.name;
}

export const ComponentCard = React.memo(function ComponentCard({ definition }: ComponentCardProps) {
  const { type, metadata } = definition;
  const isPower = type === 'power';

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drawer-${type}`,
    data: { componentType: type },
  });

  const valueLabel = getValueLabel(definition);
  const nameLabel = getNameLabel(definition);

  return (
    <div
      ref={setNodeRef}
      className={`${styles.card} ${isPower ? styles.cardPower : ''}`}
      data-testid={`component-card-${type}`}
      data-draggable="true"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      title={`${metadata.name}${valueLabel ? ` (${valueLabel})` : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className={styles.symbol}>
        <ComponentSymbol
          definition={definition}
          width={48}
          height={32}
          testId={`component-symbol-${type}`}
        />
      </div>
      {valueLabel && <span className={styles.value}>{valueLabel}</span>}
      <span className={styles.name}>{nameLabel}</span>
    </div>
  );
});
