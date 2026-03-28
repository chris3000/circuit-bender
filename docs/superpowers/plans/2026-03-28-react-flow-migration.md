# React Flow Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom SVG views with a single React Flow canvas that handles both schematic and board modes.

**Architecture:** One `CircuitCanvas` wraps `<ReactFlow>`. Custom node components render existing SVG symbols with React Flow Handles for pins. Custom edge components render schematic (orthogonal) and board (smoothstep) wires. `useCircuitSync` hook bridges CircuitContext and React Flow state.

**Tech Stack:** React Flow v11, React 18, TypeScript, Vite

**Spec:** `docs/superpowers/specs/2026-03-28-react-flow-migration-design.md`

---

### Task 1: Install React Flow and Remove dnd-kit

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install reactflow, remove dnd-kit**

```bash
npm install reactflow
npm uninstall @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Import React Flow CSS in main entry**

Modify `src/main.tsx` — add the React Flow CSS import:

```typescript
import 'reactflow/dist/style.css';
```

Add this line after any existing CSS imports but before rendering.

- [ ] **Step 3: Verify the project still compiles (expect errors from removed dnd-kit)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: TypeScript errors referencing `@dnd-kit/core` in files we'll replace. This confirms dnd-kit is removed and React Flow is available.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/main.tsx
git commit -m "chore: install reactflow, remove dnd-kit dependencies"
```

---

### Task 2: Create the useCircuitSync Hook

This is the bridge between CircuitContext (source of truth) and React Flow's node/edge arrays.

**Files:**
- Create: `src/views/CircuitCanvas/useCircuitSync.ts`

