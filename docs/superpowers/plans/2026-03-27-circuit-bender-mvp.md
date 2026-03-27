# Circuit Bender MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 MVP with schematic/breadboard views, component system, basic simulation, and localStorage persistence

**Architecture:** React + TypeScript with SVG schematic view, Canvas breadboard view, unified circuit model, component plugin system, and basic simulation engine

**Tech Stack:** React 18, TypeScript 5, Vite, Vitest, dnd-kit, lz-string

---

## File Structure Overview

```
circuit-bender/
├── src/
│   ├── types/
│   │   └── circuit.ts              # Core TypeScript interfaces
│   ├── models/
│   │   ├── Circuit.ts              # Circuit class with operations
│   │   ├── Component.ts            # Component model
│   │   └── Connection.ts           # Connection model
│   ├── components/
│   │   ├── registry/
│   │   │   └── ComponentRegistry.ts
│   │   ├── definitions/
│   │   │   ├── BaseComponent.ts
│   │   │   ├── Resistor.ts
│   │   │   ├── Capacitor.ts
│   │   │   ├── CD40106.ts
│   │   │   ├── LM741.ts
│   │   │   ├── Potentiometer.ts
│   │   │   ├── PowerSupply.ts
│   │   │   ├── Ground.ts
│   │   │   └── index.ts
│   │   └── ui/
│   │       ├── SchematicComponent.tsx
│   │       ├── BreadboardComponent.tsx
│   │       ├── Wire.tsx
│   │       └── ComponentCard.tsx
│   ├── views/
│   │   ├── SchematicView.tsx
│   │   ├── BreadboardView.tsx
│   │   └── ComponentDrawer.tsx
│   ├── context/
│   │   └── CircuitContext.tsx
│   ├── hooks/
│   │   ├── useCircuit.ts
│   │   └── useDragDrop.ts
│   ├── simulation/
│   │   ├── SimulationEngine.ts
│   │   └── NetAnalyzer.ts
│   ├── storage/
│   │   ├── StorageManager.ts
│   │   └── serializer.ts
│   ├── utils/
│   │   ├── ids.ts
│   │   └── grid.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── styles/
│       └── globals.css
├── tests/
│   └── (mirrors src/ structure)
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── package.json
└── .gitignore
```

---

## Task 1: Project Setup & Configuration

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `.gitignore`

- [ ] **Step 1: Initialize npm project**

Run: `npm init -y`

- [ ] **Step 2: Install dependencies**

```bash
npm install react@18 react-dom@18 \
  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities \
  lz-string nanoid
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D vite@5 @vitejs/plugin-react \
  typescript@5 @types/react @types/react-dom \
  vitest@1 @vitest/ui \
  @testing-library/react @testing-library/jest-dom \
  @types/lz-string \
  happy-dom
```

- [ ] **Step 4: Create package.json scripts**

```json
{
  "name": "circuit-bender",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "lz-string": "^1.5.0",
    "nanoid": "^5.0.4"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@types/lz-string": "^1.5.0",
    "@vitejs/plugin-react": "^4.2.1",
    "@testing-library/react": "^14.1.2",
    "@testing-library/jest-dom": "^6.1.5",
    "@vitest/ui": "^1.0.4",
    "typescript": "^5.3.3",
    "vite": "^5.0.8",
    "vitest": "^1.0.4",
    "happy-dom": "^12.10.3"
  }
}
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

- [ ] **Step 6: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'tests/', '**/*.test.ts', '**/*.test.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

- [ ] **Step 7: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 8: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 9: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Circuit Bender</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </head>
</html>
```

- [ ] **Step 10: Create .gitignore**

```
# Dependencies
node_modules/

# Build outputs
dist/
*.local

# Test coverage
coverage/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local

# Superpowers
.superpowers/
```

- [ ] **Step 11: Create test setup file**

Create: `tests/setup.ts`

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 12: Install dependencies**

Run: `npm install`
Expected: Dependencies installed successfully

- [ ] **Step 13: Verify setup**

Run: `npm run test -- --run`
Expected: No test files found (that's okay - we'll add tests next)

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json vite.config.ts vitest.config.ts tsconfig.json tsconfig.node.json index.html .gitignore tests/setup.ts
git commit -m "chore: initial project setup with Vite, React, TypeScript, and Vitest"
```

---

## Task 2: Core Type Definitions

**Files:**
- Create: `src/types/circuit.ts`
- Test: `tests/types/circuit.test.ts`

- [ ] **Step 1: Write type definitions test**

Create: `tests/types/circuit.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type {
  ComponentId,
  PinId,
  ConnectionId,
  NetId,
  Pin,
  ComponentParameters,
  ComponentState,
  Component,
  Connection,
  CircuitMetadata,
  Circuit,
} from '@/types/circuit';

