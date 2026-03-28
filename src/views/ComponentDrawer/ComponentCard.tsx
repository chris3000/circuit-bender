import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ComponentDefinition } from '@/types/circuit';
import { ComponentSymbol } from '@/components/ComponentSymbol';
import styles from './ComponentCard.module.css';

interface ComponentCardProps {
  definition: ComponentDefinition;
}

function getValueLabel(definition: ComponentDefinition): string | null {
  const { type, defaultParameters } = definition;
  if (defaultParameters.value) return String(defaultParameters.value);
  if (type === 'resistor') return '1kΩ';
  if (type === 'capacitor') return '100nF';
  if (type === 'potentiometer') return '0–1MΩ';
  if (type === 'power-supply') return '+9V';
  if (type === 'cd40106') return 'CD40106';
  if (type === 'lm741') return 'LM741';
  if (type === '2n3904') return '2N3904';
  if (type === '1n914') return '1N914';
  if (type === 'led') return 'LED';
  return null;
}

export const ComponentCard = React.memo(function ComponentCard({ definition }: ComponentCardProps) {
  const { type, metadata } = definition;
  const isPower = type === 'power-supply';

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drawer-${type}`,
    data: { componentType: type },
  });

  const valueLabel = getValueLabel(definition);

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
      <span className={styles.name}>{metadata.name}</span>
    </div>
  );
});
