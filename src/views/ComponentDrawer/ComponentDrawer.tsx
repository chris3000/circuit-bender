import { useMemo } from 'react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { ComponentDefinition } from '@/types/circuit';
import { CategorySection } from './CategorySection';
import styles from './ComponentDrawer.module.css';

const CATEGORY_ORDER = ['passive', 'ic', 'control', 'power', 'active'];

const CATEGORY_LABELS: Record<string, string> = {
  passive: 'Passive',
  active: 'Active',
  ic: 'ICs',
  control: 'Ctrl',
  power: 'Power',
};

function groupByCategory(
  components: ComponentDefinition[]
): Map<string, ComponentDefinition[]> {
  const groups = new Map<string, ComponentDefinition[]>();
  for (const def of components) {
    const category = def.metadata.category;
    const existing = groups.get(category) || [];
    existing.push(def);
    groups.set(category, existing);
  }
  return groups;
}

export function ComponentDrawer() {
  const registry = ComponentRegistry.getInstance();

  const groupedComponents = useMemo(
    () => groupByCategory(registry.listAll()),
    [registry]
  );

  const sortedEntries = useMemo(() => {
    const entries = Array.from(groupedComponents.entries());
    return entries.sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [groupedComponents]);

  return (
    <div className={styles.drawer} data-testid="component-drawer">
      <div className={styles.content}>
        {sortedEntries.map(([category, components]) => (
          <CategorySection
            key={category}
            categoryKey={category}
            title={CATEGORY_LABELS[category] || category}
            components={components}
          />
        ))}
      </div>
    </div>
  );
}