describe('Circuit Types', () => {
  it('should allow creating a valid Component', () => {
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 100, y: 200 },
        breadboard: { row: 5, column: 10 },
      },
      rotation: 0,
      parameters: { resistance: 1000, value: '1k' },
      pins: [
        {
          id: 'pin1' as PinId,
          label: 'A',
          type: 'input',
          position: { x: 0, y: 0 },
        },
      ],
      state: {
        voltages: new Map(),
        currents: new Map(),
      },
    };

    expect(component.id).toBe('comp1');
    expect(component.type).toBe('resistor');
    expect(component.rotation).toBe(0);
  });

  it('should allow creating a valid Connection', () => {
    const connection: Connection = {
      id: 'conn1' as ConnectionId,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as NetId,
    };

    expect(connection.id).toBe('conn1');
    expect(connection.net).toBe('net1');
  });

  it('should allow creating a valid Circuit', () => {
    const circuit: Circuit = {
      id: 'circuit1',
      name: 'Test Circuit',
      components: new Map(),
      connections: [],
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        componentLibraryVersion: '1.0',
      },
    };

    expect(circuit.id).toBe('circuit1');
    expect(circuit.components.size).toBe(0);
    expect(circuit.connections.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/types/circuit.test.ts`
Expected: FAIL - Cannot find module '@/types/circuit'

- [ ] **Step 3: Create type definitions**

Create: `src/types/circuit.ts`

```typescript
// Branded types for type safety
export type ComponentId = string & { __brand: 'ComponentId' };
export type PinId = string & { __brand: 'PinId' };
export type ConnectionId = string & { __brand: 'ConnectionId' };
export type NetId = string & { __brand: 'NetId' };

export interface Position2D {
  x: number;
  y: number;
}

export interface BreadboardPosition {
  row: number;
  column: number;
}

export interface Pin {
  id: PinId;
  label: string;
  type: 'input' | 'output' | 'bidirectional' | 'power' | 'ground';
  position: Position2D; // Relative to component origin
}

export interface ComponentParameters {
  [key: string]: number | string | boolean;
}

export interface ComponentState {
  voltages: Map<PinId, number>;
  currents: Map<PinId, number>;
  internalState?: unknown;
}

export interface Component {
  id: ComponentId;
  type: string;
  position: {
    schematic: Position2D;
    breadboard: BreadboardPosition;
  };
  rotation: number; // 0, 90, 180, 270
  parameters: ComponentParameters;
  pins: Pin[];
  state: ComponentState;
}

export interface Connection {
  id: ConnectionId;
  from: { componentId: ComponentId; pinId: PinId };
  to: { componentId: ComponentId; pinId: PinId };
  net: NetId;
}

export interface CircuitMetadata {
  created: string;
  modified: string;
  componentLibraryVersion: string;
  thumbnail?: string;
}

export interface Circuit {
  id: string;
  name: string;
  components: Map<ComponentId, Component>;
  connections: Connection[];
  metadata: CircuitMetadata;
}

// Component Definition types for the plugin system
export interface PinDefinition {
  id: PinId;
  label: string;
  type: 'input' | 'output' | 'bidirectional' | 'power' | 'ground';
  position: Position2D;
}

export interface SVGSymbol {
  width: number;
  height: number;
  render: (params: ComponentParameters) => React.ReactNode;
}

export interface PinStates {
  [pinId: string]: {
    voltage: number;
    current: number;
  };
}

export interface ComponentDefinition {
  type: string;
  metadata: {
    name: string;
    category: 'passive' | 'active' | 'ic' | 'power' | 'control';
    description: string;
  };
  pins: PinDefinition[];
  defaultParameters: ComponentParameters;
  schematic: {
    symbol: SVGSymbol;
    dimensions: { width: number; height: number };
  };
  breadboard: {
    renderer: (
      ctx: CanvasRenderingContext2D,
      params: ComponentParameters
    ) => void;
    dimensions: { rows: number; columns: number };
  };
  simulate: (inputs: PinStates, params: ComponentParameters) => PinStates;
  controlPanel?: (component: Component) => React.ReactNode;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/types/circuit.test.ts`
Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/types/circuit.ts tests/types/circuit.test.ts
git commit -m "feat: add core circuit type definitions"
```

---

## Task 3: Utility Functions

**Files:**
- Create: `src/utils/ids.ts`
- Create: `src/utils/grid.ts`
- Test: `tests/utils/ids.test.ts`
- Test: `tests/utils/grid.test.ts`

- [ ] **Step 1: Write ID generation test**

Create: `tests/utils/ids.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  generateComponentId,
  generateConnectionId,
  generateNetId,
  generatePinId,
} from '@/utils/ids';

describe('ID Utilities', () => {
  it('should generate unique component IDs', () => {
    const id1 = generateComponentId();
    const id2 = generateComponentId();

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(id1.startsWith('comp_')).toBe(true);
  });

  it('should generate unique connection IDs', () => {
    const id1 = generateConnectionId();
    const id2 = generateConnectionId();

    expect(id1).not.toBe(id2);
    expect(id1.startsWith('conn_')).toBe(true);
  });

  it('should generate unique net IDs', () => {
    const id1 = generateNetId();
    const id2 = generateNetId();

    expect(id1).not.toBe(id2);
    expect(id1.startsWith('net_')).toBe(true);
  });

  it('should generate pin IDs with component prefix', () => {
    const id = generatePinId('comp1', 0);
    expect(id).toBe('comp1_pin_0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/utils/ids.test.ts`
Expected: FAIL - Cannot find module '@/utils/ids'

- [ ] **Step 3: Implement ID utilities**

Create: `src/utils/ids.ts`

```typescript
import { nanoid } from 'nanoid';
import type { ComponentId, ConnectionId, NetId, PinId } from '@/types/circuit';

export function generateComponentId(): ComponentId {
  return `comp_${nanoid(10)}` as ComponentId;
}

export function generateConnectionId(): ConnectionId {
  return `conn_${nanoid(10)}` as ConnectionId;
}

export function generateNetId(): NetId {
  return `net_${nanoid(10)}` as NetId;
}

export function generatePinId(componentId: string, index: number): PinId {
  return `${componentId}_pin_${index}` as PinId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/utils/ids.test.ts`
Expected: PASS

- [ ] **Step 5: Write grid utilities test**

Create: `tests/utils/grid.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { snapToGrid, gridDistance } from '@/utils/grid';

describe('Grid Utilities', () => {
  it('should snap coordinates to grid', () => {
    expect(snapToGrid(23, 10)).toBe(20);
    expect(snapToGrid(27, 10)).toBe(30);
    expect(snapToGrid(25, 10)).toBe(30);
    expect(snapToGrid(100, 20)).toBe(100);
  });

  it('should calculate grid distance', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 30, y: 40 };

    expect(gridDistance(p1, p2)).toBe(50);
  });

  it('should handle negative coordinates', () => {
    expect(snapToGrid(-23, 10)).toBe(-20);
    expect(snapToGrid(-27, 10)).toBe(-30);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/utils/grid.test.ts`
Expected: FAIL - Cannot find module '@/utils/grid'

- [ ] **Step 7: Implement grid utilities**

Create: `src/utils/grid.ts`

```typescript
import type { Position2D } from '@/types/circuit';

export const GRID_SIZE = 10; // Default grid spacing in pixels

export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPositionToGrid(
  position: Position2D,
  gridSize: number = GRID_SIZE
): Position2D {
  return {
    x: snapToGrid(position.x, gridSize),
    y: snapToGrid(position.y, gridSize),
  };
}

export function gridDistance(p1: Position2D, p2: Position2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- tests/utils/grid.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/utils/ tests/utils/
git commit -m "feat: add ID generation and grid utilities"
```

---

## Task 4: Circuit Model Class

**Files:**
- Create: `src/models/Circuit.ts`
- Test: `tests/models/Circuit.test.ts`

- [ ] **Step 1: Write Circuit class test**

Create: `tests/models/Circuit.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Circuit } from '@/models/Circuit';
import type { Component, Connection, ComponentId, PinId } from '@/types/circuit';

describe('Circuit', () => {
  let circuit: Circuit;

  beforeEach(() => {
    circuit = new Circuit('Test Circuit');
  });

  it('should create a new circuit with empty state', () => {
    expect(circuit.id).toBeTruthy();
    expect(circuit.name).toBe('Test Circuit');
    expect(circuit.getComponents()).toHaveLength(0);
    expect(circuit.getConnections()).toHaveLength(0);
  });

  it('should add a component', () => {
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const newCircuit = circuit.addComponent(component);

    expect(newCircuit.getComponents()).toHaveLength(1);
    expect(newCircuit.getComponent(component.id)).toEqual(component);
    expect(circuit.getComponents()).toHaveLength(0); // Original unchanged
  });

  it('should remove a component', () => {
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const withComponent = circuit.addComponent(component);
    const withoutComponent = withComponent.removeComponent(component.id);

    expect(withoutComponent.getComponents()).toHaveLength(0);
    expect(withComponent.getComponents()).toHaveLength(1);
  });

  it('should update a component', () => {
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: { resistance: 1000 },
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const withComponent = circuit.addComponent(component);
    const updated = withComponent.updateComponent(component.id, {
      parameters: { resistance: 2000 },
    });

    const updatedComponent = updated.getComponent(component.id);
    expect(updatedComponent?.parameters.resistance).toBe(2000);
  });

  it('should add a connection', () => {
    const connection: Connection = {
      id: 'conn1' as any,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as any,
    };

    const newCircuit = circuit.addConnection(connection);

    expect(newCircuit.getConnections()).toHaveLength(1);
    expect(circuit.getConnections()).toHaveLength(0);
  });

  it('should remove a connection', () => {
    const connection: Connection = {
      id: 'conn1' as any,
      from: { componentId: 'comp1' as ComponentId, pinId: 'pin1' as PinId },
      to: { componentId: 'comp2' as ComponentId, pinId: 'pin2' as PinId },
      net: 'net1' as any,
    };

    const withConnection = circuit.addConnection(connection);
    const withoutConnection = withConnection.removeConnection(connection.id);

    expect(withoutConnection.getConnections()).toHaveLength(0);
  });

  it('should serialize to JSON', () => {
    const json = circuit.toJSON();

    expect(json.id).toBe(circuit.id);
    expect(json.name).toBe('Test Circuit');
    expect(json.components).toEqual([]);
    expect(json.connections).toEqual([]);
    expect(json.metadata).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/models/Circuit.test.ts`
Expected: FAIL - Cannot find module '@/models/Circuit'

- [ ] **Step 3: Implement Circuit class**

Create: `src/models/Circuit.ts`

```typescript
import { nanoid } from 'nanoid';
import type {
  Circuit as CircuitType,
  Component,
  Connection,
  ComponentId,
  ConnectionId,
  CircuitMetadata,
} from '@/types/circuit';

export class Circuit {
  readonly id: string;
  readonly name: string;
  private readonly components: Map<ComponentId, Component>;
  private readonly connections: Connection[];
  readonly metadata: CircuitMetadata;

  constructor(name: string, id?: string) {
    this.id = id || nanoid();
    this.name = name;
    this.components = new Map();
    this.connections = [];
    this.metadata = {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      componentLibraryVersion: '1.0',
    };
  }

  private constructor_internal(data: CircuitType) {
    this.id = data.id;
    this.name = data.name;
    this.components = new Map(data.components);
    this.connections = [...data.connections];
    this.metadata = { ...data.metadata };
  }

  static fromJSON(data: CircuitType): Circuit {
    const circuit = Object.create(Circuit.prototype);
    Circuit.prototype.constructor_internal.call(circuit, data);
    return circuit;
  }

  // Immutable operations that return new Circuit instances
  addComponent(component: Component): Circuit {
    const newComponents = new Map(this.components);
    newComponents.set(component.id, component);

    return this.clone({
      components: newComponents,
      metadata: this.updateMetadata(),
    });
  }

  removeComponent(componentId: ComponentId): Circuit {
    const newComponents = new Map(this.components);
    newComponents.delete(componentId);

    // Remove connections involving this component
    const newConnections = this.connections.filter(
      (conn) =>
        conn.from.componentId !== componentId &&
        conn.to.componentId !== componentId
    );

    return this.clone({
      components: newComponents,
      connections: newConnections,
      metadata: this.updateMetadata(),
    });
  }

  updateComponent(
    componentId: ComponentId,
    updates: Partial<Component>
  ): Circuit {
    const component = this.components.get(componentId);
    if (!component) {
      throw new Error(`Component ${componentId} not found`);
    }

    const updated = { ...component, ...updates };
    const newComponents = new Map(this.components);
    newComponents.set(componentId, updated);

    return this.clone({
      components: newComponents,
      metadata: this.updateMetadata(),
    });
  }

  addConnection(connection: Connection): Circuit {
    const newConnections = [...this.connections, connection];

    return this.clone({
      connections: newConnections,
      metadata: this.updateMetadata(),
    });
  }

  removeConnection(connectionId: ConnectionId): Circuit {
    const newConnections = this.connections.filter(
      (conn) => conn.id !== connectionId
    );

    return this.clone({
      connections: newConnections,
      metadata: this.updateMetadata(),
    });
  }

  // Getters
  getComponent(componentId: ComponentId): Component | undefined {
    return this.components.get(componentId);
  }

  getComponents(): Component[] {
    return Array.from(this.components.values());
  }

  getConnections(): Connection[] {
    return [...this.connections];
  }

  // Serialization
  toJSON(): CircuitType {
    return {
      id: this.id,
      name: this.name,
      components: this.components,
      connections: this.connections,
      metadata: this.metadata,
    };
  }

  // Private helpers
  private clone(updates: Partial<CircuitType>): Circuit {
    return Circuit.fromJSON({
      ...this.toJSON(),
      ...updates,
    });
  }

  private updateMetadata(): CircuitMetadata {
    return {
      ...this.metadata,
      modified: new Date().toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/models/Circuit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/Circuit.ts tests/models/Circuit.test.ts
git commit -m "feat: implement immutable Circuit model class"
```

---

## Task 5: Component Registry System

**Files:**
- Create: `src/components/registry/ComponentRegistry.ts`
- Test: `tests/components/registry/ComponentRegistry.test.ts`

- [ ] **Step 1: Write ComponentRegistry test**

Create: `tests/components/registry/ComponentRegistry.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { ComponentDefinition } from '@/types/circuit';

describe('ComponentRegistry', () => {
  let registry: ComponentRegistry;

  const mockDefinition: ComponentDefinition = {
    type: 'resistor',
    metadata: {
      name: 'Resistor',
      category: 'passive',
      description: 'A basic resistor',
    },
    pins: [],
    defaultParameters: { resistance: 1000 },
    schematic: {
      symbol: {
        width: 60,
        height: 20,
        render: () => null,
      },
      dimensions: { width: 60, height: 20 },
    },
    breadboard: {
      renderer: () => {},
      dimensions: { rows: 1, columns: 4 },
    },
    simulate: () => ({}),
  };

  beforeEach(() => {
    registry = ComponentRegistry.getInstance();
    registry.clear();
  });

  it('should be a singleton', () => {
    const registry1 = ComponentRegistry.getInstance();
    const registry2 = ComponentRegistry.getInstance();

    expect(registry1).toBe(registry2);
  });

  it('should register a component definition', () => {
    registry.register(mockDefinition);

    const retrieved = registry.get('resistor');
    expect(retrieved).toEqual(mockDefinition);
  });

  it('should throw error when registering duplicate', () => {
    registry.register(mockDefinition);

    expect(() => registry.register(mockDefinition)).toThrow(
      'Component type "resistor" is already registered'
    );
  });

  it('should return undefined for non-existent component', () => {
    const retrieved = registry.get('non-existent');
    expect(retrieved).toBeUndefined();
  });

  it('should get components by category', () => {
    registry.register(mockDefinition);

    const passives = registry.getByCategory('passive');
    expect(passives).toHaveLength(1);
    expect(passives[0].type).toBe('resistor');
  });

  it('should search components by name', () => {
    registry.register(mockDefinition);

    const results = registry.search('resist');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('resistor');
  });

  it('should search case-insensitively', () => {
    registry.register(mockDefinition);

    const results = registry.search('RESIST');
    expect(results).toHaveLength(1);
  });

  it('should list all registered components', () => {
    registry.register(mockDefinition);

    const all = registry.listAll();
    expect(all).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/registry/ComponentRegistry.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement ComponentRegistry**

Create: `src/components/registry/ComponentRegistry.ts`

```typescript
import type { ComponentDefinition } from '@/types/circuit';

export class ComponentRegistry {
  private static instance: ComponentRegistry;
  private definitions: Map<string, ComponentDefinition>;

  private constructor() {
    this.definitions = new Map();
  }

  static getInstance(): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      ComponentRegistry.instance = new ComponentRegistry();
    }
    return ComponentRegistry.instance;
  }

  register(definition: ComponentDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(
        `Component type "${definition.type}" is already registered`
      );
    }
    this.definitions.set(definition.type, definition);
  }

  get(type: string): ComponentDefinition | undefined {
    return this.definitions.get(type);
  }

  getByCategory(category: string): ComponentDefinition[] {
    return Array.from(this.definitions.values()).filter(
      (def) => def.metadata.category === category
    );
  }

  search(query: string): ComponentDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.definitions.values()).filter(
      (def) =>
        def.metadata.name.toLowerCase().includes(lowerQuery) ||
        def.type.toLowerCase().includes(lowerQuery) ||
        def.metadata.description.toLowerCase().includes(lowerQuery)
    );
  }

  listAll(): ComponentDefinition[] {
    return Array.from(this.definitions.values());
  }

  clear(): void {
    this.definitions.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/registry/ComponentRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/registry/ tests/components/registry/
git commit -m "feat: implement ComponentRegistry singleton"
```

---

## Task 6: Resistor Component Definition

**Files:**
- Create: `src/components/definitions/Resistor.ts`
- Test: `tests/components/definitions/Resistor.test.ts`

- [ ] **Step 1: Write Resistor component test**

Create: `tests/components/definitions/Resistor.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { resistorDefinition } from '@/components/definitions/Resistor';

describe('Resistor Component', () => {
  it('should have correct metadata', () => {
    expect(resistorDefinition.type).toBe('resistor');
    expect(resistorDefinition.metadata.name).toBe('Resistor');
    expect(resistorDefinition.metadata.category).toBe('passive');
  });

  it('should have two pins', () => {
    expect(resistorDefinition.pins).toHaveLength(2);
    expect(resistorDefinition.pins[0].label).toBe('1');
    expect(resistorDefinition.pins[1].label).toBe('2');
  });

  it('should have default resistance parameter', () => {
    expect(resistorDefinition.defaultParameters.resistance).toBe(1000);
    expect(resistorDefinition.defaultParameters.value).toBe('1k');
  });

  it('should simulate based on Ohms law', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0 },
      pin_1: { voltage: 0, current: 0 },
    };

    const outputs = resistorDefinition.simulate(inputs, { resistance: 1000 });

    // Current = (V1 - V2) / R = (5 - 0) / 1000 = 0.005 A
    expect(outputs.pin_0.current).toBeCloseTo(-0.005, 5);
    expect(outputs.pin_1.current).toBeCloseTo(0.005, 5);
  });

  it('should handle zero resistance safely', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0 },
      pin_1: { voltage: 0, current: 0 },
    };

    const outputs = resistorDefinition.simulate(inputs, { resistance: 0 });

    // Should clamp to prevent infinite current
    expect(outputs.pin_0.current).toBeDefined();
    expect(outputs.pin_1.current).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/definitions/Resistor.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement Resistor definition**