**Reference files (read but don't modify):**
- `src/context/CircuitContext.tsx` — provides `circuit`, `addComponent`, `removeComponent`, `updateComponent`, `addConnection`, `removeConnection`, `setSelection`, `clearSelection`
- `src/types/circuit.ts` — `Component`, `Connection`, `ComponentId`, `PinId`, `ConnectionId`
- `src/utils/wiring.ts` — `validateConnection()`
- `src/utils/ids.ts` — `generateConnectionId()`, `generateNetId()`

**Important types from React Flow:**
- `Node` — `{ id, type, position, data, selected }`
- `Edge` — `{ id, type, source, target, sourceHandle, targetHandle, data, selected }`
- `NodeChange`, `EdgeChange` — change event types
- `Connection` (React Flow) — `{ source, target, sourceHandle, targetHandle }` (different from our `Connection` type)

- [ ] **Step 1: Create the hook file**

```typescript
// src/views/CircuitCanvas/useCircuitSync.ts
import { useMemo, useCallback } from 'react';
import type { Node, Edge, NodeChange, EdgeChange, Connection as RFConnection } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { validateConnection } from '@/utils/wiring';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import { getWireColor, getWireType } from './edges/wireUtils';
import type { Component, ComponentId, PinId } from '@/types/circuit';

export interface CircuitNodeData {
  component: Component;
  viewMode: 'schematic' | 'board';
  ledOn: boolean;
  onPotChange?: (componentId: string, position: number) => void;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
}

export function useCircuitSync(
  viewMode: 'schematic' | 'board',
  ledStates: Record<string, boolean>,
  onPotChange?: (componentId: string, position: number) => void,
  onAddProbe?: (componentId: string, pinId: string, label: string) => void,
) {
  const {
    circuit,
    addConnection,
    removeComponent,
    removeConnection,
    updateComponent,
    selectedComponents,
    selectedConnections,
    setSelection,
    clearSelection,
  } = useCircuit();

  const components = useMemo(() => circuit.getComponents(), [circuit]);
  const connections = useMemo(() => circuit.getConnections(), [circuit]);

  // --- Downstream: Circuit -> React Flow ---

  const nodes: Node<CircuitNodeData>[] = useMemo(() => {
    return components.map((comp) => ({
      id: comp.id,
      type: comp.type,
      position: { x: comp.position.x, y: comp.position.y },
      selected: selectedComponents.includes(comp.id),
      data: {
        component: comp,
        viewMode,
        ledOn: ledStates[comp.id] ?? false,
        onPotChange,
        onAddProbe,
      },
    }));
  }, [components, viewMode, ledStates, selectedComponents, onPotChange, onAddProbe]);

  const edges: Edge[] = useMemo(() => {
    return connections.map((conn) => {
      const fromComp = circuit.getComponent(conn.from.componentId);
      const toComp = circuit.getComponent(conn.to.componentId);
      const fromPin = fromComp?.pins.find(p => p.id === conn.from.pinId);
      const toPin = toComp?.pins.find(p => p.id === conn.to.pinId);

      return {
        id: conn.id,
        type: viewMode,
        source: conn.from.componentId,
        target: conn.to.componentId,
        sourceHandle: conn.from.pinId,
        targetHandle: conn.to.pinId,
        selected: selectedConnections.includes(conn.id),
        data: {
          wireColor: getWireColor(
            fromComp?.type || '', fromPin?.type || '',
            toComp?.type || '', toPin?.type || '',
          ),
          wireType: getWireType(
            fromComp?.type || '', fromPin?.type || '',
            toComp?.type || '', toPin?.type || '',
          ),
        },
      };
    });
  }, [connections, circuit, viewMode, selectedConnections]);

  // --- Upstream: React Flow -> Circuit ---

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        // Drag ended — persist position
        updateComponent(change.id as ComponentId, {
          position: { x: change.position.x, y: change.position.y },
        });
      }
      if (change.type === 'select') {
        // Let React Flow handle visual selection; sync to context on selection change
      }
    }
  }, [updateComponent]);

  const onEdgesChange = useCallback((_changes: EdgeChange[]) => {
    // Edge removal is handled by onEdgesDelete
  }, []);

  const onConnect = useCallback((connection: RFConnection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;

    const fromCompId = connection.source as ComponentId;
    const fromPinId = connection.sourceHandle as PinId;
    const toCompId = connection.target as ComponentId;
    const toPinId = connection.targetHandle as PinId;

    const result = validateConnection(fromCompId, fromPinId, toCompId, toPinId, circuit);
    if (!result.valid) return;

    addConnection({
      id: generateConnectionId(),
      from: { componentId: fromCompId, pinId: fromPinId },
      to: { componentId: toCompId, pinId: toPinId },
      net: generateNetId(),
    });
  }, [circuit, addConnection]);

  const isValidConnection = useCallback((connection: RFConnection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false;
    const result = validateConnection(
      connection.source as ComponentId,
      connection.sourceHandle as PinId,
      connection.target as ComponentId,
      connection.targetHandle as PinId,
      circuit,
    );
    return result.valid;
  }, [circuit]);

  const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
    const compIds = selNodes.map(n => n.id as ComponentId);
    const connIds = selEdges.map(e => e.id as ConnectionId);
    if (compIds.length === 0 && connIds.length === 0) {
      clearSelection();
    } else {
      setSelection(compIds, connIds);
    }
  }, [setSelection, clearSelection]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    for (const node of deleted) {
      removeComponent(node.id as ComponentId);
    }
  }, [removeComponent]);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const edge of deleted) {
      removeConnection(edge.id as ConnectionId);
    }
  }, [removeConnection]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    onSelectionChange,
    onNodesDelete,
    onEdgesDelete,
  };
}
```

- [ ] **Step 2: Create wireUtils (extracted from BoardWire)**

```typescript
// src/views/CircuitCanvas/edges/wireUtils.ts
export function getWireColor(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): string {
  if (
    fromComponentType === 'power' || toComponentType === 'power' ||
    fromPinType === 'power' || toPinType === 'power'
  ) {
    return '#e04040';
  }
  if (
    fromComponentType === 'ground' || toComponentType === 'ground' ||
    fromPinType === 'ground' || toPinType === 'ground'
  ) {
    return '#333';
  }
  return '#4a82c4';
}

export function getWireType(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): 'power' | 'ground' | 'signal' {
  if (
    fromComponentType === 'power' || toComponentType === 'power' ||
    fromPinType === 'power' || toPinType === 'power'
  ) {
    return 'power';
  }
  if (
    fromComponentType === 'ground' || toComponentType === 'ground' ||
    fromPinType === 'ground' || toPinType === 'ground'
  ) {
    return 'ground';
  }
  return 'signal';
}
```

- [ ] **Step 3: Verify file compiles in isolation**

```bash
npx tsc --noEmit src/views/CircuitCanvas/useCircuitSync.ts 2>&1 | head -20
```

Note: This may show errors about missing edge/node files — that's expected since we haven't created them yet. The key structural types should resolve.

- [ ] **Step 4: Commit**

```bash
git add src/views/CircuitCanvas/useCircuitSync.ts src/views/CircuitCanvas/edges/wireUtils.ts
git commit -m "feat: add useCircuitSync hook and wireUtils for React Flow bridge"
```

---

### Task 3: Create the Generic CircuitNode

The base node component that renders any component type's SVG symbol and exposes React Flow Handles for each pin.

**Files:**
- Create: `src/views/CircuitCanvas/nodes/CircuitNode.tsx`

**Reference files (read but don't modify):**
- `src/components/registry/ComponentRegistry.ts` — `ComponentRegistry.getInstance().get(type)`
- `src/components/definitions/Resistor.tsx` — example of `definition.schematic.symbol.render(params)` and pin positions
- `src/types/circuit.ts` — `Pin`, `ComponentDefinition`, `SVGSymbol`

- [ ] **Step 1: Create CircuitNode**

```typescript
// src/views/CircuitCanvas/nodes/CircuitNode.tsx
import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(
  pinX: number,
  pinY: number,
  symbolWidth: number,
  symbolHeight: number,
): React.CSSProperties {
  // Pin positions are relative to component center.
  // Convert to CSS position relative to the node div (top-left origin).
  return {
    position: 'absolute',
    left: `${pinX + symbolWidth / 2}px`,
    top: `${pinY + symbolHeight / 2}px`,
    transform: 'translate(-50%, -50%)',
  };
}

function getHandlePosition(pinX: number, symbolWidth: number): Position {
  // Place handle on left or right side based on pin position
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const CircuitNode = memo(function CircuitNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;

  const definition = useMemo(
    () => ComponentRegistry.getInstance().get(component.type),
    [component.type],
  );

  if (!definition) return null;

  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div
      style={{
        width: dims.width,
        height: dims.height,
        position: 'relative',
        cursor: 'grab',
      }}
    >
      {/* SVG symbol */}
      <svg
        width={dims.width}
        height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {viewMode === 'schematic' && selected && (
          <rect
            x={-dims.width / 2 - 3}
            y={-dims.height / 2 - 3}
            width={dims.width + 6}
            height={dims.height + 6}
            fill="none"
            stroke="#FF2D55"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />
        )}
        {viewMode === 'board' && selected && (
          <rect
            x={-dims.width / 2 - 5}
            y={-dims.height / 2 - 5}
            width={dims.width + 10}
            height={dims.height + 10}
            fill="none"
            stroke="#FF2D55"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />
        )}
        {symbol.render(component.parameters)}
      </svg>

      {/* React Flow Handles for each pin */}
      {component.pins.map((pin) => (
        <Handle
          key={pin.id}
          id={pin.id}
          type="source"
          position={getHandlePosition(pin.position.x, dims.width)}
          isConnectable={true}
          style={{
            ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height),
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: viewMode === 'schematic' ? '#999' : '#c4a24e',
            border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030',
          }}
        />
      ))}
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/views/CircuitCanvas/nodes/CircuitNode.tsx
git commit -m "feat: add generic CircuitNode for React Flow"
```

---

### Task 4: Create Specialized Node Types

LED, Potentiometer, and Editable (resistor/capacitor) nodes extend the base CircuitNode with specialized behavior.

**Files:**
- Create: `src/views/CircuitCanvas/nodes/LEDNode.tsx`
- Create: `src/views/CircuitCanvas/nodes/PotentiometerNode.tsx`
- Create: `src/views/CircuitCanvas/nodes/EditableNode.tsx`
- Create: `src/views/CircuitCanvas/nodes/index.ts`

**Reference files:**
- `src/views/CircuitCanvas/nodes/CircuitNode.tsx` — base node (just created)
- `src/views/BoardView/BoardComponent.tsx:72-109` — potentiometer dial drag logic
- `src/views/SchematicView/DraggableComponent.tsx:148-165` — LED glow rendering
- `src/views/SchematicView.tsx:268-279` — double-click parameter editing

- [ ] **Step 1: Create LEDNode**

```typescript
// src/views/CircuitCanvas/nodes/LEDNode.tsx
import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(
  pinX: number,
  pinY: number,
  symbolWidth: number,
  symbolHeight: number,
): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${pinX + symbolWidth / 2}px`,
    top: `${pinY + symbolHeight / 2}px`,
    transform: 'translate(-50%, -50%)',
  };
}

