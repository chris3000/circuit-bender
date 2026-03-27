# Circuit Bender - Phase 2: Interactive Features

**Date:** 2026-03-27
**Status:** Approved
**Version:** 2.0
**Phase:** 2 of 4

## Overview

Phase 2 adds interactive capabilities to Circuit Bender, enabling users to build circuits through drag-and-drop and wiring interactions. This phase focuses on the schematic view interactions while expanding the component library to support building the Weird Sound Generator (WSG) circuit.

**Goals:**
- Enable drag-and-drop component placement from drawer to schematic
- Implement click-drag-click wiring tool with orthogonal routing
- Expand component library to 7 components (Resistor + 6 new)
- Add selection and deletion capabilities
- Maintain immutable Circuit model and test-driven development

**Approach:**
Interaction-Driven (Approach B) - Build UI interactions first with existing Resistor component, then expand component library. This provides immediate user value and validates UX patterns before scaling.

**Out of Scope:**
- Breadboard view rendering (deferred to Phase 3)
- Audio synthesis and simulation engine (Phase 3)
- Real-time parameter controls (Phase 3)
- Undo/redo system (Phase 3)

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────┐
│  Component Drawer (Sidebar)                     │
│  ├─ SearchBar                                   │
│  ├─ CategorySection                             │
│  └─ ComponentCard (draggable via dnd-kit)       │
└─────────────────────────────────────────────────┘
           ↓ drag (DndContext - placement)
┌─────────────────────────────────────────────────┐
│  SchematicView (SVG Canvas)                     │
│  ├─ Grid Pattern (from Phase 1)                 │
│  ├─ Placed Components (draggable via dnd-kit)   │
│  ├─ Wire Components (SVG paths)                 │
│  ├─ Wiring Tool (state machine)                 │
│  ├─ Selection State                             │
│  └─ Toolbar (tool modes)                        │
└─────────────────────────────────────────────────┘
           ↓ updates
┌─────────────────────────────────────────────────┐
│  CircuitContext                                  │
│  ├─ Circuit Model (immutable, from Phase 1)     │
│  ├─ Selection State (components + connections)  │
│  └─ Event Handlers (add/remove/update)          │
└─────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**1. Dual DnD Contexts**

Use two separate dnd-kit contexts to avoid conflicts:

- **Placement Context**: Wraps ComponentDrawer + SchematicView
  - Handles drawer → canvas drops
  - Creates new Component instances
  - Snaps to grid on drop

- **Movement Context**: Nested within SchematicView
  - Handles canvas → canvas drags
  - Updates existing component positions
  - Triggers wire re-rendering

**Why:** Separate contexts allow different drop validation logic and prevent state interference. Placement creates new components, movement updates existing ones.

**2. Tool Mode State**

Introduce `toolMode: 'select' | 'wire' | 'pan'` state that determines interaction behavior:

- **Select mode** (default): Click to select, drag to move, delete key to remove
- **Wire mode**: Click pin to start wire, click second pin to complete
- **Pan mode**: Click and drag canvas (future enhancement)

**Why:** Explicit tool modes prevent interaction conflicts (e.g., accidentally creating wires while trying to select). Follows familiar pattern from tools like Figma, KiCad.

**3. Wiring State Machine**

Wire creation is a multi-step process tracked in local state:

```typescript
type WiringState =
  | { status: 'idle' }
  | {
      status: 'in-progress';
      fromComponent: ComponentId;
      fromPin: PinId;
      cursorPos: { x: number; y: number };
    };
```

Flow: idle → (pin click) → in-progress → (second pin click) → validate → create connection → idle

**Why:** State machine makes wire creation predictable and cancellable. Preview wire updates as cursor moves. Easy to extend with validation states.

**4. Orthogonal Wire Routing**

Wires route using Manhattan-style (horizontal-vertical) paths:

```
Pin A ──────┐
            │
            │
            └────── Pin B
```

Algorithm:
1. Start at pin A (x1, y1)
2. Move horizontally to midpoint: H to (x1 + x2) / 2
3. Move vertically to align with pin B: V to y2
4. Move horizontally to pin B: H to x2

Stored as SVG path: `M x1,y1 H midX V y2 H x2`

**Why:** Orthogonal routing is standard in schematic tools, easier to read than diagonal lines, and simpler to implement than A* pathfinding. Matches user expectations.

**5. Component Registry Integration**

ComponentDrawer reads directly from the existing ComponentRegistry singleton:

```typescript
const registry = ComponentRegistry.getInstance();
const allComponents = registry.listAll();
const categories = groupBy(allComponents, c => c.metadata.category);
```