Create: `src/components/definitions/Resistor.ts`

```typescript
import type { ComponentDefinition, PinStates } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const resistorDefinition: ComponentDefinition = {
  type: 'resistor',
  metadata: {
    name: 'Resistor',
    category: 'passive',
    description: 'Basic resistor - limits current flow',
  },
  pins: [
    {
      id: generatePinId('resistor', 0),
      label: '1',
      type: 'bidirectional',
      position: { x: -30, y: 0 },
    },
    {
      id: generatePinId('resistor', 1),
      label: '2',
      type: 'bidirectional',
      position: { x: 30, y: 0 },
    },
  ],
  defaultParameters: {
    resistance: 1000, // ohms
    value: '1k',
  },
  schematic: {
    symbol: {
      width: 60,
      height: 20,
      render: (params) => {
        return (
          <g>
            <line x1="-30" y1="0" x2="-15" y2="0" stroke="black" strokeWidth="2" />
            <path
              d="M -15 0 L -10 -5 L -5 5 L 0 -5 L 5 5 L 10 -5 L 15 0"
              stroke="black"
              strokeWidth="2"
              fill="none"
            />
            <line x1="15" y1="0" x2="30" y2="0" stroke="black" strokeWidth="2" />
            <text
              x="0"
              y="-10"
              textAnchor="middle"
              fontSize="10"
              fill="black"
            >
              {params.value}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 60, height: 20 },
  },
  breadboard: {
    renderer: (ctx, params) => {
      // Body
      ctx.fillStyle = '#d4a574';
      ctx.fillRect(-20, -4, 40, 8);

      // Color bands (simplified - just show a few bands)
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(-15, -4, 3, 8);
      ctx.fillRect(-5, -4, 3, 8);
      ctx.fillRect(5, -4, 3, 8);

      // Leads
      ctx.strokeStyle = '#c9c9c9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(-20, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(30, 0);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 4 },
  },
  simulate: (inputs, params) => {
    const pin0 = inputs.pin_0 || { voltage: 0, current: 0 };
    const pin1 = inputs.pin_1 || { voltage: 0, current: 0 };

    const resistance = Math.max(params.resistance as number, 0.001); // Prevent divide by zero
    const voltageDiff = pin0.voltage - pin1.voltage;
    const current = voltageDiff / resistance;

    // Clamp to reasonable range
    const clampedCurrent = Math.max(-10, Math.min(10, current));

    return {
      pin_0: { voltage: pin0.voltage, current: -clampedCurrent },
      pin_1: { voltage: pin1.voltage, current: clampedCurrent },
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/definitions/Resistor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/definitions/Resistor.ts tests/components/definitions/Resistor.test.ts
git commit -m "feat: implement Resistor component definition"
```