function getHandlePosition(pinX: number): Position {
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const LEDNode = memo(function LEDNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode, ledOn } = data;

  const definition = useMemo(
    () => ComponentRegistry.getInstance().get(component.type),
    [component.type],
  );

  if (!definition) return null;

  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'grab' }}>
      <svg
        width={dims.width}
        height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <filter id="ledGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {selected && (
          <rect
            x={-dims.width / 2 - 3}
            y={-dims.height / 2 - 3}
            width={dims.width + 6}
            height={dims.height + 6}
            fill="none"
            stroke="#FF2D55"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />
        )}
        {ledOn && (
          <>
            <circle cx="0" cy="0" r="20" fill="#FF2D55" opacity="0.15" filter="url(#ledGlow)" />
            <circle cx="0" cy="0" r="12" fill="#FF2D55" opacity="0.3" />
          </>
        )}
        {symbol.render(component.parameters)}
      </svg>

      {component.pins.map((pin) => (
        <Handle
          key={pin.id}
          id={pin.id}
          type="source"
          position={getHandlePosition(pin.position.x)}
          isConnectable={true}
          style={{
            ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height),
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: viewMode === 'schematic' ? '#999' : '#c4a24e',
            border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030',
          }}
        />
      ))}
    </div>
  );
});
```

- [ ] **Step 2: Create PotentiometerNode**

```typescript
// src/views/CircuitCanvas/nodes/PotentiometerNode.tsx
import { memo, useMemo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(
  pinX: number,
  pinY: number,
  symbolWidth: number,
  symbolHeight: number,
): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${pinX + symbolWidth / 2}px`,
    top: `${pinY + symbolHeight / 2}px`,
    transform: 'translate(-50%, -50%)',
  };
}

function getHandlePosition(pinX: number): Position {
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const PotentiometerNode = memo(function PotentiometerNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode, onPotChange } = data;
  const { updateComponent } = useCircuit();

  const definition = useMemo(
    () => ComponentRegistry.getInstance().get(component.type),
    [component.type],
  );

  const handleDialDrag = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - centerX;
        const dy = moveEvent.clientY - centerY;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        let normalized = (angle + 135) / 270;
        normalized = Math.max(0, Math.min(1, normalized));
        updateComponent(component.id, {
          parameters: { ...component.parameters, position: normalized },
        });
        if (onPotChange) onPotChange(component.id, normalized);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [component, updateComponent, onPotChange],
  );

  if (!definition) return null;

  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'grab' }}>
      <svg
        width={dims.width}
        height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {selected && (
          <rect
            x={-dims.width / 2 - 3}
            y={-dims.height / 2 - 3}
            width={dims.width + 6}
            height={dims.height + 6}
            fill="none"
            stroke="#FF2D55"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />
        )}
        {symbol.render(component.parameters)}
      </svg>

      {/* Invisible drag target for the dial */}
      {viewMode === 'board' && (
        <div
          onPointerDown={handleDialDrag}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 48,
            height: 48,
            borderRadius: '50%',
            cursor: 'grab',
          }}
        />
      )}

      {component.pins.map((pin) => (
        <Handle
          key={pin.id}
          id={pin.id}
          type="source"
          position={getHandlePosition(pin.position.x)}
          isConnectable={true}
          style={{
            ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height),
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: viewMode === 'schematic' ? '#999' : '#c4a24e',
            border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030',
          }}
        />
      ))}
    </div>
  );
});
```

- [ ] **Step 3: Create EditableNode**

```typescript
// src/views/CircuitCanvas/nodes/EditableNode.tsx
import { memo, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import { parseValue, formatValue } from '@/utils/parameterParser';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(
  pinX: number,
  pinY: number,
  symbolWidth: number,
  symbolHeight: number,
): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${pinX + symbolWidth / 2}px`,
    top: `${pinY + symbolHeight / 2}px`,
    transform: 'translate(-50%, -50%)',
  };
}