**Why:** Single source of truth for component definitions. Adding a new component automatically appears in drawer. Ensures drawer and simulation use identical definitions.

**6. Selection State in Context**

Add selection tracking to CircuitContext (alongside circuit state):

```typescript
interface CircuitContextType {
  // ... existing Phase 1 methods
  selectedComponents: ComponentId[];
  selectedConnections: ConnectionId[];
  setSelection: (components: ComponentId[], connections: ConnectionId[]) => void;
  clearSelection: () => void;
}
```

**Why:** Centralized selection state accessible to all views. Enables future multi-select, copy/paste. Keeps SchematicView component clean.

## Component Drawer

### UI Structure

**Layout:**
- Fixed-width sidebar: 280px
- Positioned on left side of screen
- Collapsible via toggle button (hamburger icon)
- Scrollable when content overflows
- Z-index above canvas, below modals

**Component hierarchy:**
```tsx
<ComponentDrawer isOpen={drawerOpen}>
  <DrawerHeader>
    <SearchBar
      value={searchQuery}
      onChange={setSearchQuery}
      placeholder="Search components..."
    />
    <CollapseButton onClick={toggleDrawer} />
  </DrawerHeader>

  <DrawerContent>
    <CategorySection
      category="passive"
      title="Passive Components"
      isExpanded={expandedCategories.has('passive')}
      onToggle={toggleCategory}
    >
      <ComponentCard component={resistorDef} />
      <ComponentCard component={capacitorDef} />
    </CategorySection>

    <CategorySection category="ic" title="Integrated Circuits">
      <ComponentCard component={cd40106Def} />
      <ComponentCard component={lm741Def} />
    </CategorySection>

    <CategorySection category="control" title="Controls">
      <ComponentCard component={potentiometerDef} />
    </CategorySection>

    <CategorySection category="power" title="Power & Ground">
      <ComponentCard component={powerSupplyDef} />
      <ComponentCard component={groundDef} />
    </CategorySection>
  </DrawerContent>
</ComponentDrawer>
```

### ComponentCard

**Display:**
- Component icon: Schematic symbol SVG, scaled to 60x60px
- Component name: Bold, 14px font
- Category badge: Small pill (e.g., "Passive", "IC")
- On hover: Expand card to show description

**Draggable behavior:**
```tsx
const ComponentCard: React.FC<{ component: ComponentDefinition }> = ({ component }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `drawer-${component.type}`,
    data: { componentType: component.type }, // Pass type to drop handler
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.card}
      {...listeners}
      {...attributes}
    >
      <div className={styles.icon}>
        <svg width={60} height={60}>
          {component.schematic.symbol.render(component.defaultParameters)}
        </svg>
      </div>
      <div className={styles.name}>{component.metadata.name}</div>
      <div className={styles.badge}>{component.metadata.category}</div>
    </div>
  );
};
```