---

## Task 7: Basic React App Structure

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/globals.css`

- [ ] **Step 1: Create main entry point**

Create: `src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 2: Create basic App component**

Create: `src/App.tsx`

```typescript
import React from 'react';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Circuit Bender</h1>
      </header>
      <main className="app-main">
        <p>Circuit emulator coming soon...</p>
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 3: Create global styles**

Create: `src/styles/globals.css`

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #f5f5f5;
  color: #333;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  background-color: #2c3e50;
  color: white;
  padding: 1rem 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}
```

- [ ] **Step 4: Test app runs**

Run: `npm run dev`
Expected: App runs on http://localhost:5173 and displays "Circuit Bender" header

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/App.tsx src/styles/globals.css
git commit -m "feat: add basic React app structure"
```

---

## Task 8: Circuit Context & State Management

**Files:**
- Create: `src/context/CircuitContext.tsx`
- Create: `src/hooks/useCircuit.ts`
- Test: `tests/context/CircuitContext.test.tsx`

- [ ] **Step 1: Write CircuitContext test**

Create: `tests/context/CircuitContext.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import type { Component, ComponentId } from '@/types/circuit';

function TestComponent() {
  const { circuit, addComponent, removeComponent } = useCircuit();

  const handleAdd = () => {
    const component: Component = {
      id: 'test-comp' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 0, y: 0 },
        breadboard: { row: 0, column: 0 },
      },
      rotation: 0,
      parameters: {},
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };
    addComponent(component);
  };

  const handleRemove = () => {
    removeComponent('test-comp' as ComponentId);
  };

  return (
    <div>
      <div data-testid="count">{circuit.getComponents().length}</div>
      <button onClick={handleAdd}>Add</button>
      <button onClick={handleRemove}>Remove</button>
    </div>
  );
}