function getHandlePosition(pinX: number): Position {
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const EditableNode = memo(function EditableNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const { updateComponent } = useCircuit();
  const [editing, setEditing] = useState(false);

  const definition = useMemo(
    () => ComponentRegistry.getInstance().get(component.type),
    [component.type],
  );

  const paramKey = component.type === 'resistor' ? 'resistance' : 'capacitance';

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  }, []);

  const handleConfirm = useCallback((raw: string) => {
    const parsed = parseValue(raw);
    if (!isNaN(parsed)) {
      const display = formatValue(parsed, paramKey as 'resistance' | 'capacitance');
      updateComponent(component.id, {
        parameters: { ...component.parameters, [paramKey]: parsed, value: display },
      });
    }
    setEditing(false);
  }, [component, paramKey, updateComponent]);

  const handleCancel = useCallback(() => setEditing(false), []);

  if (!definition) return null;

  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div
      style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'grab' }}
      onDoubleClick={handleDoubleClick}
    >
      <svg
        width={dims.width}
        height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {selected && (
          <rect
            x={-dims.width / 2 - 3}
            y={-dims.height / 2 - 3}
            width={dims.width + 6}
            height={dims.height + 6}
            fill="none"
            stroke="#FF2D55"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />
        )}
        {symbol.render(component.parameters)}
      </svg>

      {editing && (
        <input
          autoFocus
          defaultValue={String(component.parameters.value || '')}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') handleConfirm((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') handleCancel();
          }}
          onBlur={handleCancel}
          style={{
            position: 'absolute',
            top: -30,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 80,
            height: 24,
            border: '1px solid #FF2D55',
            borderRadius: 3,
            padding: '2px 4px',
            fontSize: 12,
            textAlign: 'center',
            outline: 'none',
            background: 'white',
            zIndex: 10,
          }}
        />
      )}

      {component.pins.map((pin) => (
        <Handle
          key={pin.id}
          id={pin.id}
          type="source"
          position={getHandlePosition(pin.position.x)}
          isConnectable={true}
          style={{
            ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height),
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: viewMode === 'schematic' ? '#999' : '#c4a24e',
            border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030',
          }}
        />
      ))}
    </div>
  );
});
```

- [ ] **Step 4: Create node types index**

```typescript
// src/views/CircuitCanvas/nodes/index.ts
import type { NodeTypes } from 'reactflow';
import { CircuitNode } from './CircuitNode';
import { LEDNode } from './LEDNode';
import { PotentiometerNode } from './PotentiometerNode';
import { EditableNode } from './EditableNode';

