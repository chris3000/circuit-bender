import { useState } from 'react';
import type { ComponentDefinition } from '@/types/circuit';
import { ComponentCard } from './ComponentCard';
import styles from './CategorySection.module.css';

interface CategorySectionProps {
  categoryKey: string;
  title: string;
  components: ComponentDefinition[];
}

export function CategorySection({ categoryKey, title, components }: CategorySectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={styles.section} data-testid={`category-section-${categoryKey}`}>
      <div
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
      >
        <span className={styles.title}>
          {title}
          <span className={styles.count}>({components.length})</span>
        </span>
        <span
          className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}
        >
          &#9654;
        </span>
      </div>
      <div
        className={styles.content}
        data-testid={`category-content-${categoryKey}`}
        hidden={!expanded}
      >
        {components.map((def) => (
          <ComponentCard key={def.type} definition={def} />
        ))}
      </div>
    </div>
  );
}
