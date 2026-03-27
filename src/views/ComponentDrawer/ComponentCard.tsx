import React from 'react';
import type { ComponentDefinition } from '@/types/circuit';
import styles from './ComponentCard.module.css';

interface ComponentCardProps {
  definition: ComponentDefinition;
}

export const ComponentCard = React.memo(function ComponentCard({ definition }: ComponentCardProps) {
  const { type, metadata, schematic } = definition;
  const { symbol } = schematic;

  return (
    <div className={styles.card} data-testid={`component-card-${type}`}>
      <div className={styles.symbol}>
        <svg
          data-testid={`component-symbol-${type}`}
          width={60}
          height={60}
          viewBox={`${-symbol.width / 2} ${-symbol.height / 2} ${symbol.width} ${symbol.height}`}
        >
          {symbol.render(definition.defaultParameters)}
        </svg>
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