**Styling:**
- Background: Light gray (#f5f5f5)
- Border: 1px solid #ddd
- Border-radius: 8px
- Padding: 12px
- Hover: Scale up slightly (1.05x), show shadow
- Cursor: grab (grabbing when dragging)

### Search & Filter

**Search behavior:**
- Fuzzy search across: component name, type, description, category
- Case-insensitive
- Updates in real-time (no search button)
- No results state: "No components found"

**Category collapse:**
- Accordion-style: One or more categories expanded at once
- Persisted in localStorage: `circuit_bender_drawer_state`
- Default: All categories expanded

**Implementation:**
```typescript
const filterComponents = (
  components: ComponentDefinition[],
  query: string
): ComponentDefinition[] => {
  if (!query.trim()) return components;

  const lowerQuery = query.toLowerCase();
  return components.filter(c =>
    c.metadata.name.toLowerCase().includes(lowerQuery) ||
    c.type.toLowerCase().includes(lowerQuery) ||
    c.metadata.description.toLowerCase().includes(lowerQuery) ||
    c.metadata.category.toLowerCase().includes(lowerQuery)
  );
};
```

## Drag-and-Drop System

### Placement (Drawer → Canvas)

**Setup:**
```tsx
// In App.tsx
<DndContext onDragEnd={handleDrawerDrop}>
  <ComponentDrawer />
  <SchematicView />
</DndContext>
```

**Drop handler:**
```tsx
const handleDrawerDrop = (event: DragEndEvent) => {
  const { active, over, delta } = event;

  // Check if dropped on canvas
  if (over?.id !== 'schematic-canvas') return;

  // Get component type from draggable data
  const componentType = active.data.current?.componentType as string;
  const definition = componentRegistry.get(componentType);
  if (!definition) return;

  // Calculate drop position from delta
  const canvasRect = canvasRef.current!.getBoundingClientRect();
  const rawX = delta.x - canvasRect.left;
  const rawY = delta.y - canvasRect.top;

  // Snap to grid
  const position = {
    x: Math.round(rawX / GRID_SIZE) * GRID_SIZE,
    y: Math.round(rawY / GRID_SIZE) * GRID_SIZE,
  };

  // Create component instance
  const component: Component = {
    id: nanoid() as ComponentId,
    type: componentType,
    position: {
      schematic: position,
      breadboard: { row: 0, column: 0 }, // Placeholder for Phase 3
    },
    rotation: 0,
    parameters: { ...definition.defaultParameters },
    pins: definition.pins.map(p => ({ ...p })),
    state: {
      voltages: new Map(),
      currents: new Map(),
    },
  };

  // Add to circuit
  addComponent(component);
};
```

**Drag overlay:**
```tsx
<DragOverlay>
  {activeComponent && (
    <div style={{ opacity: 0.7 }}>
      <svg width={60} height={60}>
        {activeComponent.schematic.symbol.render(activeComponent.defaultParameters)}
      </svg>
    </div>
  )}
</DragOverlay>
```

**Grid snapping:**
- Grid size constant: `GRID_SIZE = 20` (pixels)
- Snap function: `snap(n) => Math.round(n / GRID_SIZE) * GRID_SIZE`
- Visual feedback: Show snapped position during drag (update overlay position)

### Movement (Canvas → Canvas)

**Setup:**
```tsx
// In SchematicView
<DndContext onDragEnd={handleComponentMove}>
  {components.map(c => (
    <DraggableComponent key={c.id} component={c} />
  ))}
</DndContext>
```

**DraggableComponent:**
```tsx
const DraggableComponent: React.FC<{ component: Component }> = ({ component }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.id,
    data: { component },
  });

  const definition = componentRegistry.get(component.type);

  // Apply transform for drag preview
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <g
      ref={setNodeRef}
      style={{ cursor: 'move', opacity: isDragging ? 0.5 : 1 }}
      {...listeners}
      {...attributes}
    >
      <g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>
        {definition?.schematic.symbol.render(component.parameters)}
      </g>
    </g>
  );
};
```

**Move handler:**
```tsx
const handleComponentMove = (event: DragEndEvent) => {
  const { active, delta } = event;
  const component = active.data.current?.component as Component;

  if (!component) return;

  // Calculate new position
  const newX = component.position.schematic.x + delta.x;
  const newY = component.position.schematic.y + delta.y;

  // Snap to grid
  const snappedPos = {
    x: Math.round(newX / GRID_SIZE) * GRID_SIZE,
    y: Math.round(newY / GRID_SIZE) * GRID_SIZE,
  };

  // Update component
  updateComponent(component.id, {
    position: {
      ...component.position,
      schematic: snappedPos,
    },
  });
};
```

**Wire updates:**
Wires automatically re-render when components move because Wire component reads component positions from props. No special handling needed.

## Wiring Tool

### Tool Mode Management

**Toolbar UI:**
```tsx
<Toolbar>
  <ToolButton
    active={toolMode === 'select'}
    onClick={() => setToolMode('select')}
    icon={<CursorIcon />}
    label="Select"
    shortcut="V"
  />
  <ToolButton
    active={toolMode === 'wire'}
    onClick={() => setToolMode('wire')}
    icon={<WireIcon />}
    label="Wire"
    shortcut="W"
  />
</Toolbar>
```

**Keyboard shortcuts:**
```tsx
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'w' || e.key === 'W') {
      setToolMode('wire');
    } else if (e.key === 'v' || e.key === 'V') {
      setToolMode('select');
    } else if (e.key === 'Escape') {
      setToolMode('select');
      setWireInProgress(null); // Cancel wire
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
```

### Wire Creation Flow

**State:**
```tsx
type WiringState =
  | { status: 'idle' }
  | {
      status: 'in-progress';
      fromComponent: ComponentId;
      fromPin: PinId;
      cursorPos: { x: number; y: number };
    };

const [wiringState, setWiringState] = useState<WiringState>({ status: 'idle' });
```

**Pin click handler:**
```tsx
const handlePinClick = (componentId: ComponentId, pinId: PinId) => {
  // Only handle in wire mode
  if (toolMode !== 'wire') return;

  if (wiringState.status === 'idle') {
    // Start new wire
    setWiringState({
      status: 'in-progress',
      fromComponent: componentId,
      fromPin: pinId,
      cursorPos: { x: 0, y: 0 },
    });
  } else if (wiringState.status === 'in-progress') {
    // Complete wire
    const toComponent = componentId;
    const toPin = pinId;

    // Validate connection
    const validation = validateConnection(
      wiringState.fromComponent,
      wiringState.fromPin,
      toComponent,
      toPin,
      circuit
    );

    if (!validation.valid) {
      showError(validation.error);
      setWiringState({ status: 'idle' });
      return;
    }

    // Create connection
    const connection: Connection = {
      id: nanoid() as ConnectionId,
      from: {
        componentId: wiringState.fromComponent,
        pinId: wiringState.fromPin
      },
      to: { componentId: toComponent, pinId: toPin },
      net: nanoid() as NetId,
    };

    addConnection(connection);
    setWiringState({ status: 'idle' });
  }
};
```

**Mouse move handler (for preview):**
```tsx
const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
  if (wiringState.status === 'in-progress') {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setWiringState({
      ...wiringState,
      cursorPos: { x, y },
    });
  }
};
```

### Connection Validation

**Validation rules:**
```tsx
interface ValidationResult {
  valid: boolean;
  error?: string;
}

const validateConnection = (
  fromCompId: ComponentId,
  fromPinId: PinId,
  toCompId: ComponentId,
  toPinId: PinId,
  circuit: Circuit
): ValidationResult => {
  // Rule 1: Can't connect pin to itself
  if (fromCompId === toCompId && fromPinId === toPinId) {
    return { valid: false, error: "Cannot connect a pin to itself" };
  }

  // Rule 2: Can't create duplicate connection
  const duplicate = circuit.getConnections().find(conn =>
    (conn.from.componentId === fromCompId && conn.from.pinId === fromPinId &&
     conn.to.componentId === toCompId && conn.to.pinId === toPinId) ||
    (conn.from.componentId === toCompId && conn.from.pinId === toPinId &&
     conn.to.componentId === fromCompId && conn.to.pinId === fromPinId)
  );

  if (duplicate) {
    return { valid: false, error: "Connection already exists" };
  }

  // Rule 3: Basic pin type compatibility (simplified for MVP)
  const fromComp = circuit.getComponent(fromCompId);
  const toComp = circuit.getComponent(toCompId);

  if (!fromComp || !toComp) {
    return { valid: false, error: "Component not found" };
  }

  const fromPin = fromComp.pins.find(p => p.id === fromPinId);
  const toPin = toComp.pins.find(p => p.id === toPinId);

  if (!fromPin || !toPin) {
    return { valid: false, error: "Pin not found" };
  }

  // Allow bidirectional to connect to anything
  // Allow input to connect to output or bidirectional
  // Allow power to connect to power
  // Allow ground to connect to ground
  // (More sophisticated validation can be added later)

  return { valid: true };
};
```

### Wire Rendering

**Wire Component:**
```tsx
interface WireProps {
  connection: Connection;
  circuit: Circuit;
  isSelected: boolean;
  onSelect: () => void;
}

const Wire: React.FC<WireProps> = ({ connection, circuit, isSelected, onSelect }) => {
  const fromComp = circuit.getComponent(connection.from.componentId);
  const toComp = circuit.getComponent(connection.to.componentId);

  if (!fromComp || !toComp) return null;

  // Get pin positions
  const fromPin = fromComp.pins.find(p => p.id === connection.from.pinId);
  const toPin = toComp.pins.find(p => p.id === connection.to.pinId);

  if (!fromPin || !toPin) return null;

  // Calculate absolute pin positions
  const x1 = fromComp.position.schematic.x + fromPin.position.x;
  const y1 = fromComp.position.schematic.y + fromPin.position.y;
  const x2 = toComp.position.schematic.x + toPin.position.x;
  const y2 = toComp.position.schematic.y + toPin.position.y;

  // Generate orthogonal path
  const path = generateOrthogonalPath(x1, y1, x2, y2);

  return (
    <path
      d={path}
      stroke={isSelected ? '#4CAF50' : '#333'}
      strokeWidth={isSelected ? 3 : 2}
      fill="none"
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    />
  );
};
```

**Orthogonal path generation:**
```tsx
const generateOrthogonalPath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string => {
  const midX = (x1 + x2) / 2;

  return `M ${x1},${y1} H ${midX} V ${y2} H ${x2}`;
};
```

**Preview wire (during creation):**
```tsx
{wiringState.status === 'in-progress' && (
  <PreviewWire
    fromComponent={wiringState.fromComponent}
    fromPin={wiringState.fromPin}
    toX={wiringState.cursorPos.x}
    toY={wiringState.cursorPos.y}
    circuit={circuit}
  />
)}

const PreviewWire: React.FC<{
  fromComponent: ComponentId;
  fromPin: PinId;
  toX: number;
  toY: number;
  circuit: Circuit;
}> = ({ fromComponent, fromPin, toX, toY, circuit }) => {
  const comp = circuit.getComponent(fromComponent);
  const pin = comp?.pins.find(p => p.id === fromPin);

  if (!comp || !pin) return null;

  const x1 = comp.position.schematic.x + pin.position.x;
  const y1 = comp.position.schematic.y + pin.position.y;

  const path = generateOrthogonalPath(x1, y1, toX, toY);

  return (
    <path
      d={path}
      stroke="#999"
      strokeWidth={2}
      strokeDasharray="4 4"
      fill="none"
      pointerEvents="none"
    />
  );
};
```

### Pin Interaction

**Pin hover states:**
```tsx
const Pin: React.FC<{
  pin: Pin;
  componentId: ComponentId;
  onClick: () => void;
  toolMode: ToolMode;
}> = ({ pin, componentId, onClick, toolMode }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Only show hover in wire mode
  const showHover = toolMode === 'wire' && isHovered;

  return (
    <circle
      cx={pin.position.x}
      cy={pin.position.y}
      r={showHover ? 6 : 4}
      fill={showHover ? '#4CAF50' : '#666'}
      stroke={showHover ? '#2E7D32' : 'none'}
      strokeWidth={2}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: toolMode === 'wire' ? 'pointer' : 'default' }}
    />
  );
};
```

## Component Definitions

### Capacitor

**Type:** Passive component
**Symbol:** Two parallel lines representing plates
**Pins:** 2 (bidirectional)

```typescript
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
      render: (params) => (
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
            {params.value || '100nF'}
          </text>
        </g>
      ),
    },
    dimensions: { width: 50, height: 30 },
  },
  breadboard: {
    renderer: (ctx, params) => {
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
  simulate: (inputs, params) => {
    // Simplified capacitor model for MVP
    // Acts as pass-through (real RC charging requires differential equations)
    return inputs;
  },
};
```

### CD40106 (Hex Schmitt Trigger Inverter)

**Type:** Integrated Circuit
**Symbol:** Six inverter gates in DIP-14 package
**Pins:** 14 (VDD, VSS, 6 inputs, 6 outputs)

```typescript
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
    renderer: (ctx) => {
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
  simulate: (inputs, params) => {
    // Simplified Schmitt trigger simulation
    // Each input inverts to its corresponding output
    const outputs: PinStates = { ...inputs };

    // Invert each input to output (A → Y)
    for (let i = 0; i < 6; i++) {
      const inputKey = `pin_${i}`;
      const outputKey = `pin_${i + 6}`;

      if (inputs[inputKey]) {
        const inputVoltage = inputs[inputKey].voltage;
        // Schmitt trigger thresholds (simplified)
        const vdd = inputs['pin_12']?.voltage || 9;
        const highThreshold = vdd * 0.6;
        const lowThreshold = vdd * 0.4;

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

### LM741 (Operational Amplifier)

**Type:** Integrated Circuit
**Symbol:** Triangle op-amp symbol in DIP-8 package
**Pins:** 8 (V+, V-, inverting input, non-inverting input, output, offset null pins)

```typescript
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
    renderer: (ctx) => {
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
  simulate: (inputs, params) => {
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

### Potentiometer

**Type:** Control component
**Symbol:** Resistor with adjustable arrow
**Pins:** 3 (terminals 1 & 3, wiper 2)

```typescript
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
      render: (params) => (
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
            {params.value}
          </text>
        </g>
      ),
    },
    dimensions: { width: 60, height: 50 },
  },
  breadboard: {
    renderer: (ctx, params) => {
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
  simulate: (inputs, params) => {
    // Voltage divider based on wiper position
    const pos = params.position as number || 0.5;
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

### Power Supply

**Type:** Power source
**Symbol:** Battery or voltage source symbol
**Pins:** 1 (positive output)

```typescript
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
      render: (params) => (
        <g>
          {/* Circle with + sign */}
          <circle cx="0" cy="0" r="15" fill="none" stroke="currentColor" strokeWidth="2" />
          <text x="0" y="5" fontSize="16" textAnchor="middle" fill="currentColor">+</text>
          {/* Lead */}
          <line x1="0" y1="15" x2="0" y2="20" stroke="currentColor" strokeWidth="2" />
          {/* Voltage label */}
          <text x="0" y="-25" fontSize="10" textAnchor="middle" fill="currentColor">
            {params.value}
          </text>
        </g>
      ),
    },
    dimensions: { width: 40, height: 50 },
  },
  breadboard: {
    renderer: (ctx) => {
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
  simulate: (inputs, params) => {
    // Fixed voltage source
    const voltage = params.voltage as number || 9;
    return {
      pin_0: { voltage, current: 0 },
    };
  },
};
```

### Ground

**Type:** Reference point
**Symbol:** Ground symbol (descending horizontal lines)
**Pins:** 1 (ground connection)

```typescript
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
    renderer: (ctx) => {
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
  simulate: (inputs) => {
    // Always 0V
    return {
      pin_0: { voltage: 0, current: 0 },
    };
  },
};
```

## State Management

### CircuitContext Extensions

**Updated interface:**
```typescript
interface CircuitContextType {
  // Existing from Phase 1
  circuit: Circuit;
  addComponent: (component: Component) => void;
  removeComponent: (componentId: ComponentId) => void;
  updateComponent: (componentId: ComponentId, updates: Partial<Component>) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (connectionId: ConnectionId) => void;
  loadCircuit: (circuit: Circuit) => void;

  // New for Phase 2
  selectedComponents: ComponentId[];
  selectedConnections: ConnectionId[];
  setSelection: (components: ComponentId[], connections: ConnectionId[]) => void;
  clearSelection: () => void;
}
```

**Implementation:**
```typescript
export const CircuitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [circuit, setCircuit] = useState<Circuit>(() => new Circuit('Untitled'));
  const [selectedComponents, setSelectedComponents] = useState<ComponentId[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<ConnectionId[]>([]);

  // ... existing Phase 1 callbacks (addComponent, removeComponent, etc.)

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
```

### Keyboard Shortcuts

**Global handlers:**
```typescript
const useKeyboardShortcuts = () => {
  const { removeComponent, removeConnection, selectedComponents, selectedConnections } = useCircuit();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected items
      if (e.key === 'Delete' || e.key === 'Backspace') {
        selectedComponents.forEach(id => removeComponent(id));
        selectedConnections.forEach(id => removeConnection(id));
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedComponents, selectedConnections, removeComponent, removeConnection, clearSelection]);
};
```

## Testing Strategy

### Component Drawer Tests

**File:** `tests/views/ComponentDrawer.test.tsx`

```typescript
describe('ComponentDrawer', () => {
  it('renders all component categories', () => {
    render(<ComponentDrawer />);
    expect(screen.getByText('Passive Components')).toBeInTheDocument();
    expect(screen.getByText('Integrated Circuits')).toBeInTheDocument();
    expect(screen.getByText('Controls')).toBeInTheDocument();
    expect(screen.getByText('Power & Ground')).toBeInTheDocument();
  });

  it('filters components based on search query', () => {
    render(<ComponentDrawer />);
    const searchInput = screen.getByPlaceholderText('Search components...');

    fireEvent.change(searchInput, { target: { value: 'resistor' } });

    expect(screen.getByText('Resistor')).toBeInTheDocument();
    expect(screen.queryByText('Capacitor')).not.toBeInTheDocument();
  });

  it('toggles category expansion', () => {
    render(<ComponentDrawer />);
    const categoryHeader = screen.getByText('Passive Components');

    fireEvent.click(categoryHeader);

    // Category should collapse (cards hidden)
    expect(screen.queryByText('Resistor')).not.toBeVisible();
  });
});
```

### Drag-and-Drop Tests

**File:** `tests/interactions/DragDrop.test.tsx`

```typescript
describe('Drag and Drop', () => {
  it('adds component to circuit when dropped on canvas', async () => {
    const { addComponent } = renderWithCircuit(<App />);

    const resistorCard = screen.getByText('Resistor').closest('[draggable]');
    const canvas = screen.getByTestId('schematic-canvas');

    // Simulate drag from drawer to canvas
    await userEvent.drag(resistorCard!, canvas);

    expect(addComponent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'resistor' })
    );
  });

  it('snaps component position to grid', async () => {
    // ... drag component to position x: 37, y: 42

    // Should snap to x: 40, y: 40 (grid size 20)
    expect(addComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { schematic: { x: 40, y: 40 } }
      })
    );
  });

  it('updates component position when dragged within canvas', async () => {
    const { updateComponent } = renderWithCircuit(<App />);

    // Add component first
    const component = createTestComponent();
    addComponent(component);

    // Drag component to new position
    const componentEl = screen.getByTestId(`component-${component.id}`);
    await userEvent.drag(componentEl, { x: 100, y: 100 });

    expect(updateComponent).toHaveBeenCalledWith(
      component.id,
      expect.objectContaining({
        position: { schematic: expect.objectContaining({ x: 100, y: 100 }) }
      })
    );
  });
});
```

### Wiring Tool Tests

**File:** `tests/interactions/WiringTool.test.tsx`

```typescript
describe('Wiring Tool', () => {
  it('starts wire on first pin click in wire mode', () => {
    const { setToolMode } = renderWithCircuit(<SchematicView />);

    setToolMode('wire');

    const pin = screen.getByTestId('pin-comp1-pin0');
    fireEvent.click(pin);

    // Preview wire should be visible
    expect(screen.getByTestId('preview-wire')).toBeInTheDocument();
  });

  it('completes wire on second pin click', () => {
    const { addConnection, setToolMode } = renderWithCircuit(<SchematicView />);

    setToolMode('wire');

    const pin1 = screen.getByTestId('pin-comp1-pin0');
    const pin2 = screen.getByTestId('pin-comp2-pin1');

    fireEvent.click(pin1);
    fireEvent.click(pin2);

    expect(addConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { componentId: 'comp1', pinId: 'pin_0' },
        to: { componentId: 'comp2', pinId: 'pin_1' },
      })
    );
  });

  it('prevents duplicate connections', () => {
    const { addConnection } = renderWithCircuit(<SchematicView />);

    // Create connection first
    const conn = createTestConnection();
    addConnection(conn);

    // Try to create same connection again
    setToolMode('wire');
    fireEvent.click(screen.getByTestId('pin-comp1-pin0'));
    fireEvent.click(screen.getByTestId('pin-comp2-pin1'));

    // Should show error, not add duplicate
    expect(screen.getByText('Connection already exists')).toBeInTheDocument();
    expect(addConnection).toHaveBeenCalledTimes(1);
  });

  it('cancels wire with Escape key', () => {
    renderWithCircuit(<SchematicView />);

    setToolMode('wire');
    fireEvent.click(screen.getByTestId('pin-comp1-pin0'));

    // Preview wire visible
    expect(screen.getByTestId('preview-wire')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    // Preview wire gone, back to select mode
    expect(screen.queryByTestId('preview-wire')).not.toBeInTheDocument();
    expect(toolMode).toBe('select');
  });
});
```

### Component Definition Tests

**Pattern for each component:**

```typescript
describe('Capacitor Component', () => {
  it('has correct metadata', () => {
    expect(capacitorDefinition.type).toBe('capacitor');
    expect(capacitorDefinition.metadata.name).toBe('Capacitor');
    expect(capacitorDefinition.metadata.category).toBe('passive');
  });

  it('has two bidirectional pins', () => {
    expect(capacitorDefinition.pins).toHaveLength(2);
    expect(capacitorDefinition.pins[0].type).toBe('bidirectional');
    expect(capacitorDefinition.pins[1].type).toBe('bidirectional');
  });

  it('has default capacitance parameter', () => {
    expect(capacitorDefinition.defaultParameters.capacitance).toBe(0.0000001);
    expect(capacitorDefinition.defaultParameters.value).toBe('100nF');
  });

  it('schematic symbol renders without errors', () => {
    const { container } = render(
      <svg>
        {capacitorDefinition.schematic.symbol.render(capacitorDefinition.defaultParameters)}
      </svg>
    );
    expect(container.querySelector('line')).toBeInTheDocument();
  });

  it('simulates correctly (pass-through for MVP)', () => {
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

Repeat similar tests for: CD40106, LM741, Potentiometer, PowerSupply, Ground.

### Integration Tests

**File:** `tests/integration/CircuitBuilding.test.tsx`

```typescript
describe('Circuit Building Integration', () => {
  it('allows building a simple RC circuit', async () => {
    render(<App />);

    // Add power supply
    await dragComponent('Power Supply', { x: 100, y: 100 });

    // Add resistor
    await dragComponent('Resistor', { x: 200, y: 100 });

    // Add capacitor
    await dragComponent('Capacitor', { x: 300, y: 100 });

    // Add ground
    await dragComponent('Ground', { x: 400, y: 100 });

    // Wire them together
    await createWire('power-pin0', 'resistor-pin0');
    await createWire('resistor-pin1', 'capacitor-pin0');
    await createWire('capacitor-pin1', 'ground-pin0');

    // Verify circuit has 4 components and 3 connections
    const circuit = getCircuit();
    expect(circuit.getComponents()).toHaveLength(4);
    expect(circuit.getConnections()).toHaveLength(3);
  });

  it('removes wires when component is deleted', () => {
    // Build circuit with 2 components and 1 wire
    const comp1 = addTestComponent();
    const comp2 = addTestComponent();
    const wire = addTestConnection(comp1.id, comp2.id);

    // Delete first component
    removeComponent(comp1.id);

    // Wire should be gone too
    expect(circuit.getConnections()).toHaveLength(0);
  });
});
```

## Implementation Order (10 Tasks)

### Task 1: Component Drawer UI
- Create `ComponentDrawer.tsx` with sidebar layout
- Create `ComponentCard.tsx` with component display
- Create `SearchBar.tsx` for filtering
- Implement category accordion logic
- Style with CSS Modules
- **Tests:** Drawer renders, search filters, categories toggle

### Task 2: Drag-and-Drop - Placement (Drawer → Canvas)
- Install and configure dnd-kit
- Make `ComponentCard` draggable
- Make `SchematicView` a droppable zone
- Implement grid snapping utility
- Handle drop event → create component
- Add `DragOverlay` for visual feedback
- **Tests:** Can drag from drawer, component added to circuit, position snapped to grid

### Task 3: Drag-and-Drop - Movement (Canvas → Canvas)
- Create `DraggableComponent` wrapper for placed components
- Nest second dnd-kit context in SchematicView
- Implement drag movement with grid snapping
- Update component position on drag end
- **Tests:** Can move components, position updates, wires follow component

### Task 4: Wiring Tool - Basic Implementation
- Add tool mode state to SchematicView
- Create `Toolbar` component with mode buttons
- Implement pin click detection in wire mode
- Create wire-in-progress state
- Render preview wire following cursor
- **Tests:** Wire mode activates, pin click starts wire, preview updates

### Task 5: Wiring Tool - Validation & Rendering
- Implement `validateConnection` function
- Create `Wire` component with orthogonal path rendering
- Complete wire on second pin click
- Add error toast for invalid connections
- Implement wire selection on click
- Handle Delete key for selected wires
- **Tests:** Valid connections created, invalid blocked, wires render correctly, can delete

### Task 6: Component Definitions - Capacitor
- Create `Capacitor.tsx` with full `ComponentDefinition`
- Implement schematic symbol (parallel plates)
- Implement breadboard renderer (yellow disc)
- Implement simplified simulate function (pass-through)
- Register with ComponentRegistry
- **Tests:** Metadata correct, pins correct, renders, simulates

### Task 7: Component Definitions - ICs (CD40106, LM741)
- Create `CD40106.tsx` with 14-pin definition
- Create `LM741.tsx` with 8-pin definition
- Implement schematic symbols (IC package + notch)
- Implement breadboard renderers (black DIP packages)
- Implement simplified simulation logic
- Register both with ComponentRegistry
- **Tests:** Both ICs have correct pins, render, simulate

### Task 8: Component Definitions - Potentiometer
- Create `Potentiometer.tsx` with 3-pin definition
- Implement schematic symbol (resistor + arrow)
- Implement breadboard renderer (blue trim pot)
- Implement voltage divider simulation
- Register with ComponentRegistry
- **Tests:** 3 pins correct, renders, voltage divider works

### Task 9: Component Definitions - Power & Ground
- Create `PowerSupply.tsx` (1 pin, fixed voltage)
- Create `Ground.tsx` (1 pin, 0V reference)
- Implement schematic symbols (circle with +, ground lines)
- Implement breadboard renderers (red/black wires)
- Implement simulation (fixed voltages)
- Register both with ComponentRegistry
- **Tests:** Power outputs voltage, ground outputs 0V

### Task 10: Selection, Deletion & Keyboard Shortcuts
- Extend CircuitContext with selection state
- Implement component click → select
- Implement wire click → select
- Add visual feedback for selected items
- Implement Delete key handler
- Add keyboard shortcuts (W for wire, V for select, Esc to cancel)
- Add accessibility (ARIA labels, focus management)
- **Tests:** Can select/deselect, Delete key works, shortcuts work

## Success Criteria

**Phase 2 Complete When:**
- ✅ User can drag components from drawer to schematic
- ✅ User can move placed components
- ✅ User can create wires between pins (click-drag-click)
- ✅ All 7 components render correctly (Resistor, Capacitor, CD40106, LM741, Potentiometer, Power, Ground)
- ✅ Invalid connections are prevented with error messages
- ✅ User can select and delete components/wires
- ✅ Keyboard shortcuts work (W, V, Delete, Esc)
- ✅ All tests passing (unit + integration)
- ✅ Zero TypeScript errors
- ✅ Can build a simple RC circuit end-to-end

**Deferred to Phase 3:**
- Breadboard view rendering
- Audio synthesis
- Real-time parameter controls
- Oscilloscope
- Undo/redo

---

**End of Phase 2 Specification**