export const nodeTypes: NodeTypes = {
  resistor: EditableNode,
  capacitor: EditableNode,
  potentiometer: PotentiometerNode,
  led: LEDNode,
  cd40106: CircuitNode,
  lm741: CircuitNode,
  power: CircuitNode,
  ground: CircuitNode,
  'audio-output': CircuitNode,
  '1n914': CircuitNode,
  '2n3904': CircuitNode,
};
```

- [ ] **Step 5: Commit**

```bash
git add src/views/CircuitCanvas/nodes/
git commit -m "feat: add custom React Flow node types for all components"
```

---

### Task 5: Create Custom Edge Components

**Files:**
- Create: `src/views/CircuitCanvas/edges/SchematicEdge.tsx`
- Create: `src/views/CircuitCanvas/edges/BoardEdge.tsx`
- Create: `src/views/CircuitCanvas/edges/index.ts`
- Create: `src/views/CircuitCanvas/ConnectionLine.tsx`

**Reference files:**
- `src/utils/wiring.ts` — `generateOrthogonalPath()`

- [ ] **Step 1: Create SchematicEdge**

```typescript
// src/views/CircuitCanvas/edges/SchematicEdge.tsx
import { memo } from 'react';
import { type EdgeProps, getBezierPath } from 'reactflow';
import { generateOrthogonalPath } from '@/utils/wiring';

export const SchematicEdge = memo(function SchematicEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
}: EdgeProps) {
  const pathData = generateOrthogonalPath(sourceX, sourceY, targetX, targetY);

  return (
    <g>
      {/* Hit zone for easier clicking */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
      />
      {/* Visible wire */}
      <path
        id={id}
        d={pathData}
        fill="none"
        stroke={selected ? '#FF2D55' : '#333'}
        strokeWidth={selected ? 3 : 2}
        strokeLinecap="round"
      />
    </g>
  );
});
```

- [ ] **Step 2: Create BoardEdge**

```typescript
// src/views/CircuitCanvas/edges/BoardEdge.tsx
import { memo } from 'react';
import { type EdgeProps, getSmoothStepPath } from 'reactflow';

const WIRE_WIDTH = {
  power: 3,
  ground: 2.5,
  signal: 2,
} as const;

export const BoardEdge = memo(function BoardEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const wireType = (data?.wireType || 'signal') as 'power' | 'ground' | 'signal';
  const wireColor = (data?.wireColor || '#4a82c4') as string;
  const strokeWidth = selected ? WIRE_WIDTH[wireType] + 1 : WIRE_WIDTH[wireType];

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 20,
  });

  return (
    <g>
      {/* Hit zone */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
      />
      {/* Visible wire */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={selected ? '#FF2D55' : wireColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={0.85}
      />
      {/* Solder joints */}
      <circle cx={sourceX} cy={sourceY} r={strokeWidth * 0.8} fill="#c4a24e" opacity="0.9" />
      <circle cx={targetX} cy={targetY} r={strokeWidth * 0.8} fill="#c4a24e" opacity="0.9" />
    </g>
  );
});
```

- [ ] **Step 3: Create edge types index**

```typescript
// src/views/CircuitCanvas/edges/index.ts
import type { EdgeTypes } from 'reactflow';
import { SchematicEdge } from './SchematicEdge';
import { BoardEdge } from './BoardEdge';

export const edgeTypes: EdgeTypes = {
  schematic: SchematicEdge,
  board: BoardEdge,
};
```

- [ ] **Step 4: Create ConnectionLine**

```typescript
// src/views/CircuitCanvas/ConnectionLine.tsx
import { type ConnectionLineComponentProps } from 'reactflow';
import { generateOrthogonalPath } from '@/utils/wiring';

export function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  // Always use orthogonal for preview — simple and clear
  const pathData = generateOrthogonalPath(fromX, fromY, toX, toY);

  return (
    <g>
      <path
        d={pathData}
        fill="none"
        stroke="#999"
        strokeWidth={2}
        strokeDasharray="4 3"
      />
    </g>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/views/CircuitCanvas/edges/ src/views/CircuitCanvas/ConnectionLine.tsx
git commit -m "feat: add custom React Flow edge types and connection line"
```

---

### Task 6: Create the CircuitCanvas Component

The main wrapper that assembles everything.

**Files:**
- Create: `src/views/CircuitCanvas/CircuitCanvas.tsx`

**Reference files:**
- `src/views/CircuitCanvas/useCircuitSync.ts` — sync hook
- `src/views/CircuitCanvas/nodes/index.ts` — nodeTypes
- `src/views/CircuitCanvas/edges/index.ts` — edgeTypes
- `src/views/CircuitCanvas/ConnectionLine.tsx`
- `src/views/SchematicView/Toolbar.tsx` — reuse for undo/redo/view toggle
- `src/utils/componentFactory.ts` — `createComponentFromDefinition()`
- `src/components/registry/ComponentRegistry.ts` — `ComponentRegistry.getInstance().get()`

- [ ] **Step 1: Create CircuitCanvas**

```typescript
// src/views/CircuitCanvas/CircuitCanvas.tsx
import { useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type ReactFlowInstance,
} from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { useCircuitSync } from './useCircuitSync';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { ConnectionLine } from './ConnectionLine';
import { Toolbar } from '@/views/SchematicView/Toolbar';

interface CircuitCanvasProps {
  viewMode: 'schematic' | 'board';
  onToggleView: () => void;
  ledStates: Record<string, boolean>;
  onPotChange?: (componentId: string, position: number) => void;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
}

function CircuitCanvasInner({
  viewMode,
  onToggleView,
  ledStates,
  onPotChange,
  onAddProbe,
}: CircuitCanvasProps) {
  const { addComponent, undo, redo, canUndo, canRedo } = useCircuit();
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    onSelectionChange,
    onNodesDelete,
    onEdgesDelete,
  } = useCircuitSync(viewMode, ledStates, onPotChange, onAddProbe);

  // --- Sidebar drop handling ---

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const componentType = e.dataTransfer.getData('application/circuit-component');
      if (!componentType || !reactFlowInstance.current) return;

      const registry = ComponentRegistry.getInstance();
      const definition = registry.get(componentType);
      if (!definition) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const component = createComponentFromDefinition(definition, {
        x: position.x,
        y: position.y,
      });

      addComponent(component);
    },
    [addComponent],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  // --- Keyboard shortcuts ---
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        redo();
      }
    },
    [undo, redo],
  );

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} onKeyDown={onKeyDown} tabIndex={0}>
      <Toolbar
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        activeView={viewMode}
        onToggleView={onToggleView}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={ConnectionLine}
        isValidConnection={isValidConnection}
        onInit={onInit}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onDrop={onDrop}
        onDragOver={onDragOver}
        snapToGrid={true}
        snapGrid={[20, 20]}
        nodeOrigin={[0.5, 0.5]}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        style={{
          background: viewMode === 'schematic' ? '#ffffff' : '#1a6b3c',
        }}
      >
        <Background
          variant={viewMode === 'schematic' ? 'lines' as any : 'dots' as any}
          gap={20}
          color={viewMode === 'schematic' ? '#e0e0e0' : '#2a8b50'}
          size={viewMode === 'schematic' ? 0.5 : 1}
        />
        <Controls />
        <MiniMap
          nodeColor={() => viewMode === 'schematic' ? '#666' : '#d4ecd4'}
          maskColor={viewMode === 'schematic' ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.3)'}
        />
      </ReactFlow>
    </div>
  );
}

