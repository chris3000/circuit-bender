import { useState, useCallback } from 'react';
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

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle]
  );

  return (
    <div className={styles.section} data-testid={`category-section-${categoryKey}`}>
      <div
        className={styles.header}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <span className={styles.title}>
          {title}
          <span className={styles.count}>({components.length})</span>
        </span>
        <span
          className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}
          aria-hidden="true"
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