describe('CircuitContext', () => {
  it('should provide circuit state', () => {
    render(
      <CircuitProvider>
        <TestComponent />
      </CircuitProvider>
    );

    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('should add component', () => {
    render(
      <CircuitProvider>
        <TestComponent />
      </CircuitProvider>
    );

    act(() => {
      screen.getByText('Add').click();
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('should remove component', () => {
    render(
      <CircuitProvider>
        <TestComponent />
      </CircuitProvider>
    );

    act(() => {
      screen.getByText('Add').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    act(() => {
      screen.getByText('Remove').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/context/CircuitContext.test.tsx`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement CircuitContext**

Create: `src/context/CircuitContext.tsx`

```typescript
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Circuit } from '@/models/Circuit';
import type {
  Component,
  Connection,
  ComponentId,
  ConnectionId,
} from '@/types/circuit';

interface CircuitContextType {
  circuit: Circuit;
  addComponent: (component: Component) => void;
  removeComponent: (componentId: ComponentId) => void;
  updateComponent: (componentId: ComponentId, updates: Partial<Component>) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (connectionId: ConnectionId) => void;
  loadCircuit: (circuit: Circuit) => void;
}

const CircuitContext = createContext<CircuitContextType | undefined>(undefined);

export function CircuitProvider({ children }: { children: React.ReactNode }) {
  const [circuit, setCircuit] = useState<Circuit>(() => new Circuit('Untitled Circuit'));

  const addComponent = useCallback((component: Component) => {
    setCircuit((prev) => prev.addComponent(component));
  }, []);

  const removeComponent = useCallback((componentId: ComponentId) => {
    setCircuit((prev) => prev.removeComponent(componentId));
  }, []);

  const updateComponent = useCallback(
    (componentId: ComponentId, updates: Partial<Component>) => {
      setCircuit((prev) => prev.updateComponent(componentId, updates));
    },
    []
  );

  const addConnection = useCallback((connection: Connection) => {
    setCircuit((prev) => prev.addConnection(connection));
  }, []);

  const removeConnection = useCallback((connectionId: ConnectionId) => {
    setCircuit((prev) => prev.removeConnection(connectionId));
  }, []);

  const loadCircuit = useCallback((newCircuit: Circuit) => {
    setCircuit(newCircuit);
  }, []);

  const value: CircuitContextType = {
    circuit,
    addComponent,
    removeComponent,
    updateComponent,
    addConnection,
    removeConnection,
    loadCircuit,
  };

  return (
    <CircuitContext.Provider value={value}>{children}</CircuitContext.Provider>
  );
}

export function useCircuit(): CircuitContextType {
  const context = useContext(CircuitContext);
  if (!context) {
    throw new Error('useCircuit must be used within CircuitProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/context/CircuitContext.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/context/ src/hooks/ tests/context/
git commit -m "feat: implement CircuitContext for state management"
```

---

## Task 9: Storage Manager & Serialization

**Files:**
- Create: `src/storage/StorageManager.ts`
- Create: `src/storage/serializer.ts`
- Test: `tests/storage/StorageManager.test.ts`
- Test: `tests/storage/serializer.test.ts`

- [ ] **Step 1: Write serializer test**

Create: `tests/storage/serializer.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Circuit } from '@/models/Circuit';
import { serializeCircuit, deserializeCircuit } from '@/storage/serializer';
import type { Component, ComponentId } from '@/types/circuit';

describe('Circuit Serializer', () => {
  it('should serialize circuit to JSON string', () => {
    const circuit = new Circuit('Test Circuit');
    const json = serializeCircuit(circuit);

    expect(typeof json).toBe('string');
    expect(json.length).toBeGreaterThan(0);
  });

  it('should deserialize circuit from JSON string', () => {
    const original = new Circuit('Test Circuit');
    const json = serializeCircuit(original);
    const restored = deserializeCircuit(json);

    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
  });

  it('should handle circuit with components', () => {
    const circuit = new Circuit('Test');
    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: {
        schematic: { x: 100, y: 200 },
        breadboard: { row: 5, column: 10 },
      },
      rotation: 90,
      parameters: { resistance: 1000 },
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    const withComponent = circuit.addComponent(component);
    const json = serializeCircuit(withComponent);
    const restored = deserializeCircuit(json);

    expect(restored.getComponents()).toHaveLength(1);
    const restoredComp = restored.getComponent(component.id);
    expect(restoredComp?.type).toBe('resistor');
    expect(restoredComp?.rotation).toBe(90);
  });

  it('should compress data', () => {
    const circuit = new Circuit('Test');
    const json = serializeCircuit(circuit);
    const uncompressed = JSON.stringify(circuit.toJSON());

    // Compressed should be shorter (or same for small data)
    expect(json.length).toBeLessThanOrEqual(uncompressed.length * 1.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/serializer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement serializer**

Create: `src/storage/serializer.ts`

```typescript
import LZString from 'lz-string';
import { Circuit } from '@/models/Circuit';
import type { Circuit as CircuitType, Component, ComponentId } from '@/types/circuit';

interface SerializedCircuit {
  version: string;
  circuit: {
    id: string;
    name: string;
    components: SerializedComponent[];
    connections: CircuitType['connections'];
    metadata: CircuitType['metadata'];
  };
}

interface SerializedComponent extends Omit<Component, 'state'> {
  // Omit runtime state from serialization
}

export function serializeCircuit(circuit: Circuit): string {
  const data = circuit.toJSON();

  // Convert Map to array for serialization
  const components = Array.from(data.components.values()).map((comp) => ({
    ...comp,
    // Exclude runtime state
    state: undefined,
  })) as SerializedComponent[];

  const serialized: SerializedCircuit = {
    version: '1.0',
    circuit: {
      ...data,
      components,
    },
  };

  const json = JSON.stringify(serialized);
  return LZString.compressToUTF16(json);
}

export function deserializeCircuit(compressed: string): Circuit {
  const json = LZString.decompressFromUTF16(compressed);
  if (!json) {
    throw new Error('Failed to decompress circuit data');
  }

  const data: SerializedCircuit = JSON.parse(json);

  if (data.version !== '1.0') {
    throw new Error(`Unsupported circuit version: ${data.version}`);
  }

  // Reconstruct components Map and add runtime state
  const components = new Map<ComponentId, Component>();
  for (const comp of data.circuit.components) {
    components.set(comp.id, {
      ...comp,
      state: {
        voltages: new Map(),
        currents: new Map(),
      },
    });
  }

  return Circuit.fromJSON({
    ...data.circuit,
    components,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/serializer.test.ts`
Expected: PASS

- [ ] **Step 5: Write StorageManager test**

Create: `tests/storage/StorageManager.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageManager } from '@/storage/StorageManager';
import { Circuit } from '@/models/Circuit';

describe('StorageManager', () => {
  let storage: StorageManager;

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageManager();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should save circuit to localStorage', () => {
    const circuit = new Circuit('Test Circuit');
    storage.saveCircuit(circuit);

    const loaded = storage.loadCircuit(circuit.id);
    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe(circuit.id);
    expect(loaded?.name).toBe('Test Circuit');
  });

  it('should list all saved circuits', () => {
    const circuit1 = new Circuit('Circuit 1');
    const circuit2 = new Circuit('Circuit 2');

    storage.saveCircuit(circuit1);
    storage.saveCircuit(circuit2);

    const list = storage.listCircuits();
    expect(list).toHaveLength(2);
  });

  it('should delete a circuit', () => {
    const circuit = new Circuit('Test');
    storage.saveCircuit(circuit);

    storage.deleteCircuit(circuit.id);

    const loaded = storage.loadCircuit(circuit.id);
    expect(loaded).toBeNull();
  });

  it('should return null for non-existent circuit', () => {
    const loaded = storage.loadCircuit('non-existent');
    expect(loaded).toBeNull();
  });

  it('should update modified timestamp on save', () => {
    const circuit = new Circuit('Test');
    const originalModified = circuit.metadata.modified;

    // Wait a bit to ensure timestamp changes
    setTimeout(() => {
      storage.saveCircuit(circuit);
      const loaded = storage.loadCircuit(circuit.id);

      expect(loaded?.metadata.modified).not.toBe(originalModified);
    }, 10);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/storage/StorageManager.test.ts`
Expected: FAIL

- [ ] **Step 7: Implement StorageManager**

Create: `src/storage/StorageManager.ts`

```typescript
import { Circuit } from '@/models/Circuit';
import { serializeCircuit, deserializeCircuit } from './serializer';
import type { CircuitMetadata } from '@/types/circuit';

const STORAGE_KEY_PREFIX = 'circuit_bender_';
const CIRCUITS_INDEX_KEY = `${STORAGE_KEY_PREFIX}index`;

interface CircuitListItem {
  id: string;
  name: string;
  metadata: CircuitMetadata;
}

export class StorageManager {
  saveCircuit(circuit: Circuit): void {
    const key = this.getCircuitKey(circuit.id);
    const serialized = serializeCircuit(circuit);

    localStorage.setItem(key, serialized);
    this.updateIndex(circuit);
  }

  loadCircuit(id: string): Circuit | null {
    const key = this.getCircuitKey(id);
    const data = localStorage.getItem(key);

    if (!data) {
      return null;
    }

    try {
      return deserializeCircuit(data);
    } catch (error) {
      console.error('Failed to load circuit:', error);
      return null;
    }
  }

  listCircuits(): CircuitListItem[] {
    const indexData = localStorage.getItem(CIRCUITS_INDEX_KEY);
    if (!indexData) {
      return [];
    }

    try {
      return JSON.parse(indexData);
    } catch {
      return [];
    }
  }

  deleteCircuit(id: string): void {
    const key = this.getCircuitKey(id);
    localStorage.removeItem(key);
    this.removeFromIndex(id);
  }

  private getCircuitKey(id: string): string {
    return `${STORAGE_KEY_PREFIX}${id}`;
  }

  private updateIndex(circuit: Circuit): void {
    const circuits = this.listCircuits();
    const existing = circuits.findIndex((c) => c.id === circuit.id);

    const item: CircuitListItem = {
      id: circuit.id,
      name: circuit.name,
      metadata: circuit.metadata,
    };

    if (existing >= 0) {
      circuits[existing] = item;
    } else {
      circuits.push(item);
    }

    localStorage.setItem(CIRCUITS_INDEX_KEY, JSON.stringify(circuits));
  }

  private removeFromIndex(id: string): void {
    const circuits = this.listCircuits().filter((c) => c.id !== id);
    localStorage.setItem(CIRCUITS_INDEX_KEY, JSON.stringify(circuits));
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- tests/storage/StorageManager.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/storage/ tests/storage/
git commit -m "feat: implement circuit serialization and localStorage persistence"
```

---

## Task 10: Basic Schematic View Component

**Files:**
- Create: `src/views/SchematicView.tsx`
- Create: `src/views/SchematicView.module.css`
- Test: `tests/views/SchematicView.test.tsx`

- [ ] **Step 1: Write SchematicView test**

Create: `tests/views/SchematicView.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CircuitProvider } from '@/context/CircuitContext';
import SchematicView from '@/views/SchematicView';

describe('SchematicView', () => {
  it('should render SVG canvas', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    const svg = screen.getByTestId('schematic-svg');
    expect(svg).toBeInTheDocument();
    expect(svg.tagName).toBe('svg');
  });

  it('should show grid', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    const grid = screen.getByTestId('schematic-grid');
    expect(grid).toBeInTheDocument();
  });

  it('should have view controls', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    expect(screen.getByText(/zoom/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/views/SchematicView.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement SchematicView**

Create: `src/views/SchematicView.tsx`

```typescript
import React, { useState } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import styles from './SchematicView.module.css';

const GRID_SIZE = 10;
const GRID_COLOR = '#e0e0e0';

function SchematicView() {
  const { circuit } = useCircuit();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const components = circuit.getComponents();

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(Math.min(zoom + 0.1, 3))}>+</button>
        <button onClick={() => setZoom(Math.max(zoom - 0.1, 0.5))}>-</button>
      </div>

      <svg
        className={styles.canvas}
        data-testid="schematic-svg"
        viewBox={`${-pan.x} ${-pan.y} ${1000 / zoom} ${800 / zoom}`}
      >
        <defs>
          <pattern
            id="grid"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <rect width={GRID_SIZE} height={GRID_SIZE} fill="white" />
            <path
              d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
              fill="none"
              stroke={GRID_COLOR}
              strokeWidth="0.5"
            />
          </pattern>
        </defs>

        <rect
          data-testid="schematic-grid"
          x={-pan.x}
          y={-pan.y}
          width={10000}
          height={10000}
          fill="url(#grid)"
        />

        {/* Components will be rendered here */}
        {components.map((component) => (
          <g
            key={component.id}
            transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}
          >
            <circle r="5" fill="blue" />
            <text y="15" textAnchor="middle" fontSize="10">
              {component.type}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default SchematicView;
```

- [ ] **Step 4: Create styles**

Create: `src/views/SchematicView.module.css`

```css
.container {
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: #f9f9f9;
  position: relative;
}

.toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: white;
  border-bottom: 1px solid #ddd;
}

.toolbar button {
  padding: 0.25rem 0.75rem;
  border: 1px solid #ccc;
  background-color: white;
  cursor: pointer;
  border-radius: 4px;
}

.toolbar button:hover {
  background-color: #f0f0f0;
}

.canvas {
  flex: 1;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/views/SchematicView.test.tsx`
Expected: PASS

- [ ] **Step 6: Update App.tsx to use SchematicView**

Modify: `src/App.tsx`

```typescript
import React from 'react';
import { CircuitProvider } from './context/CircuitContext';
import SchematicView from './views/SchematicView';

function App() {
  return (
    <CircuitProvider>
      <div className="app">
        <header className="app-header">
          <h1>Circuit Bender</h1>
        </header>
        <main className="app-main">
          <SchematicView />
        </main>
      </div>
    </CircuitProvider>
  );
}

export default App;
```

- [ ] **Step 7: Test in browser**

Run: `npm run dev`
Expected: Schematic view displays with grid and zoom controls

- [ ] **Step 8: Commit**

```bash
git add src/views/ tests/views/ src/App.tsx
git commit -m "feat: implement basic SchematicView with grid and zoom"
```

---

## Self-Review Checklist

After completing all tasks, verify:

**Spec Coverage:**
- [ ] Core type definitions - ✓ Task 2
- [ ] Circuit model - ✓ Task 4
- [ ] Component registry - ✓ Task 5
- [ ] Component definitions - ✓ Task 6 (Resistor)
- [ ] Schematic view - ✓ Task 10
- [ ] Breadboard view - ⏭ (Remaining tasks needed)
- [ ] Storage/persistence - ✓ Task 9
- [ ] Drag-drop - ⏭ (Remaining tasks needed)
- [ ] More components - ⏭ (Remaining tasks needed)

**Type Consistency:**
- [ ] ComponentId, PinId, etc. used consistently
- [ ] Circuit.toJSON() matches serialization format
- [ ] Component.state structure consistent

**No Placeholders:**
- [ ] All code blocks complete
- [ ] All file paths absolute
- [ ] All test assertions specific

---

## Remaining Tasks Summary

This plan covers the foundation (Tasks 1-10). Additional tasks needed for MVP completion:

11. Breadboard View Component
12. Component placement with drag-drop
13. Wiring system
14. Additional component definitions (CD40106, LM741, Capacitor, etc.)
15. Component Drawer UI
16. Basic simulation engine (no audio)
17. View synchronization
18. Auto-save functionality
19. Circuit load/save UI
20. Integration testing

Each will follow the same TDD pattern established in this plan.

---

**End of Plan - Phase 1 (Foundation Tasks 1-10)**