import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { ComponentDefinition } from '@/types/circuit';
import { SearchBar } from './SearchBar';
import { CategorySection } from './CategorySection';
import styles from './ComponentDrawer.module.css';

const CATEGORY_TITLES: Record<string, string> = {
  passive: 'Passive Components',
  active: 'Active Components',
  ic: 'Integrated Circuits',
  control: 'Controls',
  power: 'Power & Ground',
};

function getCategoryTitle(category: string): string {
  return CATEGORY_TITLES[category] || category;
}

function filterComponents(
  components: ComponentDefinition[],
  query: string
): ComponentDefinition[] {
  if (!query.trim()) return components;

  const lowerQuery = query.toLowerCase();
  return components.filter(
    (def) =>
      def.metadata.name.toLowerCase().includes(lowerQuery) ||
      def.type.toLowerCase().includes(lowerQuery) ||
      def.metadata.description.toLowerCase().includes(lowerQuery) ||
      def.metadata.category.toLowerCase().includes(lowerQuery)
  );
}

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
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registry = ComponentRegistry.getInstance();

  const handleSearchChange = useCallback((value: string) => {
    setInputValue(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const filteredComponents = useMemo(
    () => filterComponents(registry.listAll(), searchQuery),
    [registry, searchQuery]
  );

  const groupedComponents = useMemo(
    () => groupByCategory(filteredComponents),
    [filteredComponents]
  );

  return (
    <div className={styles.drawer} data-testid="component-drawer">
      <div className={styles.header}>
        <span className={styles.title}>Components</span>
      </div>

      <SearchBar value={inputValue} onChange={handleSearchChange} />

      <div className={styles.content}>
        {groupedComponents.size === 0 && (
          <div className={styles.empty}>No components found</div>
        )}

        {Array.from(groupedComponents.entries()).map(([category, components]) => (
          <CategorySection
            key={category}
            categoryKey={category}
            title={getCategoryTitle(category)}
            components={components}
          />
        ))}
      </div>
    </div>
  );
}
