import React, { useCallback } from 'react';
import type { ComponentDefinition } from '@/types/circuit';
import { ComponentSymbol } from '@/components/ComponentSymbol';
import styles from './ComponentCard.module.css';

interface ComponentCardProps {
  definition: ComponentDefinition;
}

function getValueLabel(definition: ComponentDefinition): string | null {
  const { type, defaultParameters, metadata } = definition;
  if (metadata.category === 'ic') return type.toUpperCase();
  if (defaultParameters.value) {
    const val = String(defaultParameters.value);
    if (type === 'resistor' || type === 'potentiometer') {
      return val.includes('\u03A9') ? val : `${val}\u03A9`;
    }
    return val;
  }
  return null;
}

function getNameLabel(definition: ComponentDefinition): string {
  const { type } = definition;
  if (type === 'cd40106') return 'Schmitt Inv';
  if (type === 'lm741') return 'Op-Amp';
  return definition.metadata.name;
}

export const ComponentCard = React.memo(function ComponentCard({ definition }: ComponentCardProps) {
  const { type, metadata } = definition;
  const isPower = type === 'power';
  const isGround = type === 'ground';
  const valueLabel = getValueLabel(definition);
  const nameLabel = getNameLabel(definition);

  const onDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/circuit-component', type);
    e.dataTransfer.effectAllowed = 'move';
  }, [type]);

  return (
    <div
      className={`${styles.card} ${isPower ? styles.cardPower : ''} ${isGround ? styles.cardGround : ''}`}
      data-testid={`component-card-${type}`}
      draggable
      onDragStart={onDragStart}
      title={`${metadata.name}${valueLabel ? ` (${valueLabel})` : ''}`}
    >
      <div className={styles.symbol}>
        <ComponentSymbol definition={definition} width={48} height={32} testId={`component-symbol-${type}`} />
      </div>
      {valueLabel && <span className={styles.value}>{valueLabel}</span>}
      <span className={styles.name}>{nameLabel}</span>
    </div>
  );
});