export default function CircuitCanvas(props: CircuitCanvasProps) {
  return (
    <ReactFlowProvider>
      <CircuitCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/CircuitCanvas/CircuitCanvas.tsx
git commit -m "feat: add CircuitCanvas main React Flow wrapper"
```

---

### Task 7: Update ComponentCard for Native Drag

**Files:**
- Modify: `src/views/ComponentDrawer/ComponentCard.tsx`

- [ ] **Step 1: Replace dnd-kit with native drag**

Replace the full file content of `src/views/ComponentDrawer/ComponentCard.tsx` with:

```typescript
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
        <ComponentSymbol
          definition={definition}
          width={48}
          height={32}
          testId={`component-symbol-${type}`}
        />
      </div>
      {valueLabel && <span className={styles.value}>{valueLabel}</span>}
      <span className={styles.name}>{nameLabel}</span>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/views/ComponentDrawer/ComponentCard.tsx
git commit -m "refactor: replace dnd-kit with native drag in ComponentCard"
```

---

### Task 8: Update App.tsx

Replace the dual-view architecture and dnd-kit wrapping with the unified CircuitCanvas.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite App.tsx**

Replace the full file content of `src/App.tsx` with:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { CircuitProvider } from './context/CircuitContext';
import { useCircuit } from './context/CircuitContext';
import { ComponentDrawer } from './views/ComponentDrawer';
import { AudioEngine } from './audio/AudioEngine';
import OscilloscopePanel from './views/Oscilloscope/OscilloscopePanel';
import { ExamplesMenu } from './views/ExamplesMenu';
import CircuitCanvas from './views/CircuitCanvas/CircuitCanvas';
import type { Circuit } from './models/Circuit';

type ActiveView = 'schematic' | 'board';

export function AppContent() {
  const { circuit } = useCircuit();
  const [activeView, setActiveView] = useState<ActiveView>('schematic');
  const [audioStarted, setAudioStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const scopeCallbackRef = useRef<((samples: Float32Array, probeData?: Float32Array[]) => void) | null>(null);
  const [ledStates, setLedStates] = useState<Record<string, boolean>>({});
  const [probes, setProbes] = useState<Array<{ componentId: string; pinId: string; label: string }>>([]);

  const serializeCircuit = useCallback((c: Circuit) => {
    const components = c.getComponents().map(comp => ({
      id: comp.id,
      type: comp.type,
      pins: comp.pins.map(p => ({ id: p.id, label: p.label, type: p.type })),
      parameters: { ...comp.parameters },
    }));
    const connections = c.getConnections().map(conn => ({
      id: conn.id,
      from: { componentId: conn.from.componentId, pinId: conn.from.pinId },
      to: { componentId: conn.to.componentId, pinId: conn.to.pinId },
    }));
    return { components, connections };
  }, []);

  useEffect(() => {
    const audioEngine = new AudioEngine();
    audioEngineRef.current = audioEngine;

    audioEngine.onSamples((samples, probeData) => {
      if (scopeCallbackRef.current) {
        scopeCallbackRef.current(samples, probeData);
      }
    });

    audioEngine.onLedStates((states) => {
      setLedStates(states);
    });

    return () => {
      audioEngine.close();
    };
  }, []);

  useEffect(() => {
    if (audioEngineRef.current && audioStarted) {
      const { components, connections } = serializeCircuit(circuit);
      audioEngineRef.current.loadCircuit(components, connections);
    }
  }, [circuit, audioStarted, serializeCircuit]);

  useEffect(() => {
    if (audioEngineRef.current && audioStarted) {
      audioEngineRef.current.setProbes(
        probes.map(p => ({ componentId: p.componentId, pinId: p.pinId }))
      );
    }
  }, [probes, audioStarted]);

  const handleAddProbe = useCallback((componentId: string, pinId: string, label: string) => {
    setProbes(prev => {
      if (prev.length >= 4) return prev;
      if (prev.some(p => p.componentId === componentId && p.pinId === pinId)) return prev;
      return [...prev, { componentId, pinId, label }];
    });
  }, []);

  const handleRemoveProbe = useCallback((index: number) => {
    setProbes(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Tab key handler for view toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
          return;
        }
        e.preventDefault();
        setActiveView((v) => (v === 'schematic' ? 'board' : 'schematic'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStartAudio = useCallback(async () => {
    if (!audioEngineRef.current) return;
    try {
      await audioEngineRef.current.initialize();
      await audioEngineRef.current.resume();
      const { components, connections } = serializeCircuit(circuit);
      audioEngineRef.current.loadCircuit(components, connections);
      audioEngineRef.current.startSimulation();
      setAudioStarted(true);
    } catch (err) {
      console.error('Failed to start audio:', err);
    }
  }, [circuit, serializeCircuit]);

  const handleStopAudio = useCallback(() => {
    audioEngineRef.current?.stopSimulation();
    audioEngineRef.current?.suspend();
    setAudioStarted(false);
  }, []);

  const handlePotChange = useCallback((componentId: string, position: number) => {
    audioEngineRef.current?.setParam(componentId, 'position', position);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Circuit Bender</h1>
        <div style={{ width: '1px', height: '18px', background: '#444' }} />
        <ExamplesMenu />
        <div className="audio-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {!audioStarted ? (
            <button className="play-btn" onClick={handleStartAudio}>&#9654;</button>
          ) : (
            <button className="play-btn" onClick={handleStopAudio}>&#9632;</button>
          )}
          <span style={{ color: '#666', fontSize: '9px' }}>VOL</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            title={`Volume: ${Math.round(volume * 100)}%`}
            style={{ width: '50px' }}
          />
          <button onClick={() => setMuted((m) => !m)}>
            {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
          </button>
        </div>
      </header>
      <main className="app-main">
        <ComponentDrawer />
        <CircuitCanvas
          viewMode={activeView}
          onToggleView={() => setActiveView((v) => (v === 'schematic' ? 'board' : 'schematic'))}
          ledStates={ledStates}
          onPotChange={handlePotChange}
          onAddProbe={handleAddProbe}
        />
      </main>
      <OscilloscopePanel
        onRegisterSampleCallback={useCallback((cb: (samples: Float32Array, probeData?: Float32Array[]) => void) => {
          scopeCallbackRef.current = cb;
        }, [])}
        probes={probes}
        onRemoveProbe={handleRemoveProbe}
      />
    </div>
  );
}

function App() {
  return (
    <CircuitProvider>
      <AppContent />
    </CircuitProvider>
  );
}

export default App;
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: replace dual views with unified CircuitCanvas"
```

---

### Task 9: Update ComponentDrawer to Remove dnd-kit Dependency

The ComponentDrawer index file may import from dnd-kit. Check and fix.

**Files:**
- Modify: `src/views/ComponentDrawer/ComponentDrawer.tsx` (if it imports dnd-kit)
- Modify: `src/views/ComponentDrawer/index.ts`

- [ ] **Step 1: Check and update ComponentDrawer files**

Read `src/views/ComponentDrawer/ComponentDrawer.tsx` and `src/views/ComponentDrawer/index.ts`. Remove any `@dnd-kit` imports. The `ComponentDrawer` itself likely doesn't use dnd-kit directly (the drag behavior is in `ComponentCard` which we already updated). Verify and fix any remaining references.

- [ ] **Step 2: Commit if changes were needed**

```bash
git add src/views/ComponentDrawer/
git commit -m "refactor: remove any remaining dnd-kit references from ComponentDrawer"
```

---

### Task 10: Delete Old View Files

Remove all files that have been replaced by the React Flow implementation.

**Files to delete:**
- `src/views/SchematicView.tsx`
- `src/views/SchematicView.module.css`
- `src/views/SchematicView/DraggableComponent.tsx`
- `src/views/SchematicView/Pin.tsx`
- `src/views/SchematicView/Wire.tsx`
- `src/views/SchematicView/PreviewWire.tsx`
- `src/views/BoardView/BoardView.tsx`
- `src/views/BoardView/BoardComponent.tsx`
- `src/views/BoardView/BoardPin.tsx`
- `src/views/BoardView/BoardWire.tsx`
- `src/views/BoardView/BoardBackground.tsx`
- `src/utils/boardRouting.ts`
- `src/constants/dnd.ts` (if it exists and only contains dnd-kit constants)

**Keep these files (still used):**
- `src/views/SchematicView/ParameterEditor.tsx` — still imported by EditableNode (if needed later)
- `src/views/SchematicView/Toolbar.tsx` + `Toolbar.module.css` — imported by CircuitCanvas

- [ ] **Step 1: Delete old files**

```bash
rm src/views/SchematicView.tsx
rm src/views/SchematicView.module.css
rm src/views/SchematicView/DraggableComponent.tsx
rm src/views/SchematicView/Pin.tsx
rm src/views/SchematicView/Wire.tsx
rm src/views/SchematicView/PreviewWire.tsx
rm src/views/BoardView/BoardView.tsx
rm src/views/BoardView/BoardComponent.tsx
rm src/views/BoardView/BoardPin.tsx
rm src/views/BoardView/BoardWire.tsx
rm src/views/BoardView/BoardBackground.tsx
rm src/utils/boardRouting.ts
```

Check if `src/constants/dnd.ts` exists and contains only dnd-kit constants:

```bash
cat src/constants/dnd.ts
```

If it only has `DROPPABLE_CANVAS_ID` and `DROPPABLE_BOARD_ID`, delete it:

```bash
rm src/constants/dnd.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: delete old SchematicView, BoardView, and boardRouting files"
```

---

### Task 11: Fix TypeScript Errors and Verify Build

**Files:** Various — depends on what errors surface

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Fix any errors. Common expected issues:
- Imports of deleted files from other modules
- Missing type annotations for React Flow types
- React Flow API differences (check import paths)

- [ ] **Step 2: Run the dev server**

```bash
npm run dev
```

Open `http://localhost:5173` in the browser. Verify:
1. The app loads without console errors
2. The canvas shows with the toolbar (Schematic/Board toggle, undo/redo)
3. Background switches between white grid (schematic) and green dots (board)

- [ ] **Step 3: Fix any remaining issues and commit**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors after React Flow migration"
```

---

### Task 12: Smoke Test All Features

Manual testing in the browser to verify everything works.

- [ ] **Step 1: Test sidebar drag-to-create**

1. Drag a Resistor from the sidebar onto the canvas
2. Verify it appears at the drop position with correct symbol
3. Drag a CD40106 — verify the IC symbol renders with all pins
4. Drag Power, Ground, Audio Output — verify all render

- [ ] **Step 2: Test view toggle**

1. Press Tab to switch between schematic and board views
2. Verify component symbols change (e.g., resistor zigzag vs color bands)
3. Verify background changes (white grid vs green dots)

- [ ] **Step 3: Test wiring**

1. Drag from a resistor pin to a CD40106 pin
2. Verify the connection creates and renders
3. In schematic: verify orthogonal Manhattan path
4. In board: verify smooth step path with correct wire color

- [ ] **Step 4: Test selection and deletion**

1. Click a component — verify selection highlight
2. Click a wire — verify selection highlight
3. Press Delete — verify selected item is removed
4. Ctrl+Z to undo — verify it comes back

- [ ] **Step 5: Test examples**

1. Click Examples > Simple Oscillator
2. Verify all components and wires render
3. Press Play — verify audio starts
4. Switch to Board view — verify board rendering

- [ ] **Step 6: Test potentiometer**

1. Load Pitch Control example
2. In board view, drag the potentiometer dial
3. Verify the value label updates
4. If audio is playing, verify pitch changes

- [ ] **Step 7: Test parameter editing**

1. Double-click a resistor
2. Type "4.7k" and press Enter
3. Verify the label updates

- [ ] **Step 8: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```

---

### Task 13: Final Cleanup

- [ ] **Step 1: Remove unused imports/files**

Search for any remaining references to deleted files or dnd-kit:

```bash
grep -r "@dnd-kit" src/ --include="*.ts" --include="*.tsx"
grep -r "SchematicView" src/ --include="*.ts" --include="*.tsx"
grep -r "BoardView" src/ --include="*.ts" --include="*.tsx"
grep -r "DROPPABLE_" src/ --include="*.ts" --include="*.tsx"
```

Remove any stale references.

- [ ] **Step 2: Run full type check and tests**

```bash
npx tsc --noEmit
npm test
```

Fix any failures.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup after React Flow migration"
```
