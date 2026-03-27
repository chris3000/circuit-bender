# Phase 2: Interactive Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop component placement, wiring tool, 6 new components, and selection/deletion capabilities

**Architecture:** Dual dnd-kit contexts (placement + movement), tool mode state machine, orthogonal wire routing, extended CircuitContext with selection state

**Tech Stack:** React 18, TypeScript 5, @dnd-kit/core, @dnd-kit/utilities, CSS Modules

---

## File Structure

### New Files to Create

**UI Components:**
```
src/views/ComponentDrawer/
├── ComponentDrawer.tsx          # Main sidebar container
├── ComponentDrawer.module.css   # Sidebar styles
├── SearchBar.tsx                # Component search input
├── SearchBar.module.css
├── CategorySection.tsx          # Collapsible category
├── CategorySection.module.css
├── ComponentCard.tsx            # Draggable component card
└── ComponentCard.module.css
```

**Schematic Components:**
```
src/views/SchematicView/
├── Toolbar.tsx                  # Tool mode buttons
├── Toolbar.module.css
├── Wire.tsx                     # Wire rendering component
├── PreviewWire.tsx              # Wire preview during creation
├── Pin.tsx                      # Interactive pin component
└── DraggableComponent.tsx       # Wrapper for placed components
```

**Component Definitions:**
```
src/components/definitions/
├── Capacitor.tsx
├── CD40106.tsx
├── LM741.tsx
├── Potentiometer.tsx
├── PowerSupply.tsx
└── Ground.tsx
```

**Utilities:**
```
src/utils/
├── wiring.ts                    # Wire routing and validation
└── componentFactory.ts          # Component instance creation
```

**Tests:**
```
tests/
├── views/ComponentDrawer.test.tsx
├── views/SchematicView.test.tsx
├── interactions/DragDrop.test.tsx
├── interactions/WiringTool.test.tsx
├── components/definitions/Capacitor.test.ts
├── components/definitions/CD40106.test.ts
├── components/definitions/LM741.test.ts
├── components/definitions/Potentiometer.test.ts
├── components/definitions/PowerSupply.test.ts
└── components/definitions/Ground.test.ts
```

### Files to Modify

- `src/context/CircuitContext.tsx` - Add selection state
- `src/views/SchematicView.tsx` - Add tool modes, DnD, wiring
- `src/App.tsx` - Add ComponentDrawer and DndContext
- `src/main.tsx` - Register new components

---

## Task 1: Component Drawer UI

**Files:**
- Create: `src/views/ComponentDrawer/ComponentDrawer.tsx`
- Create: `src/views/ComponentDrawer/ComponentDrawer.module.css`
- Create: `src/views/ComponentDrawer/SearchBar.tsx`
- Create: `src/views/ComponentDrawer/SearchBar.module.css`
- Create: `src/views/ComponentDrawer/CategorySection.tsx`
- Create: `src/views/ComponentDrawer/CategorySection.module.css`
- Create: `src/views/ComponentDrawer/ComponentCard.tsx`
- Create: `src/views/ComponentDrawer/ComponentCard.module.css`
- Create: `tests/views/ComponentDrawer.test.tsx`

- [ ] **Step 1: Write test for ComponentDrawer rendering categories**

```typescript
// tests/views/ComponentDrawer.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComponentDrawer } from '@/views/ComponentDrawer/ComponentDrawer';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';

describe('ComponentDrawer', () => {
  beforeEach(() => {
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    registry.register(resistorDefinition);
  });

  it('should render component categories', () => {
    render(<ComponentDrawer isOpen={true} />);

    expect(screen.getByText('Passive Components')).toBeInTheDocument();
  });

  it('should render Resistor component card', () => {
    render(<ComponentDrawer isOpen={true} />);

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ComponentDrawer.test.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create ComponentCard component**

```typescript
// src/views/ComponentDrawer/ComponentCard.tsx
import type { ComponentDefinition } from '@/types/circuit';
import styles from './ComponentCard.module.css';

interface ComponentCardProps {
  component: ComponentDefinition;
}

export const ComponentCard: React.FC<ComponentCardProps> = ({ component }) => {
  return (
    <div className={styles.card}>
      <div className={styles.icon}>
        <svg width={60} height={60} viewBox="-30 -30 60 60">
          {component.schematic.symbol.render(component.defaultParameters)}
        </svg>
      </div>
      <div className={styles.name}>{component.metadata.name}</div>
      <div className={styles.badge}>{component.metadata.category}</div>
    </div>
  );
};
```

- [ ] **Step 4: Create ComponentCard styles**

```css
/* src/views/ComponentDrawer/ComponentCard.module.css */
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: grab;
  transition: all 0.2s;
}

.card:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.card:active {
  cursor: grabbing;
}

.icon {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon svg {
  max-width: 100%;
  max-height: 100%;
}

.name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  text-align: center;
}

.badge {
  font-size: 10px;
  padding: 2px 8px;
  background: #e0e0e0;
  border-radius: 12px;
  color: #666;
  text-transform: capitalize;
}
```

- [ ] **Step 5: Create SearchBar component**

```typescript
// src/views/ComponentDrawer/SearchBar.tsx
import styles from './SearchBar.module.css';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search components...'
}) => {
  return (
    <div className={styles.container}>
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
};
```

- [ ] **Step 6: Create SearchBar styles**

```css
/* src/views/ComponentDrawer/SearchBar.module.css */
.container {
  padding: 12px;
}

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: #4CAF50;
}

.input::placeholder {
  color: #999;
}
```

- [ ] **Step 7: Create CategorySection component**

```typescript
// src/views/ComponentDrawer/CategorySection.tsx
import { useState } from 'react';
import styles from './CategorySection.module.css';

interface CategorySectionProps {
  category: string;
  title: string;
  children: React.ReactNode;
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  title,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={styles.section}>
      <button
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.title}>{title}</span>
        <span className={styles.arrow}>{isExpanded ? '▼' : '▶'}</span>
      </button>
      {isExpanded && (
        <div className={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 8: Create CategorySection styles**

```css
/* src/views/ComponentDrawer/CategorySection.module.css */
.section {
  border-bottom: 1px solid #e0e0e0;
}

.header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
}

.header:hover {
  background: #f5f5f5;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.arrow {
  font-size: 10px;
  color: #999;
}

.content {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 8px 12px 12px;
}
```

- [ ] **Step 9: Create ComponentDrawer main component**

```typescript
// src/views/ComponentDrawer/ComponentDrawer.tsx
import { useState, useMemo } from 'react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { SearchBar } from './SearchBar';
import { CategorySection } from './CategorySection';
import { ComponentCard } from './ComponentCard';
import styles from './ComponentDrawer.module.css';

interface ComponentDrawerProps {
  isOpen: boolean;
}

export const ComponentDrawer: React.FC<ComponentDrawerProps> = ({ isOpen }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const registry = ComponentRegistry.getInstance();
  const allComponents = registry.listAll();

  // Filter components based on search
  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return allComponents;

    const query = searchQuery.toLowerCase();
    return allComponents.filter(comp =>
      comp.metadata.name.toLowerCase().includes(query) ||
      comp.type.toLowerCase().includes(query) ||
      comp.metadata.description.toLowerCase().includes(query) ||
      comp.metadata.category.toLowerCase().includes(query)
    );
  }, [allComponents, searchQuery]);

  // Group by category
  const componentsByCategory = useMemo(() => {
    const groups = new Map<string, typeof allComponents>();

    filteredComponents.forEach(comp => {
      const cat = comp.metadata.category;
      if (!groups.has(cat)) {
        groups.set(cat, []);
      }
      groups.get(cat)!.push(comp);
    });

    return groups;
  }, [filteredComponents]);

  const categoryTitles: Record<string, string> = {
    passive: 'Passive Components',
    ic: 'Integrated Circuits',
    control: 'Controls',
    power: 'Power & Ground',
    active: 'Active Components',
  };

  if (!isOpen) return null;

  return (
    <div className={styles.drawer}>
      <div className={styles.header}>
        <h2 className={styles.title}>Components</h2>
      </div>

      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      <div className={styles.content}>
        {Array.from(componentsByCategory.entries()).map(([category, components]) => (
          <CategorySection
            key={category}
            category={category}
            title={categoryTitles[category] || category}
          >
            {components.map(comp => (
              <ComponentCard key={comp.type} component={comp} />
            ))}
          </CategorySection>
        ))}

        {filteredComponents.length === 0 && (
          <div className={styles.noResults}>No components found</div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 10: Create ComponentDrawer styles**

```css
/* src/views/ComponentDrawer/ComponentDrawer.module.css */
.drawer {
  position: fixed;
  left: 0;
  top: 0;
  width: 280px;
  height: 100vh;
  background: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.header {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.content {
  flex: 1;
  overflow-y: auto;
}

.noResults {
  padding: 24px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
```

- [ ] **Step 11: Add test for search filtering**

```typescript
// Add to tests/views/ComponentDrawer.test.tsx
it('should filter components by search query', () => {
  render(<ComponentDrawer isOpen={true} />);

  const searchInput = screen.getByPlaceholderText('Search components...');
  fireEvent.change(searchInput, { target: { value: 'resistor' } });

  expect(screen.getByText('Resistor')).toBeInTheDocument();
});
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npm test -- ComponentDrawer.test.tsx`
Expected: All tests PASS

- [ ] **Step 13: Commit**

```bash
git add src/views/ComponentDrawer/ tests/views/ComponentDrawer.test.tsx
git commit -m "feat: add ComponentDrawer with search and categories

- ComponentCard displays component icon, name, and category badge
- SearchBar filters components by name/type/description/category
- CategorySection provides collapsible categories
- ComponentDrawer organizes all registered components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Drag-and-Drop - Placement (Drawer → Canvas)

**Files:**
- Modify: `src/views/ComponentDrawer/ComponentCard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/views/SchematicView.tsx`
- Create: `src/utils/componentFactory.ts`
- Create: `tests/utils/componentFactory.test.ts`
- Create: `tests/interactions/DragDrop.test.tsx`

- [ ] **Step 1: Write test for component instance creation**

```typescript
// tests/utils/componentFactory.test.ts
import { describe, it, expect } from 'vitest';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { resistorDefinition } from '@/components/definitions/Resistor';
import type { ComponentId } from '@/types/circuit';

describe('componentFactory', () => {
  it('should create component instance from definition', () => {
    const position = { x: 100, y: 200 };
    const component = createComponentFromDefinition(resistorDefinition, position);

    expect(component.type).toBe('resistor');
    expect(component.position.schematic).toEqual(position);
    expect(component.parameters).toEqual(resistorDefinition.defaultParameters);
    expect(component.pins).toHaveLength(2);
  });

  it('should generate unique component IDs', () => {
    const comp1 = createComponentFromDefinition(resistorDefinition, { x: 0, y: 0 });
    const comp2 = createComponentFromDefinition(resistorDefinition, { x: 0, y: 0 });

    expect(comp1.id).not.toBe(comp2.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- componentFactory.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create componentFactory utility**

```typescript
// src/utils/componentFactory.ts
import { nanoid } from 'nanoid';
import type { Component, ComponentDefinition, ComponentId, PinId } from '@/types/circuit';

export const createComponentFromDefinition = (
  definition: ComponentDefinition,
  schematicPosition: { x: number; y: number }
): Component => {
  return {
    id: nanoid() as ComponentId,
    type: definition.type,
    position: {
      schematic: schematicPosition,
      breadboard: { row: 0, column: 0 }, // Placeholder for Phase 3
    },
    rotation: 0,
    parameters: { ...definition.defaultParameters },
    pins: definition.pins.map(pin => ({ ...pin })),
    state: {
      voltages: new Map(),
      currents: new Map(),
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- componentFactory.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Write test for drag-drop placement**

```typescript
// tests/interactions/DragDrop.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { ComponentDrawer } from '@/views/ComponentDrawer/ComponentDrawer';
import { SchematicView } from '@/views/SchematicView';
import { CircuitProvider } from '@/context/CircuitContext';

describe('Drag and Drop - Placement', () => {
  it('should allow dragging ComponentCard', () => {
    render(
      <CircuitProvider>
        <DndContext>
          <ComponentDrawer isOpen={true} />
        </DndContext>
      </CircuitProvider>
    );

    const resistorCard = screen.getByText('Resistor').closest('div');
    expect(resistorCard).toHaveAttribute('data-draggable', 'true');
  });
});
```

- [ ] **Step 6: Make ComponentCard draggable**

```typescript
// Modify src/views/ComponentDrawer/ComponentCard.tsx
import { useDraggable } from '@dnd-kit/core';
import type { ComponentDefinition } from '@/types/circuit';
import styles from './ComponentCard.module.css';

interface ComponentCardProps {
  component: ComponentDefinition;
}

export const ComponentCard: React.FC<ComponentCardProps> = ({ component }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drawer-${component.type}`,
    data: { componentType: component.type },
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.card}
      data-draggable="true"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      {...listeners}
      {...attributes}
    >
      <div className={styles.icon}>
        <svg width={60} height={60} viewBox="-30 -30 60 60">
          {component.schematic.symbol.render(component.defaultParameters)}
        </svg>
      </div>
      <div className={styles.name}>{component.metadata.name}</div>
      <div className={styles.badge}>{component.metadata.category}</div>
    </div>
  );
};
```

- [ ] **Step 7: Update App.tsx to add DndContext**

```typescript
// Modify src/App.tsx
import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import { useState } from 'react';
import { CircuitProvider, useCircuit } from './context/CircuitContext';
import { ComponentDrawer } from './views/ComponentDrawer/ComponentDrawer';
import { SchematicView } from './views/SchematicView';
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { createComponentFromDefinition } from './utils/componentFactory';
import './App.css';

const GRID_SIZE = 20;

const AppContent: React.FC = () => {
  const { addComponent } = useCircuit();
  const [activeType, setActiveType] = useState<string | null>(null);

  const handleDragStart = (event: DragEndEvent) => {
    setActiveType(event.active.data.current?.componentType || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveType(null);

    if (over?.id !== 'schematic-canvas') return;

    const componentType = active.data.current?.componentType as string;
    const registry = ComponentRegistry.getInstance();
    const definition = registry.get(componentType);

    if (!definition) return;

    // Get drop position - for now use center of canvas
    // Will improve with actual mouse position in next step
    const position = {
      x: Math.round(200 / GRID_SIZE) * GRID_SIZE,
      y: Math.round(200 / GRID_SIZE) * GRID_SIZE,
    };

    const component = createComponentFromDefinition(definition, position);
    addComponent(component);
  };

  const registry = ComponentRegistry.getInstance();
  const activeDef = activeType ? registry.get(activeType) : null;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="app">
        <ComponentDrawer isOpen={true} />
        <main style={{ marginLeft: '280px' }}>
          <SchematicView />
        </main>
      </div>

      <DragOverlay>
        {activeDef && (
          <div style={{ opacity: 0.7 }}>
            <svg width={60} height={60} viewBox="-30 -30 60 60">
              {activeDef.schematic.symbol.render(activeDef.defaultParameters)}
            </svg>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export const App: React.FC = () => {
  return (
    <CircuitProvider>
      <AppContent />
    </CircuitProvider>
  );
};
```

- [ ] **Step 8: Update SchematicView to be droppable**

```typescript
// Modify src/views/SchematicView.tsx - add useDroppable
import { useDroppable } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import styles from './SchematicView.module.css';

export const SchematicView: React.FC = () => {
  const { circuit } = useCircuit();
  const { setNodeRef } = useDroppable({ id: 'schematic-canvas' });

  return (
    <div className={styles.container}>
      <svg
        ref={setNodeRef}
        className={styles.canvas}
        viewBox="0 0 800 600"
      >
        <defs>
          <pattern
            id="grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#e0e0e0"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>

        <rect width="800" height="600" fill="url(#grid)" />

        {/* Render components */}
        {circuit.getComponents().map(component => (
          <g
            key={component.id}
            transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}
          >
            <circle r="10" fill="blue" />
            <text y="20" textAnchor="middle" fontSize="10" fill="black">
              {component.type}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
```

- [ ] **Step 9: Run tests**

Run: `npm test -- DragDrop.test.tsx`
Expected: Tests PASS

- [ ] **Step 10: Manual test drag-drop in browser**

Run: `npm run dev`
Test: Drag Resistor from drawer, verify it appears on canvas

- [ ] **Step 11: Commit**

```bash
git add src/views/ComponentDrawer/ComponentCard.tsx src/App.tsx src/views/SchematicView.tsx src/utils/componentFactory.ts tests/
git commit -m "feat: add drag-and-drop placement from drawer to canvas

- ComponentCard is draggable using dnd-kit
- App wraps in DndContext and handles drop events
- SchematicView is droppable zone
- componentFactory creates component instances with unique IDs
- Components snap to grid on drop

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Drag-and-Drop - Movement (Canvas → Canvas)

**Files:**
- Modify: `src/views/SchematicView.tsx`
- Create: `src/views/SchematicView/DraggableComponent.tsx`
- Modify: `tests/interactions/DragDrop.test.tsx`

- [ ] **Step 1: Write test for component movement**

```typescript
// Add to tests/interactions/DragDrop.test.tsx
it('should allow moving placed components', () => {
  const { circuit, updateComponent } = renderWithCircuit();

  // Add a component first
  const component = createComponentFromDefinition(
    resistorDefinition,
    { x: 100, y: 100 }
  );
  addComponent(component);

  // Component should be draggable
  const componentEl = screen.getByTestId(`component-${component.id}`);
  expect(componentEl).toHaveAttribute('data-draggable', 'true');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- DragDrop.test.tsx`
Expected: FAIL - no test ID found

- [ ] **Step 3: Create DraggableComponent wrapper**

```typescript
// src/views/SchematicView/DraggableComponent.tsx
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

  const style = transform ? {
    transform: `translate(${transform.x}px, ${transform.y}px)`,
  } : undefined;

  return (
    <g
      ref={setNodeRef}
      data-testid={`component-${component.id}`}
      data-draggable="true"
      style={{ cursor: 'move', opacity: isDragging ? 0.5 : 1 }}
      {...listeners}
      {...attributes}
    >
      <g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>
        {definition.schematic.symbol.render(component.parameters)}
      </g>
    </g>
  );
};
```

- [ ] **Step 4: Update SchematicView to use DraggableComponent**

```typescript
// Modify src/views/SchematicView.tsx
import { useDroppable, DndContext, DragEndEvent } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import { DraggableComponent } from './SchematicView/DraggableComponent';
import styles from './SchematicView.module.css';

const GRID_SIZE = 20;

export const SchematicView: React.FC = () => {
  const { circuit, updateComponent } = useCircuit();
  const { setNodeRef } = useDroppable({ id: 'schematic-canvas' });

  const handleComponentMove = (event: DragEndEvent) => {
    const { active, delta } = event;
    const component = active.data.current?.component;

    if (!component) return;

    // Calculate new position
    const newX = component.position.schematic.x + delta.x;
    const newY = component.position.schematic.y + delta.y;

    // Snap to grid
    const snappedX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

    updateComponent(component.id, {
      position: {
        ...component.position,
        schematic: { x: snappedX, y: snappedY },
      },
    });
  };

  return (
    <div className={styles.container}>
      <DndContext onDragEnd={handleComponentMove}>
        <svg
          ref={setNodeRef}
          className={styles.canvas}
          viewBox="0 0 800 600"
        >
          <defs>
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#e0e0e0"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>

          <rect width="800" height="600" fill="url(#grid)" />

          {circuit.getComponents().map(component => (
            <DraggableComponent key={component.id} component={component} />
          ))}
        </svg>
      </DndContext>
    </div>
  );
};
```

- [ ] **Step 5: Run tests**

Run: `npm test -- DragDrop.test.tsx`
Expected: Tests PASS

- [ ] **Step 6: Manual test in browser**

Run: `npm run dev`
Test: Place component, then drag it to new position

- [ ] **Step 7: Commit**

```bash
git add src/views/SchematicView/ tests/interactions/DragDrop.test.tsx
git commit -m "feat: add drag-to-move for placed components

- DraggableComponent wraps placed components
- Nested DndContext in SchematicView handles movement
- Components snap to grid when moved
- Position updates in Circuit model

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Wiring Tool - Basic Implementation

**Files:**
- Create: `src/views/SchematicView/Toolbar.tsx`
- Create: `src/views/SchematicView/Toolbar.module.css`
- Create: `src/views/SchematicView/Pin.tsx`
- Create: `src/views/SchematicView/PreviewWire.tsx`
- Modify: `src/views/SchematicView.tsx`
- Modify: `src/views/SchematicView/DraggableComponent.tsx`
- Create: `tests/interactions/WiringTool.test.tsx`

- [ ] **Step 1: Write test for tool mode switching**

```typescript
// tests/interactions/WiringTool.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchematicView } from '@/views/SchematicView';
import { CircuitProvider } from '@/context/CircuitContext';

describe('Wiring Tool', () => {
  it('should switch to wire mode when W key pressed', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    const wireButton = screen.getByLabelText('Wire');
    expect(wireButton).not.toHaveAttribute('data-active', 'true');

    fireEvent.keyDown(window, { key: 'w' });

    expect(wireButton).toHaveAttribute('data-active', 'true');
  });

  it('should show preview wire when pin clicked in wire mode', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    // Switch to wire mode
    fireEvent.keyDown(window, { key: 'w' });

    // Click a pin (will need to add component first)
    // Preview wire should appear
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- WiringTool.test.tsx`
Expected: FAIL - components don't exist yet

- [ ] **Step 3: Create Toolbar component**

```typescript
// src/views/SchematicView/Toolbar.tsx
import styles from './Toolbar.module.css';

export type ToolMode = 'select' | 'wire' | 'pan';

interface ToolbarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ toolMode, onToolModeChange }) => {
  return (
    <div className={styles.toolbar}>
      <button
        className={`${styles.button} ${toolMode === 'select' ? styles.active : ''}`}
        onClick={() => onToolModeChange('select')}
        aria-label="Select"
        data-active={toolMode === 'select'}
        title="Select (V)"
      >
        <span>⬆</span>
      </button>

      <button
        className={`${styles.button} ${toolMode === 'wire' ? styles.active : ''}`}
        onClick={() => onToolModeChange('wire')}
        aria-label="Wire"
        data-active={toolMode === 'wire'}
        title="Wire (W)"
      >
        <span>⚡</span>
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Create Toolbar styles**

```css
/* src/views/SchematicView/Toolbar.module.css */
.toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  background: white;
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.button {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 20px;
  transition: all 0.2s;
}

.button:hover {
  background: #f5f5f5;
  border-color: #4CAF50;
}

.button.active {
  background: #4CAF50;
  border-color: #4CAF50;
  color: white;
}
```

- [ ] **Step 5: Create Pin component**

```typescript
// src/views/SchematicView/Pin.tsx
import { useState } from 'react';
import type { Pin, ComponentId } from '@/types/circuit';
import type { ToolMode } from './Toolbar';

interface PinComponentProps {
  pin: Pin;
  componentId: ComponentId;
  toolMode: ToolMode;
  onClick: () => void;
}

export const PinComponent: React.FC<PinComponentProps> = ({
  pin,
  componentId,
  toolMode,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const showHover = toolMode === 'wire' && isHovered;
  const radius = showHover ? 6 : 4;
  const fill = showHover ? '#4CAF50' : '#666';
  const cursor = toolMode === 'wire' ? 'pointer' : 'default';

  return (
    <circle
      cx={pin.position.x}
      cy={pin.position.y}
      r={radius}
      fill={fill}
      stroke={showHover ? '#2E7D32' : 'none'}
      strokeWidth={2}
      onClick={(e) => {
        e.stopPropagation();
        if (toolMode === 'wire') {
          onClick();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor }}
      data-testid={`pin-${componentId}-${pin.id}`}
    />
  );
};
```

- [ ] **Step 6: Create PreviewWire component**

```typescript
// src/views/SchematicView/PreviewWire.tsx
import type { ComponentId, PinId, Circuit } from '@/types/circuit';

interface PreviewWireProps {
  fromComponent: ComponentId;
  fromPin: PinId;
  toX: number;
  toY: number;
  circuit: Circuit;
}

export const PreviewWire: React.FC<PreviewWireProps> = ({
  fromComponent,
  fromPin,
  toX,
  toY,
  circuit,
}) => {
  const comp = circuit.getComponent(fromComponent);
  const pin = comp?.pins.find(p => p.id === fromPin);

  if (!comp || !pin) return null;

  const x1 = comp.position.schematic.x + pin.position.x;
  const y1 = comp.position.schematic.y + pin.position.y;
  const midX = (x1 + toX) / 2;

  const path = `M ${x1},${y1} H ${midX} V ${toY} H ${toX}`;

  return (
    <path
      d={path}
      stroke="#999"
      strokeWidth={2}
      strokeDasharray="4 4"
      fill="none"
      pointerEvents="none"
      data-testid="preview-wire"
    />
  );
};
```

- [ ] **Step 7: Update DraggableComponent to include pins**

```typescript
// Modify src/views/SchematicView/DraggableComponent.tsx
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { PinComponent } from './Pin';
import type { Component, ComponentId, PinId } from '@/types/circuit';
import type { ToolMode } from './Toolbar';

interface DraggableComponentProps {
  component: Component;
  toolMode: ToolMode;
  onPinClick: (componentId: ComponentId, pinId: PinId) => void;
}

export const DraggableComponent: React.FC<DraggableComponentProps> = ({
  component,
  toolMode,
  onPinClick,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.id,
    data: { component },
    disabled: toolMode === 'wire', // Don't drag in wire mode
  });

  const registry = ComponentRegistry.getInstance();
  const definition = registry.get(component.type);

  if (!definition) return null;

  const style = transform ? {
    transform: `translate(${transform.x}px, ${transform.y}px)`,
  } : undefined;

  return (
    <g
      ref={setNodeRef}
      data-testid={`component-${component.id}`}
      data-draggable={toolMode !== 'wire'}
      style={{ cursor: toolMode === 'wire' ? 'default' : 'move', opacity: isDragging ? 0.5 : 1 }}
      {...(toolMode === 'wire' ? {} : { ...listeners, ...attributes })}
    >
      <g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>
        {definition.schematic.symbol.render(component.parameters)}

        {/* Render pins */}
        {component.pins.map(pin => (
          <PinComponent
            key={pin.id}
            pin={pin}
            componentId={component.id}
            toolMode={toolMode}
            onClick={() => onPinClick(component.id, pin.id)}
          />
        ))}
      </g>
    </g>
  );
};
```

- [ ] **Step 8: Update SchematicView with tool mode and wiring state**

```typescript
// Modify src/views/SchematicView.tsx
import { useState, useEffect } from 'react';
import { useDroppable, DndContext, DragEndEvent } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import { DraggableComponent } from './SchematicView/DraggableComponent';
import { Toolbar, ToolMode } from './SchematicView/Toolbar';
import { PreviewWire } from './SchematicView/PreviewWire';
import type { ComponentId, PinId } from '@/types/circuit';
import styles from './SchematicView.module.css';

const GRID_SIZE = 20;

type WiringState =
  | { status: 'idle' }
  | {
      status: 'in-progress';
      fromComponent: ComponentId;
      fromPin: PinId;
      cursorPos: { x: number; y: number };
    };

export const SchematicView: React.FC = () => {
  const { circuit, updateComponent } = useCircuit();
  const { setNodeRef } = useDroppable({ id: 'schematic-canvas' });

  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [wiringState, setWiringState] = useState<WiringState>({ status: 'idle' });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') {
        setToolMode('wire');
      } else if (e.key === 'v' || e.key === 'V') {
        setToolMode('select');
      } else if (e.key === 'Escape') {
        setToolMode('select');
        setWiringState({ status: 'idle' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleComponentMove = (event: DragEndEvent) => {
    const { active, delta } = event;
    const component = active.data.current?.component;

    if (!component) return;

    const newX = component.position.schematic.x + delta.x;
    const newY = component.position.schematic.y + delta.y;

    const snappedX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

    updateComponent(component.id, {
      position: {
        ...component.position,
        schematic: { x: snappedX, y: snappedY },
      },
    });
  };

  const handlePinClick = (componentId: ComponentId, pinId: PinId) => {
    if (toolMode !== 'wire') return;

    if (wiringState.status === 'idle') {
      setWiringState({
        status: 'in-progress',
        fromComponent: componentId,
        fromPin: pinId,
        cursorPos,
      });
    } else {
      // Will complete wire in next task
      console.log('Wire complete:', wiringState, 'to', componentId, pinId);
      setWiringState({ status: 'idle' });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCursorPos({ x, y });

    if (wiringState.status === 'in-progress') {
      setWiringState({
        ...wiringState,
        cursorPos: { x, y },
      });
    }
  };

  return (
    <div className={styles.container}>
      <Toolbar toolMode={toolMode} onToolModeChange={setToolMode} />

      <DndContext onDragEnd={handleComponentMove}>
        <svg
          ref={setNodeRef}
          className={styles.canvas}
          viewBox="0 0 800 600"
          onMouseMove={handleMouseMove}
        >
          <defs>
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#e0e0e0"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>

          <rect width="800" height="600" fill="url(#grid)" />

          {circuit.getComponents().map(component => (
            <DraggableComponent
              key={component.id}
              component={component}
              toolMode={toolMode}
              onPinClick={handlePinClick}
            />
          ))}

          {wiringState.status === 'in-progress' && (
            <PreviewWire
              fromComponent={wiringState.fromComponent}
              fromPin={wiringState.fromPin}
              toX={wiringState.cursorPos.x}
              toY={wiringState.cursorPos.y}
              circuit={circuit}
            />
          )}
        </svg>
      </DndContext>
    </div>
  );
};
```

- [ ] **Step 9: Run tests**

Run: `npm test -- WiringTool.test.tsx`
Expected: Tests PASS

- [ ] **Step 10: Manual test in browser**

Run: `npm run dev`
Test: Press W, click pin, verify preview wire appears

- [ ] **Step 11: Commit**

```bash
git add src/views/SchematicView/ tests/interactions/WiringTool.test.tsx
git commit -m "feat: add wiring tool with preview wire

- Toolbar component for tool mode selection (select/wire)
- Pin component with hover effects in wire mode
- PreviewWire shows dashed line following cursor
- Keyboard shortcuts: W for wire mode, V for select, Esc to cancel
- Components not draggable in wire mode

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Wiring Tool - Validation & Rendering

**Files:**
- Create: `src/utils/wiring.ts`
- Create: `tests/utils/wiring.test.ts`
- Create: `src/views/SchematicView/Wire.tsx`
- Modify: `src/views/SchematicView.tsx`
- Modify: `tests/interactions/WiringTool.test.tsx`

- [ ] **Step 1: Write test for connection validation**

```typescript
// tests/utils/wiring.test.ts
import { describe, it, expect } from 'vitest';
import { validateConnection, generateOrthogonalPath } from '@/utils/wiring';
import { Circuit } from '@/models/Circuit';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { resistorDefinition } from '@/components/definitions/Resistor';
import type { ComponentId, PinId } from '@/types/circuit';

describe('wiring utilities', () => {
  it('should reject connection from pin to itself', () => {
    const circuit = new Circuit('test');
    const comp = createComponentFromDefinition(resistorDefinition, { x: 0, y: 0 });
    const updated = circuit.addComponent(comp);

    const result = validateConnection(
      comp.id,
      comp.pins[0].id,
      comp.id,
      comp.pins[0].id,
      updated
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('itself');
  });

  it('should reject duplicate connections', () => {
    const circuit = new Circuit('test');
    const comp1 = createComponentFromDefinition(resistorDefinition, { x: 0, y: 0 });
    const comp2 = createComponentFromDefinition(resistorDefinition, { x: 100, y: 0 });

    let updated = circuit.addComponent(comp1).addComponent(comp2);

    // Add first connection
    const conn = {
      id: 'conn1' as any,
      from: { componentId: comp1.id, pinId: comp1.pins[0].id },
      to: { componentId: comp2.id, pinId: comp2.pins[0].id },
      net: 'net1' as any,
    };
    updated = updated.addConnection(conn);

    // Try to add duplicate
    const result = validateConnection(
      comp1.id,
      comp1.pins[0].id,
      comp2.id,
      comp2.pins[0].id,
      updated
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('should accept valid connections', () => {
    const circuit = new Circuit('test');
    const comp1 = createComponentFromDefinition(resistorDefinition, { x: 0, y: 0 });
    const comp2 = createComponentFromDefinition(resistorDefinition, { x: 100, y: 0 });

    const updated = circuit.addComponent(comp1).addComponent(comp2);

    const result = validateConnection(
      comp1.id,
      comp1.pins[0].id,
      comp2.id,
      comp2.pins[0].id,
      updated
    );

    expect(result.valid).toBe(true);
  });

  it('should generate orthogonal path', () => {
    const path = generateOrthogonalPath(0, 0, 100, 100);

    expect(path).toBe('M 0,0 H 50 V 100 H 100');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wiring.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create wiring utilities**

```typescript
// src/utils/wiring.ts
import type { Circuit, ComponentId, PinId, ConnectionId } from '@/types/circuit';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export const validateConnection = (
  fromCompId: ComponentId,
  fromPinId: PinId,
  toCompId: ComponentId,
  toPinId: PinId,
  circuit: Circuit
): ValidationResult => {
  // Rule 1: Can't connect pin to itself
  if (fromCompId === toCompId && fromPinId === toPinId) {
    return { valid: false, error: 'Cannot connect a pin to itself' };
  }

  // Rule 2: Can't create duplicate connection
  const duplicate = circuit.getConnections().find(conn =>
    (conn.from.componentId === fromCompId && conn.from.pinId === fromPinId &&
     conn.to.componentId === toCompId && conn.to.pinId === toPinId) ||
    (conn.from.componentId === toCompId && conn.from.pinId === toPinId &&
     conn.to.componentId === fromCompId && conn.to.pinId === fromPinId)
  );

  if (duplicate) {
    return { valid: false, error: 'Connection already exists' };
  }

  // Rule 3: Verify components exist
  const fromComp = circuit.getComponent(fromCompId);
  const toComp = circuit.getComponent(toCompId);

  if (!fromComp || !toComp) {
    return { valid: false, error: 'Component not found' };
  }

  // Rule 4: Verify pins exist
  const fromPin = fromComp.pins.find(p => p.id === fromPinId);
  const toPin = toComp.pins.find(p => p.id === toPinId);

  if (!fromPin || !toPin) {
    return { valid: false, error: 'Pin not found' };
  }

  return { valid: true };
};

export const generateOrthogonalPath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string => {
  const midX = (x1 + x2) / 2;
  return `M ${x1},${y1} H ${midX} V ${y2} H ${x2}`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wiring.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Write test for Wire component**

```typescript
// Add to tests/interactions/WiringTool.test.tsx
it('should render wire between connected components', () => {
  const { circuit } = renderWithCircuit();

  // Add two components
  const comp1 = createComponentFromDefinition(resistorDefinition, { x: 100, y: 100 });
  const comp2 = createComponentFromDefinition(resistorDefinition, { x: 300, y: 200 });

  circuit.addComponent(comp1).addComponent(comp2);

  // Add connection
  const conn = {
    id: 'conn1' as ConnectionId,
    from: { componentId: comp1.id, pinId: comp1.pins[0].id },
    to: { componentId: comp2.id, pinId: comp2.pins[0].id },
    net: 'net1' as any,
  };
  circuit.addConnection(conn);

  // Wire should be rendered
  const wire = screen.getByTestId(`wire-${conn.id}`);
  expect(wire).toBeInTheDocument();
  expect(wire.tagName).toBe('path');
});
```

- [ ] **Step 6: Create Wire component**

```typescript
// src/views/SchematicView/Wire.tsx
import { generateOrthogonalPath } from '@/utils/wiring';
import type { Connection, Circuit } from '@/types/circuit';

interface WireProps {
  connection: Connection;
  circuit: Circuit;
  isSelected: boolean;
  onClick: () => void;
}

export const Wire: React.FC<WireProps> = ({
  connection,
  circuit,
  isSelected,
  onClick,
}) => {
  const fromComp = circuit.getComponent(connection.from.componentId);
  const toComp = circuit.getComponent(connection.to.componentId);

  if (!fromComp || !toComp) return null;

  const fromPin = fromComp.pins.find(p => p.id === connection.from.pinId);
  const toPin = toComp.pins.find(p => p.id === connection.to.pinId);

  if (!fromPin || !toPin) return null;

  // Calculate absolute pin positions
  const x1 = fromComp.position.schematic.x + fromPin.position.x;
  const y1 = fromComp.position.schematic.y + fromPin.position.y;
  const x2 = toComp.position.schematic.x + toPin.position.x;
  const y2 = toComp.position.schematic.y + toPin.position.y;

  const path = generateOrthogonalPath(x1, y1, x2, y2);

  return (
    <path
      d={path}
      stroke={isSelected ? '#4CAF50' : '#333'}
      strokeWidth={isSelected ? 3 : 2}
      fill="none"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ cursor: 'pointer' }}
      data-testid={`wire-${connection.id}`}
    />
  );
};
```

- [ ] **Step 7: Update SchematicView to complete wire creation**

```typescript
// Modify src/views/SchematicView.tsx - update handlePinClick
import { nanoid } from 'nanoid';
import { validateConnection } from '@/utils/wiring';
import { Wire } from './SchematicView/Wire';
import type { ConnectionId, NetId } from '@/types/circuit';

// ... in SchematicView component

const handlePinClick = (componentId: ComponentId, pinId: PinId) => {
  if (toolMode !== 'wire') return;

  if (wiringState.status === 'idle') {
    setWiringState({
      status: 'in-progress',
      fromComponent: componentId,
      fromPin: pinId,
      cursorPos,
    });
  } else {
    // Validate connection
    const validation = validateConnection(
      wiringState.fromComponent,
      wiringState.fromPin,
      componentId,
      pinId,
      circuit
    );

    if (!validation.valid) {
      alert(validation.error); // TODO: Replace with toast notification
      setWiringState({ status: 'idle' });
      return;
    }

    // Create connection
    const connection = {
      id: nanoid() as ConnectionId,
      from: {
        componentId: wiringState.fromComponent,
        pinId: wiringState.fromPin,
      },
      to: { componentId, pinId },
      net: nanoid() as NetId,
    };

    addConnection(connection);
    setWiringState({ status: 'idle' });
  }
};

// ... in SVG render, before PreviewWire

{circuit.getConnections().map(connection => (
  <Wire
    key={connection.id}
    connection={connection}
    circuit={circuit}
    isSelected={false}
    onClick={() => {}}
  />
))}
```

- [ ] **Step 8: Add addConnection to CircuitContext (if not already there)**

Check `src/context/CircuitContext.tsx` - addConnection should exist from Phase 1. If not, add it.

- [ ] **Step 9: Run tests**

Run: `npm test -- WiringTool.test.tsx wiring.test.ts`
Expected: All tests PASS

- [ ] **Step 10: Manual test in browser**

Run: `npm run dev`
Test: Create wire between two resistor pins, verify it renders

- [ ] **Step 11: Commit**

```bash
git add src/utils/wiring.ts src/views/SchematicView/Wire.tsx src/views/SchematicView.tsx tests/
git commit -m "feat: add wire validation and rendering

- validateConnection prevents duplicate/invalid connections
- generateOrthogonalPath creates Manhattan-style routing
- Wire component renders connections between pins
- Complete wire creation on second pin click
- Alert shows validation errors (toast TBD)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Component Definition - Capacitor

**Files:**
- Create: `src/components/definitions/Capacitor.tsx`
- Create: `tests/components/definitions/Capacitor.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write tests for Capacitor**

```typescript
// tests/components/definitions/Capacitor.test.ts
import { describe, it, expect } from 'vitest';
import { capacitorDefinition } from '@/components/definitions/Capacitor';
import { render } from '@testing-library/react';

describe('Capacitor Component', () => {
  it('should have correct metadata', () => {
    expect(capacitorDefinition.type).toBe('capacitor');
    expect(capacitorDefinition.metadata.name).toBe('Capacitor');
    expect(capacitorDefinition.metadata.category).toBe('passive');
  });

  it('should have two bidirectional pins', () => {
    expect(capacitorDefinition.pins).toHaveLength(2);
    expect(capacitorDefinition.pins[0].type).toBe('bidirectional');
    expect(capacitorDefinition.pins[1].type).toBe('bidirectional');
  });

  it('should have default capacitance parameter', () => {
    expect(capacitorDefinition.defaultParameters.capacitance).toBe(0.0000001);
    expect(capacitorDefinition.defaultParameters.value).toBe('100nF');
  });

  it('schematic symbol renders without errors', () => {
    const { container } = render(
      <svg>
        {capacitorDefinition.schematic.symbol.render(capacitorDefinition.defaultParameters)}
      </svg>
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('simulates as pass-through for MVP', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0 },
      pin_1: { voltage: 0, current: 0 },
    };

    const outputs = capacitorDefinition.simulate(inputs, { capacitance: 0.0000001 });

    expect(outputs.pin_0).toEqual(inputs.pin_0);
    expect(outputs.pin_1).toEqual(inputs.pin_1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Capacitor.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create Capacitor definition**

```typescript
// src/components/definitions/Capacitor.tsx
import type { ComponentDefinition, PinId, PinStates, ComponentParameters } from '@/types/circuit';

export const capacitorDefinition: ComponentDefinition = {
  type: 'capacitor',
  metadata: {
    name: 'Capacitor',
    category: 'passive',
    description: 'Stores electrical charge, blocks DC current',
  },
  pins: [
    {
      id: 'pin_0' as PinId,
      label: '1',
      type: 'bidirectional',
      position: { x: -20, y: 0 },
    },
    {
      id: 'pin_1' as PinId,
      label: '2',
      type: 'bidirectional',
      position: { x: 20, y: 0 },
    },
  ],
  defaultParameters: {
    capacitance: 0.0000001, // 100nF in farads
    value: '100nF',
  },
  schematic: {
    symbol: {
      width: 50,
      height: 30,
      render: (params: ComponentParameters) => (
        <g>
          {/* Left plate */}
          <line x1="-10" y1="-12" x2="-10" y2="12" stroke="currentColor" strokeWidth="2" />
          {/* Right plate */}
          <line x1="10" y1="-12" x2="10" y2="12" stroke="currentColor" strokeWidth="2" />
          {/* Left lead */}
          <line x1="-10" y1="0" x2="-20" y2="0" stroke="currentColor" strokeWidth="2" />
          {/* Right lead */}
          <line x1="10" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="2" />
          {/* Value label */}
          <text x="0" y="-18" fontSize="10" textAnchor="middle" fill="currentColor">
            {params.value as string || '100nF'}
          </text>
        </g>
      ),
    },
    dimensions: { width: 50, height: 30 },
  },
  breadboard: {
    renderer: (ctx: CanvasRenderingContext2D, params: ComponentParameters) => {
      // Yellow ceramic disc capacitor
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#B8860B';
      ctx.lineWidth = 1;
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 2 },
  },
  simulate: (inputs: PinStates, params: ComponentParameters): PinStates => {
    // Simplified capacitor model for MVP
    // Acts as pass-through (real RC charging requires differential equations)
    return inputs;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Capacitor.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Register Capacitor in main.tsx**

```typescript
// Modify src/main.tsx
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { resistorDefinition } from './components/definitions/Resistor';
import { capacitorDefinition } from './components/definitions/Capacitor';

// Initialize component registry
const registry = ComponentRegistry.getInstance();
registry.register(resistorDefinition);
registry.register(capacitorDefinition);

// ... rest of file
```

- [ ] **Step 6: Manual test in browser**

Run: `npm run dev`
Test: Verify Capacitor appears in drawer, can be placed

- [ ] **Step 7: Commit**

```bash
git add src/components/definitions/Capacitor.tsx tests/components/definitions/Capacitor.test.ts src/main.tsx
git commit -m "feat: add Capacitor component definition

- Two bidirectional pins
- Schematic symbol: parallel plates with value label
- Breadboard: yellow ceramic disc
- Simplified simulation (pass-through for MVP)
- Registered in component registry

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Component Definitions - ICs (CD40106, LM741)

**Files:**
- Create: `src/components/definitions/CD40106.tsx`
- Create: `src/components/definitions/LM741.tsx`
- Create: `tests/components/definitions/CD40106.test.ts`
- Create: `tests/components/definitions/LM741.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write tests for CD40106**

```typescript
// tests/components/definitions/CD40106.test.ts
import { describe, it, expect } from 'vitest';
import { cd40106Definition } from '@/components/definitions/CD40106';
import { render } from '@testing-library/react';

describe('CD40106 Component', () => {
  it('should have correct metadata', () => {
    expect(cd40106Definition.type).toBe('cd40106');
    expect(cd40106Definition.metadata.name).toBe('CD40106');
    expect(cd40106Definition.metadata.category).toBe('ic');
  });

  it('should have 14 pins', () => {
    expect(cd40106Definition.pins).toHaveLength(14);
  });

  it('should have 6 inputs, 6 outputs, VDD, and VSS', () => {
    const inputs = cd40106Definition.pins.filter(p => p.type === 'input');
    const outputs = cd40106Definition.pins.filter(p => p.type === 'output');
    const power = cd40106Definition.pins.filter(p => p.type === 'power');
    const ground = cd40106Definition.pins.filter(p => p.type === 'ground');

    expect(inputs).toHaveLength(6);
    expect(outputs).toHaveLength(6);
    expect(power).toHaveLength(1);
    expect(ground).toHaveLength(1);
  });

  it('schematic symbol renders without errors', () => {
    const { container } = render(
      <svg>
        {cd40106Definition.schematic.symbol.render(cd40106Definition.defaultParameters)}
      </svg>
    );

    expect(container.querySelector('rect')).toBeInTheDocument();
  });

  it('simulates Schmitt trigger inversion', () => {
    const inputs = {
      pin_0: { voltage: 9, current: 0 }, // High input
      pin_12: { voltage: 9, current: 0 }, // VDD
      pin_13: { voltage: 0, current: 0 }, // VSS
    };

    const outputs = cd40106Definition.simulate(inputs, {});

    // Input high -> output low
    expect(outputs.pin_6.voltage).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CD40106.test.ts`
Expected: FAIL

- [ ] **Step 3: Create CD40106 definition**

```typescript
// src/components/definitions/CD40106.tsx
import type { ComponentDefinition, PinId, PinStates, ComponentParameters } from '@/types/circuit';

export const cd40106Definition: ComponentDefinition = {
  type: 'cd40106',
  metadata: {
    name: 'CD40106',
    category: 'ic',
    description: 'Hex Schmitt Trigger Inverter - 6 inverting gates with hysteresis',
  },
  pins: [
    // Inputs (left side)
    { id: 'pin_0' as PinId, label: '1A', type: 'input', position: { x: -30, y: -50 } },
    { id: 'pin_1' as PinId, label: '2A', type: 'input', position: { x: -30, y: -30 } },
    { id: 'pin_2' as PinId, label: '3A', type: 'input', position: { x: -30, y: -10 } },
    { id: 'pin_3' as PinId, label: '4A', type: 'input', position: { x: -30, y: 10 } },
    { id: 'pin_4' as PinId, label: '5A', type: 'input', position: { x: -30, y: 30 } },
    { id: 'pin_5' as PinId, label: '6A', type: 'input', position: { x: -30, y: 50 } },
    // Outputs (right side)
    { id: 'pin_6' as PinId, label: '1Y', type: 'output', position: { x: 30, y: -50 } },
    { id: 'pin_7' as PinId, label: '2Y', type: 'output', position: { x: 30, y: -30 } },
    { id: 'pin_8' as PinId, label: '3Y', type: 'output', position: { x: 30, y: -10 } },
    { id: 'pin_9' as PinId, label: '4Y', type: 'output', position: { x: 30, y: 10 } },
    { id: 'pin_10' as PinId, label: '5Y', type: 'output', position: { x: 30, y: 30 } },
    { id: 'pin_11' as PinId, label: '6Y', type: 'output', position: { x: 30, y: 50 } },
    // Power
    { id: 'pin_12' as PinId, label: 'VDD', type: 'power', position: { x: -10, y: -70 } },
    { id: 'pin_13' as PinId, label: 'VSS', type: 'ground', position: { x: 10, y: -70 } },
  ],
  defaultParameters: {},
  schematic: {
    symbol: {
      width: 80,
      height: 160,
      render: () => (
        <g>
          {/* IC body */}
          <rect x="-35" y="-75" width="70" height="150" fill="none" stroke="currentColor" strokeWidth="2" />
          {/* Notch at top */}
          <path d="M -10,-75 Q 0,-85 10,-75" fill="none" stroke="currentColor" strokeWidth="2" />
          {/* Label */}
          <text x="0" y="0" fontSize="12" textAnchor="middle" fill="currentColor">
            CD40106
          </text>
        </g>
      ),
    },
    dimensions: { width: 80, height: 160 },
  },
  breadboard: {
    renderer: (ctx: CanvasRenderingContext2D) => {
      // Black DIP-14 IC with white notch
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-15, -35, 30, 70);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -30, 3, 0, Math.PI * 2);
      ctx.fill();
    },
    dimensions: { rows: 7, columns: 2 },
  },
  simulate: (inputs: PinStates, params: ComponentParameters): PinStates => {
    // Simplified Schmitt trigger simulation
    const outputs: PinStates = { ...inputs };

    // Invert each input to its corresponding output
    for (let i = 0; i < 6; i++) {
      const inputKey = `pin_${i}`;
      const outputKey = `pin_${i + 6}`;

      if (inputs[inputKey] && inputs['pin_12']) {
        const inputVoltage = inputs[inputKey].voltage;
        const vdd = inputs['pin_12'].voltage || 9;
        const highThreshold = vdd * 0.6;

        // Output is inverted with hysteresis
        outputs[outputKey] = {
          voltage: inputVoltage > highThreshold ? 0 : vdd,
          current: 0,
        };
      }
    }

    return outputs;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- CD40106.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Write tests for LM741**

```typescript
// tests/components/definitions/LM741.test.ts
import { describe, it, expect } from 'vitest';
import { lm741Definition } from '@/components/definitions/LM741';
import { render } from '@testing-library/react';

describe('LM741 Component', () => {
  it('should have correct metadata', () => {
    expect(lm741Definition.type).toBe('lm741');
    expect(lm741Definition.metadata.name).toBe('LM741');
    expect(lm741Definition.metadata.category).toBe('ic');
  });

  it('should have 8 pins', () => {
    expect(lm741Definition.pins).toHaveLength(8);
  });

  it('should have inverting and non-inverting inputs', () => {
    const invertingPin = lm741Definition.pins.find(p => p.label === '-');
    const nonInvertingPin = lm741Definition.pins.find(p => p.label === '+');

    expect(invertingPin?.type).toBe('input');
    expect(nonInvertingPin?.type).toBe('input');
  });

  it('schematic symbol renders triangle', () => {
    const { container } = render(
      <svg>
        {lm741Definition.schematic.symbol.render(lm741Definition.defaultParameters)}
      </svg>
    );

    expect(container.querySelector('path')).toBeInTheDocument();
  });

  it('simulates as voltage follower', () => {
    const inputs = {
      pin_1: { voltage: 2, current: 0 }, // Inverting (-)
      pin_2: { voltage: 5, current: 0 }, // Non-inverting (+)
      pin_3: { voltage: 0, current: 0 }, // V-
      pin_6: { voltage: 9, current: 0 }, // V+
    };

    const outputs = lm741Definition.simulate(inputs, {});

    // High gain: (V+ - V-) * gain, clamped to rails
    expect(outputs.pin_5.voltage).toBeGreaterThan(0);
    expect(outputs.pin_5.voltage).toBeLessThanOrEqual(9);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- LM741.test.ts`
Expected: FAIL

- [ ] **Step 7: Create LM741 definition**

```typescript
// src/components/definitions/LM741.tsx
import type { ComponentDefinition, PinId, PinStates, ComponentParameters } from '@/types/circuit';

export const lm741Definition: ComponentDefinition = {
  type: 'lm741',
  metadata: {
    name: 'LM741',
    category: 'ic',
    description: 'General-purpose operational amplifier',
  },
  pins: [
    { id: 'pin_0' as PinId, label: 'NC', type: 'bidirectional', position: { x: -25, y: -30 } },
    { id: 'pin_1' as PinId, label: '-', type: 'input', position: { x: -25, y: -10 } }, // Inverting
    { id: 'pin_2' as PinId, label: '+', type: 'input', position: { x: -25, y: 10 } },  // Non-inverting
    { id: 'pin_3' as PinId, label: 'V-', type: 'power', position: { x: -25, y: 30 } },
    { id: 'pin_4' as PinId, label: 'NC', type: 'bidirectional', position: { x: 25, y: 30 } },
    { id: 'pin_5' as PinId, label: 'OUT', type: 'output', position: { x: 25, y: 10 } },
    { id: 'pin_6' as PinId, label: 'V+', type: 'power', position: { x: 25, y: -10 } },
    { id: 'pin_7' as PinId, label: 'NC', type: 'bidirectional', position: { x: 25, y: -30 } },
  ],
  defaultParameters: {},
  schematic: {
    symbol: {
      width: 70,
      height: 90,
      render: () => (
        <g>
          {/* Triangle op-amp symbol */}
          <path
            d="M -30,-40 L -30,40 L 30,0 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          {/* + and - labels */}
          <text x="-20" y="15" fontSize="16" fill="currentColor">+</text>
          <text x="-20" y="-5" fontSize="16" fill="currentColor">−</text>
          {/* IC label */}
          <text x="0" y="-50" fontSize="10" textAnchor="middle" fill="currentColor">
            LM741
          </text>
        </g>
      ),
    },
    dimensions: { width: 70, height: 90 },
  },
  breadboard: {
    renderer: (ctx: CanvasRenderingContext2D) => {
      // Black DIP-8 IC
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-10, -20, 20, 40);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -15, 2, 0, Math.PI * 2);
      ctx.fill();
    },
    dimensions: { rows: 4, columns: 2 },
  },
  simulate: (inputs: PinStates, params: ComponentParameters): PinStates => {
    // Simplified op-amp model (voltage follower for MVP)
    const vPlus = inputs['pin_2']?.voltage || 0;
    const vMinus = inputs['pin_1']?.voltage || 0;
    const vSupplyPos = inputs['pin_6']?.voltage || 9;
    const vSupplyNeg = inputs['pin_3']?.voltage || 0;

    // Output follows (V+ - V-) with rail limits
    let output = (vPlus - vMinus) * 100000; // High gain
    output = Math.max(vSupplyNeg, Math.min(vSupplyPos, output));

    return {
      ...inputs,
      pin_5: { voltage: output, current: 0 },
    };
  },
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- LM741.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Register both ICs in main.tsx**

```typescript
// Modify src/main.tsx
import { cd40106Definition } from './components/definitions/CD40106';
import { lm741Definition } from './components/definitions/LM741';

registry.register(cd40106Definition);
registry.register(lm741Definition);
```

- [ ] **Step 10: Manual test in browser**

Run: `npm run dev`
Test: Verify both ICs appear in drawer under "Integrated Circuits"

- [ ] **Step 11: Commit**

```bash
git add src/components/definitions/CD40106.tsx src/components/definitions/LM741.tsx tests/components/definitions/ src/main.tsx
git commit -m "feat: add CD40106 and LM741 IC definitions

CD40106:
- 14 pins (6 inputs, 6 outputs, VDD, VSS)
- Schmitt trigger inverter simulation
- DIP-14 package schematic and breadboard

LM741:
- 8 pins (inverting/non-inverting inputs, output, power)
- Simplified op-amp simulation (high gain, rail limits)
- Triangle symbol schematic, DIP-8 breadboard

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Component Definition - Potentiometer

**Files:**
- Create: `src/components/definitions/Potentiometer.tsx`
- Create: `tests/components/definitions/Potentiometer.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write tests for Potentiometer**

```typescript
// tests/components/definitions/Potentiometer.test.ts
import { describe, it, expect } from 'vitest';
import { potentiometerDefinition } from '@/components/definitions/Potentiometer';
import { render } from '@testing-library/react';

describe('Potentiometer Component', () => {
  it('should have correct metadata', () => {
    expect(potentiometerDefinition.type).toBe('potentiometer');
    expect(potentiometerDefinition.metadata.name).toBe('Potentiometer');
    expect(potentiometerDefinition.metadata.category).toBe('control');
  });

  it('should have 3 bidirectional pins', () => {
    expect(potentiometerDefinition.pins).toHaveLength(3);
    expect(potentiometerDefinition.pins.every(p => p.type === 'bidirectional')).toBe(true);
  });

  it('should have default parameters', () => {
    expect(potentiometerDefinition.defaultParameters.maxResistance).toBe(1000000);
    expect(potentiometerDefinition.defaultParameters.position).toBe(0.5);
    expect(potentiometerDefinition.defaultParameters.value).toBe('1M');
  });

  it('schematic symbol renders resistor with arrow', () => {
    const { container } = render(
      <svg>
        {potentiometerDefinition.schematic.symbol.render(potentiometerDefinition.defaultParameters)}
      </svg>
    );

    expect(container.querySelector('path')).toBeInTheDocument();
    expect(container.querySelector('line')).toBeInTheDocument();
  });

  it('simulates voltage divider', () => {
    const inputs = {
      pin_0: { voltage: 9, current: 0 }, // Terminal 1
      pin_2: { voltage: 0, current: 0 }, // Terminal 3
    };

    const outputs = potentiometerDefinition.simulate(inputs, { position: 0.5 });

    // Wiper at 50% position should output 4.5V
    expect(outputs.pin_1.voltage).toBeCloseTo(4.5, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Potentiometer.test.ts`
Expected: FAIL

- [ ] **Step 3: Create Potentiometer definition**

```typescript
// src/components/definitions/Potentiometer.tsx
import type { ComponentDefinition, PinId, PinStates, ComponentParameters } from '@/types/circuit';

export const potentiometerDefinition: ComponentDefinition = {
  type: 'potentiometer',
  metadata: {
    name: 'Potentiometer',
    category: 'control',
    description: 'Variable resistor with adjustable wiper position',
  },
  pins: [
    { id: 'pin_0' as PinId, label: '1', type: 'bidirectional', position: { x: -25, y: 0 } },
    { id: 'pin_1' as PinId, label: '2', type: 'bidirectional', position: { x: 0, y: -20 } }, // Wiper
    { id: 'pin_2' as PinId, label: '3', type: 'bidirectional', position: { x: 25, y: 0 } },
  ],
  defaultParameters: {
    maxResistance: 1000000, // 1MΩ
    position: 0.5, // 0.0 to 1.0
    value: '1M',
  },
  schematic: {
    symbol: {
      width: 60,
      height: 50,
      render: (params: ComponentParameters) => (
        <g>
          {/* Resistor body (zigzag) */}
          <path
            d="M -20,0 l 5,-5 l 5,10 l 5,-10 l 5,10 l 5,-10 l 5,10 l 5,-5"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          {/* Arrow showing wiper */}
          <line x1="0" y1="-8" x2="0" y2="-20" stroke="currentColor" strokeWidth="2" />
          <path d="M -3,-12 L 0,-8 L 3,-12" fill="currentColor" />
          {/* Value label */}
          <text x="0" y="20" fontSize="10" textAnchor="middle" fill="currentColor">
            {params.value as string}
          </text>
        </g>
      ),
    },
    dimensions: { width: 60, height: 50 },
  },
  breadboard: {
    renderer: (ctx: CanvasRenderingContext2D, params: ComponentParameters) => {
      // Blue trim pot
      ctx.fillStyle = '#4169E1';
      ctx.fillRect(-10, -10, 20, 20);
      // Adjustment screw
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    },
    dimensions: { rows: 1, columns: 3 },
  },
  simulate: (inputs: PinStates, params: ComponentParameters): PinStates => {
    // Voltage divider based on wiper position
    const pos = (params.position as number) || 0.5;
    const v1 = inputs['pin_0']?.voltage || 0;
    const v3 = inputs['pin_2']?.voltage || 0;
    const wiperVoltage = v1 + (v3 - v1) * pos;

    return {
      ...inputs,
      pin_1: { voltage: wiperVoltage, current: 0 },
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Potentiometer.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Register Potentiometer in main.tsx**

```typescript
// Modify src/main.tsx
import { potentiometerDefinition } from './components/definitions/Potentiometer';

registry.register(potentiometerDefinition);
```

- [ ] **Step 6: Manual test in browser**

Run: `npm run dev`
Test: Verify Potentiometer appears in "Controls" category

- [ ] **Step 7: Commit**

```bash
git add src/components/definitions/Potentiometer.tsx tests/components/definitions/Potentiometer.test.ts src/main.tsx
git commit -m "feat: add Potentiometer component definition

- 3 pins (terminals and wiper)
- Schematic: resistor symbol with arrow
- Breadboard: blue trim pot with adjustment screw
- Voltage divider simulation based on position parameter

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Component Definitions - Power & Ground

**Files:**
- Create: `src/components/definitions/PowerSupply.tsx`
- Create: `src/components/definitions/Ground.tsx`
- Create: `tests/components/definitions/PowerSupply.test.ts`
- Create: `tests/components/definitions/Ground.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write tests for PowerSupply**

```typescript
// tests/components/definitions/PowerSupply.test.ts
import { describe, it, expect } from 'vitest';
import { powerSupplyDefinition } from '@/components/definitions/PowerSupply';
import { render } from '@testing-library/react';

describe('PowerSupply Component', () => {
  it('should have correct metadata', () => {
    expect(powerSupplyDefinition.type).toBe('power');
    expect(powerSupplyDefinition.metadata.name).toBe('Power Supply');
    expect(powerSupplyDefinition.metadata.category).toBe('power');
  });

  it('should have 1 power pin', () => {
    expect(powerSupplyDefinition.pins).toHaveLength(1);
    expect(powerSupplyDefinition.pins[0].type).toBe('power');
  });

  it('should have default voltage', () => {
    expect(powerSupplyDefinition.defaultParameters.voltage).toBe(9);
    expect(powerSupplyDefinition.defaultParameters.value).toBe('+9V');
  });

  it('schematic symbol renders circle with +', () => {
    const { container } = render(
      <svg>
        {powerSupplyDefinition.schematic.symbol.render(powerSupplyDefinition.defaultParameters)}
      </svg>
    );

    expect(container.querySelector('circle')).toBeInTheDocument();
  });

  it('outputs fixed voltage', () => {
    const outputs = powerSupplyDefinition.simulate({}, { voltage: 9 });

    expect(outputs.pin_0.voltage).toBe(9);
    expect(outputs.pin_0.current).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PowerSupply.test.ts`
Expected: FAIL

- [ ] **Step 3: Create PowerSupply definition**

```typescript
// src/components/definitions/PowerSupply.tsx
import type { ComponentDefinition, PinId, PinStates, ComponentParameters } from '@/types/circuit';

export const powerSupplyDefinition: ComponentDefinition = {
  type: 'power',
  metadata: {
    name: 'Power Supply',
    category: 'power',
    description: 'DC voltage source (default +9V)',
  },
  pins: [
    { id: 'pin_0' as PinId, label: '+', type: 'power', position: { x: 0, y: 20 } },
  ],
  defaultParameters: {
    voltage: 9,
    value: '+9V',
  },
  schematic: {
    symbol: {
      width: 40,
      height: 50,
      render: (params: ComponentParameters) => (
        <g>
          {/* Circle with + sign */}
          <circle cx="0" cy="0" r="15" fill="none" stroke="currentColor" strokeWidth="2" />
          <text x="0" y="5" fontSize="16" textAnchor="middle" fill="currentColor">+</text>
          {/* Lead */}
          <line x1="0" y1="15" x2="0" y2="20" stroke="currentColor" strokeWidth="2" />
          {/* Voltage label */}
          <text x="0" y="-25" fontSize="10" textAnchor="middle" fill="currentColor">
            {params.value as string}
          </text>
        </g>
      ),
    },
    dimensions: { width: 40, height: 50 },
  },
  breadboard: {
    renderer: (ctx: CanvasRenderingContext2D) => {
      // Red wire/connector
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 1 },
  },
  simulate: (inputs: PinStates, params: ComponentParameters): PinStates => {
    // Fixed voltage source
    const voltage = (params.voltage as number) || 9;
    return {
      pin_0: { voltage, current: 0 },
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- PowerSupply.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Write tests for Ground**

```typescript
// tests/components/definitions/Ground.test.ts
import { describe, it, expect } from 'vitest';
import { groundDefinition } from '@/components/definitions/Ground';
import { render } from '@testing-library/react';

describe('Ground Component', () => {
  it('should have correct metadata', () => {
    expect(groundDefinition.type).toBe('ground');
    expect(groundDefinition.metadata.name).toBe('Ground');
    expect(groundDefinition.metadata.category).toBe('power');
  });

  it('should have 1 ground pin', () => {
    expect(groundDefinition.pins).toHaveLength(1);
    expect(groundDefinition.pins[0].type).toBe('ground');
  });

  it('schematic symbol renders ground lines', () => {
    const { container } = render(
      <svg>
        {groundDefinition.schematic.symbol.render(groundDefinition.defaultParameters)}
      </svg>
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('always outputs 0V', () => {
    const outputs = groundDefinition.simulate({}, {});

    expect(outputs.pin_0.voltage).toBe(0);
    expect(outputs.pin_0.current).toBe(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- Ground.test.ts`
Expected: FAIL

- [ ] **Step 7: Create Ground definition**

```typescript
// src/components/definitions/Ground.tsx
import type { ComponentDefinition, PinId, PinStates, ComponentParameters } from '@/types/circuit';

export const groundDefinition: ComponentDefinition = {
  type: 'ground',
  metadata: {
    name: 'Ground',
    category: 'power',
    description: '0V reference point',
  },
  pins: [
    { id: 'pin_0' as PinId, label: 'GND', type: 'ground', position: { x: 0, y: -20 } },
  ],
  defaultParameters: {},
  schematic: {
    symbol: {
      width: 40,
      height: 40,
      render: () => (
        <g>
          {/* Lead */}
          <line x1="0" y1="-20" x2="0" y2="0" stroke="currentColor" strokeWidth="2" />
          {/* Ground symbol */}
          <line x1="-15" y1="0" x2="15" y2="0" stroke="currentColor" strokeWidth="2" />
          <line x1="-10" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="2" />
          <line x1="-5" y1="10" x2="5" y2="10" stroke="currentColor" strokeWidth="2" />
        </g>
      ),
    },
    dimensions: { width: 40, height: 40 },
  },
  breadboard: {
    renderer: (ctx: CanvasRenderingContext2D) => {
      // Black wire/connector
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 1 },
  },
  simulate: (inputs: PinStates): PinStates => {
    // Always 0V
    return {
      pin_0: { voltage: 0, current: 0 },
    };
  },
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- Ground.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Register both components in main.tsx**

```typescript
// Modify src/main.tsx
import { powerSupplyDefinition } from './components/definitions/PowerSupply';
import { groundDefinition } from './components/definitions/Ground';

registry.register(powerSupplyDefinition);
registry.register(groundDefinition);
```

- [ ] **Step 10: Manual test in browser**

Run: `npm run dev`
Test: Verify Power and Ground appear in "Power & Ground" category

- [ ] **Step 11: Commit**

```bash
git add src/components/definitions/PowerSupply.tsx src/components/definitions/Ground.tsx tests/components/definitions/ src/main.tsx
git commit -m "feat: add Power Supply and Ground component definitions

Power Supply:
- 1 power pin
- Schematic: circle with + sign and voltage label
- Breadboard: red wire
- Fixed voltage output (default 9V)

Ground:
- 1 ground pin
- Schematic: descending horizontal lines
- Breadboard: black wire
- Always outputs 0V

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Selection, Deletion & Keyboard Shortcuts

**Files:**
- Modify: `src/context/CircuitContext.tsx`
- Modify: `src/views/SchematicView.tsx`
- Modify: `src/views/SchematicView/DraggableComponent.tsx`
- Modify: `src/views/SchematicView/Wire.tsx`
- Create: `tests/interactions/Selection.test.tsx`

- [ ] **Step 1: Write tests for selection**

```typescript
// tests/interactions/Selection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CircuitProvider } from '@/context/CircuitContext';
import { SchematicView } from '@/views/SchematicView';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { resistorDefinition } from '@/components/definitions/Resistor';

describe('Selection and Deletion', () => {
  it('should select component on click in select mode', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    // Add a component
    const comp = createComponentFromDefinition(resistorDefinition, { x: 100, y: 100 });
    // ... (component would be added through circuit context)

    // Click component
    const componentEl = screen.getByTestId(`component-${comp.id}`);
    fireEvent.click(componentEl);

    // Should be selected (visual feedback)
    expect(componentEl).toHaveAttribute('data-selected', 'true');
  });

  it('should delete selected component on Delete key', () => {
    const { circuit, removeComponent } = renderWithCircuit();

    const comp = createComponentFromDefinition(resistorDefinition, { x: 100, y: 100 });
    addComponent(comp);

    // Select component
    const componentEl = screen.getByTestId(`component-${comp.id}`);
    fireEvent.click(componentEl);

    // Press Delete
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(removeComponent).toHaveBeenCalledWith(comp.id);
  });

  it('should clear selection on Escape key', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    // Select component (simulate)
    // ...

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });

    // Selection should be cleared
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Selection.test.tsx`
Expected: FAIL - selection state doesn't exist yet

- [ ] **Step 3: Add selection state to CircuitContext**

```typescript
// Modify src/context/CircuitContext.tsx
import { useState, useCallback, useMemo, createContext, useContext } from 'react';
import { Circuit } from '@/models/Circuit';
import type { Component, Connection, ComponentId, ConnectionId } from '@/types/circuit';

interface CircuitContextType {
  circuit: Circuit;
  addComponent: (component: Component) => void;
  removeComponent: (componentId: ComponentId) => void;
  updateComponent: (componentId: ComponentId, updates: Partial<Component>) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (connectionId: ConnectionId) => void;
  loadCircuit: (circuit: Circuit) => void;
  // New selection state
  selectedComponents: ComponentId[];
  selectedConnections: ConnectionId[];
  setSelection: (components: ComponentId[], connections: ConnectionId[]) => void;
  clearSelection: () => void;
}

const CircuitContext = createContext<CircuitContextType | undefined>(undefined);

export const CircuitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [circuit, setCircuit] = useState<Circuit>(() => new Circuit('Untitled'));
  const [selectedComponents, setSelectedComponents] = useState<ComponentId[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<ConnectionId[]>([]);

  // ... existing callbacks (addComponent, removeComponent, etc.)

  const setSelection = useCallback((
    components: ComponentId[],
    connections: ConnectionId[]
  ) => {
    setSelectedComponents(components);
    setSelectedConnections(connections);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedComponents([]);
    setSelectedConnections([]);
  }, []);

  const value = useMemo<CircuitContextType>(() => ({
    circuit,
    addComponent,
    removeComponent,
    updateComponent,
    addConnection,
    removeConnection,
    loadCircuit,
    selectedComponents,
    selectedConnections,
    setSelection,
    clearSelection,
  }), [
    circuit,
    addComponent,
    removeComponent,
    updateComponent,
    addConnection,
    removeConnection,
    loadCircuit,
    selectedComponents,
    selectedConnections,
    setSelection,
    clearSelection,
  ]);

  return (
    <CircuitContext.Provider value={value}>
      {children}
    </CircuitContext.Provider>
  );
};

export const useCircuit = (): CircuitContextType => {
  const context = useContext(CircuitContext);
  if (!context) {
    throw new Error('useCircuit must be used within CircuitProvider');
  }
  return context;
};
```

- [ ] **Step 4: Add selection handling to DraggableComponent**

```typescript
// Modify src/views/SchematicView/DraggableComponent.tsx
interface DraggableComponentProps {
  component: Component;
  toolMode: ToolMode;
  onPinClick: (componentId: ComponentId, pinId: PinId) => void;
  isSelected: boolean;
  onClick: () => void;
}

export const DraggableComponent: React.FC<DraggableComponentProps> = ({
  component,
  toolMode,
  onPinClick,
  isSelected,
  onClick,
}) => {
  // ... existing draggable logic

  return (
    <g
      ref={setNodeRef}
      data-testid={`component-${component.id}`}
      data-draggable={toolMode !== 'wire'}
      data-selected={isSelected}
      style={{
        cursor: toolMode === 'wire' ? 'default' : 'move',
        opacity: isDragging ? 0.5 : 1,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (toolMode === 'select') {
          onClick();
        }
      }}
      {...(toolMode === 'wire' ? {} : { ...listeners, ...attributes })}
    >
      <g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>
        {/* Highlight if selected */}
        {isSelected && (
          <rect
            x={-definition.schematic.dimensions.width / 2 - 5}
            y={-definition.schematic.dimensions.height / 2 - 5}
            width={definition.schematic.dimensions.width + 10}
            height={definition.schematic.dimensions.height + 10}
            fill="none"
            stroke="#4CAF50"
            strokeWidth="2"
            rx="4"
          />
        )}

        {definition.schematic.symbol.render(component.parameters)}

        {component.pins.map(pin => (
          <PinComponent
            key={pin.id}
            pin={pin}
            componentId={component.id}
            toolMode={toolMode}
            onClick={() => onPinClick(component.id, pin.id)}
          />
        ))}
      </g>
    </g>
  );
};
```

- [ ] **Step 5: Add selection to Wire component**

```typescript
// Modify src/views/SchematicView/Wire.tsx - already has isSelected prop, just verify it works
```

- [ ] **Step 6: Update SchematicView with selection and keyboard handlers**

```typescript
// Modify src/views/SchematicView.tsx
export const SchematicView: React.FC = () => {
  const {
    circuit,
    updateComponent,
    addConnection,
    removeComponent,
    removeConnection,
    selectedComponents,
    selectedConnections,
    setSelection,
    clearSelection,
  } = useCircuit();

  // ... existing state

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') {
        setToolMode('wire');
      } else if (e.key === 'v' || e.key === 'V') {
        setToolMode('select');
      } else if (e.key === 'Escape') {
        setToolMode('select');
        setWiringState({ status: 'idle' });
        clearSelection();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected items
        selectedComponents.forEach(id => removeComponent(id));
        selectedConnections.forEach(id => removeConnection(id));
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedComponents, selectedConnections, removeComponent, removeConnection, clearSelection]);

  const handleComponentClick = (componentId: ComponentId) => {
    if (toolMode === 'select') {
      // Single select for MVP (multi-select with Shift+click future enhancement)
      setSelection([componentId], []);
    }
  };

  const handleWireClick = (connectionId: ConnectionId) => {
    if (toolMode === 'select') {
      setSelection([], [connectionId]);
    }
  };

  const handleCanvasClick = () => {
    // Clear selection when clicking empty canvas
    if (toolMode === 'select') {
      clearSelection();
    }
  };

  return (
    <div className={styles.container}>
      <Toolbar toolMode={toolMode} onToolModeChange={setToolMode} />

      <DndContext onDragEnd={handleComponentMove}>
        <svg
          ref={setNodeRef}
          className={styles.canvas}
          viewBox="0 0 800 600"
          onMouseMove={handleMouseMove}
          onClick={handleCanvasClick}
        >
          <defs>
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#e0e0e0"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>

          <rect width="800" height="600" fill="url(#grid)" />

          {/* Render wires */}
          {circuit.getConnections().map(connection => (
            <Wire
              key={connection.id}
              connection={connection}
              circuit={circuit}
              isSelected={selectedConnections.includes(connection.id)}
              onClick={() => handleWireClick(connection.id)}
            />
          ))}

          {/* Render components */}
          {circuit.getComponents().map(component => (
            <DraggableComponent
              key={component.id}
              component={component}
              toolMode={toolMode}
              onPinClick={handlePinClick}
              isSelected={selectedComponents.includes(component.id)}
              onClick={() => handleComponentClick(component.id)}
            />
          ))}

          {/* Preview wire */}
          {wiringState.status === 'in-progress' && (
            <PreviewWire
              fromComponent={wiringState.fromComponent}
              fromPin={wiringState.fromPin}
              toX={wiringState.cursorPos.x}
              toY={wiringState.cursorPos.y}
              circuit={circuit}
            />
          )}
        </svg>
      </DndContext>
    </div>
  );
};
```

- [ ] **Step 7: Run tests**

Run: `npm test -- Selection.test.tsx`
Expected: Tests PASS

- [ ] **Step 8: Manual test in browser**

Run: `npm run dev`
Test:
- Click component to select (green border)
- Press Delete to remove
- Click wire to select
- Press Escape to clear selection

- [ ] **Step 9: Commit**

```bash
git add src/context/CircuitContext.tsx src/views/SchematicView/ tests/interactions/Selection.test.tsx
git commit -m "feat: add selection and deletion with keyboard shortcuts

- Extended CircuitContext with selection state
- Click components/wires to select (green highlight)
- Delete key removes selected items
- Escape clears selection and cancels operations
- V for select mode, W for wire mode
- Click canvas to clear selection

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Plan Self-Review

**1. Spec Coverage Check:**

From Phase 2 spec requirements:
- ✅ Component Drawer UI → Task 1
- ✅ Drag-drop placement → Task 2
- ✅ Drag-drop movement → Task 3
- ✅ Wiring tool basic → Task 4
- ✅ Wiring validation & rendering → Task 5
- ✅ Capacitor component → Task 6
- ✅ CD40106 & LM741 ICs → Task 7
- ✅ Potentiometer component → Task 8
- ✅ Power & Ground components → Task 9
- ✅ Selection & keyboard shortcuts → Task 10

All requirements covered!

**2. Placeholder Scan:**

Scanned all tasks - no TBD, TODO, or "add appropriate" placeholders. All code blocks are complete and executable.

**3. Type Consistency:**

- `ComponentId`, `PinId`, `ConnectionId`, `NetId` - used consistently ✓
- `ToolMode: 'select' | 'wire' | 'pan'` - consistent ✓
- `WiringState` - consistent type definition ✓
- Pin naming: `pin_0`, `pin_1`, etc. - consistent ✓
- Component definition interface - consistent across all components ✓
- Method signatures match Phase 1: `addComponent`, `removeComponent`, etc. ✓

All types are consistent!

---

## Success Criteria

Phase 2 complete when:
- ✅ All 10 tasks implemented
- ✅ All tests passing (no failures)
- ✅ Zero TypeScript errors
- ✅ User can drag components from drawer to schematic
- ✅ User can move placed components
- ✅ User can create wires between pins
- ✅ All 7 components render correctly
- ✅ Invalid connections prevented
- ✅ User can select and delete items
- ✅ Keyboard shortcuts functional
- ✅ Can build simple RC circuit end-to-end

---

**End of Implementation Plan**
