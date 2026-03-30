# Wire Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add junction components (electrical wire connection points), wire waypoints (draggable intermediate routing points), and auto-junction on wire drop for clean schematic wire management.

**Architecture:** Junction is a new single-pin component (simulation model + definition + UI node). Waypoints are stored as `{x,y}[]` on Connection objects and rendered by updated edge components. Auto-junction intercepts React Flow's `onConnectEnd` to detect wire proximity and automatically split/reconnect.

**Tech Stack:** TypeScript, React, React Flow, Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-wire-management-design.md`

---

## Dependency Graph

```
Task 1 (Junction Component) — independent
Task 2 (Connection Data Model) — independent
Task 3 (Edge Rendering with Waypoints) — depends on Task 2
Task 4 (Waypoint Interaction) — depends on Task 3
Task 5 (Auto-Junction on Wire Drop) — depends on Tasks 1 + 2
```

Tasks 1 and 2 are independent and can be done in parallel.

---

## Task 1: Junction Component

**Files:**
- Create: `src/simulation/models/JunctionModel.ts`
- Create: `src/components/definitions/Junction.tsx`
- Create: `src/views/CircuitCanvas/nodes/JunctionNode.tsx`
- Modify: `src/views/CircuitCanvas/nodes/index.ts`
- Modify: `src/simulation/worklet/processor.ts`
- Modify: `src/simulation/index.ts`
- Modify: `src/main.tsx`
- Test: `tests/simulation/models/JunctionModel.test.ts`

- [ ] **Step 1: Write JunctionModel test**

```typescript
// tests/simulation/models/JunctionModel.test.ts
import { describe, it, expect } from 'vitest';
import { JunctionModel } from '@/simulation/models/JunctionModel';

describe('JunctionModel', () => {
  it('has 0 internal nodes and 0 branches', () => {
    const m = new JunctionModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps nothing', () => {
    const m = new JunctionModel();
    m.init([0], 0, 0, {});
    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    m.stamp(G, b, new Float64Array(1), 1 / 48000);
    expect(G[0][0]).toBe(0);
    expect(b[0]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/JunctionModel.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement JunctionModel**

```typescript
// src/simulation/models/JunctionModel.ts
import type { ComponentModel } from './ComponentModel';

export class JunctionModel implements ComponentModel {
  readonly type = 'junction';
  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }
  init(_pinNodes: number[], _i: number, _b: number, _p: Record<string, number>): void {}
  stamp(_G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {}
  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/JunctionModel.test.ts`
Expected: PASS

- [ ] **Step 5: Create Junction component definition**

```tsx
// src/components/definitions/Junction.tsx
import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const junctionDefinition: ComponentDefinition = {
  type: 'junction',
  metadata: {
    name: 'Junction',
    category: 'passive',
    description: 'Wire junction — connects crossing wires electrically',
  },
  pins: [
    {
      id: generatePinId('junction', 0),
      label: 'J',
      type: 'bidirectional',
      position: { x: 0, y: 0 },
    },
  ],
  defaultParameters: {},
  schematic: {
    symbol: {
      width: 20,
      height: 20,
      render: () => (
        <circle cx="0" cy="0" r="5" fill="#333" />
      ),
    },
    dimensions: { width: 20, height: 20 },
  },
  board: {
    symbol: {
      width: 20,
      height: 20,
      render: () => (
        <circle cx="0" cy="0" r="5" fill="#c4a24e" />
      ),
    },
    dimensions: { width: 20, height: 20 },
  },
  simulate: (inputs) => ({
    pin_0: inputs.pin_0 || { voltage: 0, current: 0 },
  }),
};
```

- [ ] **Step 6: Create JunctionNode**

```tsx
// src/views/CircuitCanvas/nodes/JunctionNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CircuitNodeData } from '../useCircuitSync';
import { pinTooltip } from './pinTooltip';

export const JunctionNode = memo(function JunctionNode({ data }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const fill = viewMode === 'schematic' ? '#333' : '#c4a24e';
  const pin = component.pins[0];

  return (
    <div style={{ width: 20, height: 20, position: 'relative', cursor: 'grab' }}>
      <svg width={20} height={20} viewBox="-10 -10 20 20" style={{ display: 'block', overflow: 'visible' }}>
        <circle cx="0" cy="0" r="5" fill={fill} />
      </svg>
      <Handle
        id={pin.id} type="source" position={Position.Top} isConnectable={true}
        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: 'transparent', border: 'none' }}
        title={pinTooltip(component.type, pin.label, pin.type)}
      />
      <Handle
        id={pin.id} type="target" position={Position.Top} isConnectable={true}
        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: 'transparent', border: 'none', opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  );
});
```

- [ ] **Step 7: Register junction everywhere**

In `src/views/CircuitCanvas/nodes/index.ts`, add:
```typescript
import { JunctionNode } from './JunctionNode';
```
And add to nodeTypes: `junction: JunctionNode,`

In `src/simulation/worklet/processor.ts`, add:
```typescript
import { JunctionModel } from '../models/JunctionModel';
```
And in createRegistry: `reg.register('junction', () => new JunctionModel());`

In `src/simulation/index.ts`, add:
```typescript
export { JunctionModel } from './models/JunctionModel';
```

In `src/main.tsx`, add:
```typescript
import { junctionDefinition } from './components/definitions/Junction';
```
And: `registry.register(junctionDefinition);`

In `src/views/CircuitCanvas/nodes/pinTooltip.ts`, add to descriptions:
```typescript
junction: { J: 'Wire junction' },
```

- [ ] **Step 8: Verify type check and commit**

Run: `npx tsc --noEmit`
Expected: No new errors

```bash
git add src/simulation/models/JunctionModel.ts src/components/definitions/Junction.tsx \
  src/views/CircuitCanvas/nodes/JunctionNode.tsx src/views/CircuitCanvas/nodes/index.ts \
  src/views/CircuitCanvas/nodes/pinTooltip.ts src/simulation/worklet/processor.ts \
  src/simulation/index.ts src/main.tsx tests/simulation/models/JunctionModel.test.ts
git commit -m "feat: junction component — single-pin wire connection point"
```

---

## Task 2: Connection Data Model + updateConnection

**Files:**
- Modify: `src/types/circuit.ts`
- Modify: `src/models/Circuit.ts`
- Modify: `src/context/CircuitContext.tsx`
- Modify: `src/utils/wiring.ts`

- [ ] **Step 1: Add waypoints to Connection type**

In `src/types/circuit.ts`, update Connection:

```typescript
export interface Connection {
  id: ConnectionId;
  from: { componentId: ComponentId; pinId: PinId };
  to: { componentId: ComponentId; pinId: PinId };
  net: NetId;
  waypoints?: { x: number; y: number }[];
}
```

- [ ] **Step 2: Add updateConnection to Circuit model**

In `src/models/Circuit.ts`, add method after `removeConnection`:

```typescript
updateConnection(connectionId: ConnectionId, updates: Partial<Connection>): Circuit {
  const idx = this.connections.findIndex(c => c.id === connectionId);
  if (idx < 0) return this;
  const newConnections = [...this.connections];
  newConnections[idx] = { ...newConnections[idx], ...updates };
  return this.clone({
    connections: newConnections,
    metadata: this.updateMetadata(),
  });
}
```

- [ ] **Step 3: Add UPDATE_CONNECTION action to CircuitContext**

In `src/context/CircuitContext.tsx`:

Add to the `CircuitContextType` interface:
```typescript
updateConnection: (connectionId: ConnectionId, updates: Partial<Connection>) => void;
```

Add to the reducer (after REMOVE_CONNECTION case):
```typescript
case 'UPDATE_CONNECTION':
  return {
    ...state,
    circuit: state.circuit.updateConnection(action.connectionId, action.updates),
  };
```

Add the callback (after removeConnection):
```typescript
const updateConnection = useCallback(
  (connectionId: ConnectionId, updates: Partial<Connection>) => {
    dispatch({ type: 'UPDATE_CONNECTION', connectionId, updates });
  },
  []
);
```

Add to the value memo and the action type union.

Note: UPDATE_CONNECTION does NOT push to undo stack (waypoint drags happen continuously — undo would be too granular).

- [ ] **Step 4: Add waypoint path helper to wiring.ts**

Add to `src/utils/wiring.ts`:

```typescript
/**
 * Generates an orthogonal SVG path through waypoints.
 * Each segment routes: H then V (or direct if aligned).
 */
export function generateWaypointPath(
  x1: number, y1: number,
  x2: number, y2: number,
  waypoints?: { x: number; y: number }[]
): string {
  if (!waypoints || waypoints.length === 0) {
    return generateOrthogonalPath(x1, y1, x2, y2);
  }

  const points = [
    { x: x1, y: y1 },
    ...waypoints,
    { x: x2, y: y2 },
  ];

  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    // Route orthogonally: horizontal first, then vertical
    if (prev.x !== curr.x) path += ` H ${curr.x}`;
    if (prev.y !== curr.y) path += ` V ${curr.y}`;
  }

  return path;
}

/**
 * Computes the minimum distance from a point to a line segment.
 */
export function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}
```

- [ ] **Step 5: Verify type check and commit**

Run: `npx tsc --noEmit`

```bash
git add src/types/circuit.ts src/models/Circuit.ts src/context/CircuitContext.tsx src/utils/wiring.ts
git commit -m "feat: connection waypoints data model + updateConnection + path helpers"
```

---

## Task 3: Edge Rendering with Waypoints

**Files:**
- Modify: `src/views/CircuitCanvas/edges/SchematicEdge.tsx`
- Modify: `src/views/CircuitCanvas/edges/BoardEdge.tsx`
- Modify: `src/views/CircuitCanvas/useCircuitSync.ts`

- [ ] **Step 1: Pass waypoints through edge data**

In `src/views/CircuitCanvas/useCircuitSync.ts`, update the edges memo to include waypoints in edge data:

Change the return object inside `connections.map((conn) => ...)`:
```typescript
data: {
  wireColor: getWireColor(...),
  wireType: getWireType(...),
  waypoints: conn.waypoints,
  connectionId: conn.id,
},
```

- [ ] **Step 2: Update SchematicEdge to render through waypoints**

```tsx
// src/views/CircuitCanvas/edges/SchematicEdge.tsx
import { memo } from 'react';
import { type EdgeProps } from 'reactflow';
import { generateWaypointPath } from '@/utils/wiring';

export const SchematicEdge = memo(function SchematicEdge({
  id, sourceX, sourceY, targetX, targetY, selected, data,
}: EdgeProps) {
  const waypoints = data?.waypoints as { x: number; y: number }[] | undefined;
  const pathData = generateWaypointPath(sourceX, sourceY, targetX, targetY, waypoints);

  return (
    <g>
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={pathData} fill="none" stroke={selected ? '#FF2D55' : '#333'} strokeWidth={selected ? 3 : 2} strokeLinecap="round" />
      {/* Render waypoint diamonds */}
      {waypoints?.map((wp, i) => (
        <rect
          key={i}
          x={wp.x - 4} y={wp.y - 4} width={8} height={8}
          transform={`rotate(45, ${wp.x}, ${wp.y})`}
          fill={selected ? '#FF2D55' : '#999'}
          style={{ cursor: 'grab' }}
        />
      ))}
    </g>
  );
});
```

- [ ] **Step 3: Update BoardEdge to render through waypoints**

```tsx
// src/views/CircuitCanvas/edges/BoardEdge.tsx
import { memo } from 'react';
import { type EdgeProps, getSmoothStepPath } from 'reactflow';
import { generateWaypointPath } from '@/utils/wiring';

const WIRE_WIDTH = { power: 3, ground: 2.5, signal: 2 } as const;

export const BoardEdge = memo(function BoardEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data,
}: EdgeProps) {
  const wireType = (data?.wireType || 'signal') as 'power' | 'ground' | 'signal';
  const wireColor = (data?.wireColor || '#4a82c4') as string;
  const strokeWidth = selected ? WIRE_WIDTH[wireType] + 1 : WIRE_WIDTH[wireType];
  const waypoints = data?.waypoints as { x: number; y: number }[] | undefined;

  // Use waypoint path if waypoints exist, otherwise use React Flow's smooth step
  const edgePath = waypoints && waypoints.length > 0
    ? generateWaypointPath(sourceX, sourceY, targetX, targetY, waypoints)
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 20 })[0];

  return (
    <g>
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={edgePath} fill="none" stroke={selected ? '#FF2D55' : wireColor} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.85} />
      <circle cx={sourceX} cy={sourceY} r={strokeWidth * 0.8} fill="#c4a24e" opacity="0.9" />
      <circle cx={targetX} cy={targetY} r={strokeWidth * 0.8} fill="#c4a24e" opacity="0.9" />
    </g>
  );
});
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add src/views/CircuitCanvas/edges/SchematicEdge.tsx \
  src/views/CircuitCanvas/edges/BoardEdge.tsx \
  src/views/CircuitCanvas/useCircuitSync.ts
git commit -m "feat: edge rendering through waypoints with visual waypoint diamonds"
```

---

## Task 4: Waypoint Interaction (add, drag, delete)

**Files:**
- Modify: `src/views/CircuitCanvas/edges/SchematicEdge.tsx`
- Modify: `src/views/CircuitCanvas/CircuitCanvas.tsx`

- [ ] **Step 1: Add double-click to insert waypoint and drag to move**

Update `SchematicEdge` to handle waypoint interactions:

```tsx
// src/views/CircuitCanvas/edges/SchematicEdge.tsx
import { memo, useCallback } from 'react';
import { type EdgeProps, useReactFlow } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { generateWaypointPath } from '@/utils/wiring';
import type { ConnectionId } from '@/types/circuit';

export const SchematicEdge = memo(function SchematicEdge({
  id, sourceX, sourceY, targetX, targetY, selected, data,
}: EdgeProps) {
  const { updateConnection } = useCircuit();
  const { screenToFlowPosition } = useReactFlow();
  const waypoints = (data?.waypoints as { x: number; y: number }[] | undefined) || [];
  const connectionId = data?.connectionId as string;
  const pathData = generateWaypointPath(sourceX, sourceY, targetX, targetY, waypoints.length > 0 ? waypoints : undefined);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    // Snap to grid
    const snapped = { x: Math.round(pos.x / 20) * 20, y: Math.round(pos.y / 20) * 20 };
    // Insert waypoint — find the right position in the array
    const allPoints = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < allPoints.length - 1; i++) {
      const mid = { x: (allPoints[i].x + allPoints[i + 1].x) / 2, y: (allPoints[i].y + allPoints[i + 1].y) / 2 };
      const d = Math.hypot(snapped.x - mid.x, snapped.y - mid.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const newWaypoints = [...waypoints];
    newWaypoints.splice(bestIdx, 0, snapped);
    updateConnection(connectionId as ConnectionId, { waypoints: newWaypoints });
  }, [connectionId, waypoints, sourceX, sourceY, targetX, targetY, updateConnection, screenToFlowPosition]);

  const handleWaypointDrag = useCallback((idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (moveEvt: PointerEvent) => {
      const pos = screenToFlowPosition({ x: moveEvt.clientX, y: moveEvt.clientY });
      const snapped = { x: Math.round(pos.x / 20) * 20, y: Math.round(pos.y / 20) * 20 };
      const newWaypoints = [...waypoints];
      newWaypoints[idx] = snapped;
      updateConnection(connectionId as ConnectionId, { waypoints: newWaypoints });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [connectionId, waypoints, updateConnection, screenToFlowPosition]);

  return (
    <g onDoubleClick={handleDoubleClick}>
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
      <path id={id} d={pathData} fill="none" stroke={selected ? '#FF2D55' : '#333'} strokeWidth={selected ? 3 : 2} strokeLinecap="round" />
      {waypoints.map((wp, i) => (
        <rect
          key={i}
          x={wp.x - 4} y={wp.y - 4} width={8} height={8}
          transform={`rotate(45, ${wp.x}, ${wp.y})`}
          fill={selected ? '#FF2D55' : '#999'}
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => handleWaypointDrag(i, e)}
        />
      ))}
    </g>
  );
});
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add src/views/CircuitCanvas/edges/SchematicEdge.tsx
git commit -m "feat: double-click to add waypoints, drag to reposition"
```

---

## Task 5: Auto-Junction on Wire Drop

**Files:**
- Modify: `src/views/CircuitCanvas/CircuitCanvas.tsx`
- Modify: `src/utils/wiring.ts`

- [ ] **Step 1: Add wire proximity detection helpers**

Add to `src/utils/wiring.ts`:

```typescript
/**
 * Get all line segments from an edge path (source → waypoints → target).
 */
export function getEdgeSegments(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  waypoints?: { x: number; y: number }[]
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const points = [
    { x: sourceX, y: sourceY },
    ...(waypoints || []),
    { x: targetX, y: targetY },
  ];

  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // Orthogonal routing produces two segments: H then V
    if (a.x !== b.x && a.y !== b.y) {
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: a.y }); // horizontal
      segments.push({ x1: b.x, y1: a.y, x2: b.x, y2: b.y }); // vertical
    } else {
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return segments;
}
```

- [ ] **Step 2: Add onConnectEnd handler to CircuitCanvas**

In `src/views/CircuitCanvas/CircuitCanvas.tsx`, add the auto-junction logic:

Add imports:
```typescript
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import { pointToSegmentDistance, getEdgeSegments } from '@/utils/wiring';
import type { ComponentId, PinId, Connection } from '@/types/circuit';
```

Note: `addComponent` and `addConnection` are already available from `useCircuit()`. Also add `removeConnection` and `addConnection` to the destructured context.

Update the destructured `useCircuit()` call:
```typescript
const { addComponent, addConnection, removeConnection, undo, redo, canUndo, canRedo, circuit } = useCircuit();
```

Add the `onConnectEnd` handler:
```typescript
const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
  if (!reactFlowInstance.current) return;
  const clientX = 'clientX' in event ? event.clientX : event.touches[0].clientX;
  const clientY = 'clientY' in event ? event.clientY : event.touches[0].clientY;
  const dropPos = reactFlowInstance.current.screenToFlowPosition({ x: clientX, y: clientY });

  // Check proximity to existing edges
  const allEdges = reactFlowInstance.current.getEdges();
  const allNodes = reactFlowInstance.current.getNodes();
  const THRESHOLD = 15;

  for (const edge of allEdges) {
    const sourceNode = allNodes.find(n => n.id === edge.source);
    const targetNode = allNodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourcePin = sourceNode.data?.component?.pins?.find((p: any) => p.id === edge.sourceHandle);
    const targetPin = targetNode.data?.component?.pins?.find((p: any) => p.id === edge.targetHandle);
    if (!sourcePin || !targetPin) continue;

    const sx = sourceNode.position.x + sourcePin.position.x;
    const sy = sourceNode.position.y + sourcePin.position.y;
    const tx = targetNode.position.x + targetPin.position.x;
    const ty = targetNode.position.y + targetPin.position.y;

    const segments = getEdgeSegments(sx, sy, tx, ty, edge.data?.waypoints);
    for (const seg of segments) {
      const dist = pointToSegmentDistance(dropPos.x, dropPos.y, seg.x1, seg.y1, seg.x2, seg.y2);
      if (dist < THRESHOLD) {
        // Found a nearby wire — insert junction
        const registry = ComponentRegistry.getInstance();
        const junctionDef = registry.get('junction');
        if (!junctionDef) return;

        const snapped = { x: Math.round(dropPos.x / 20) * 20, y: Math.round(dropPos.y / 20) * 20 };
        const junction = createComponentFromDefinition(junctionDef, snapped);
        const junctionPinId = junction.pins[0].id;

        // Add junction component
        addComponent(junction);

        // Get original connection data
        const conn = circuit.getConnections().find(c => c.id === edge.id);
        if (!conn) return;

        // Remove original wire
        removeConnection(conn.id);

        // Create two new wires through junction
        addConnection({
          id: generateConnectionId(),
          from: conn.from,
          to: { componentId: junction.id, pinId: junctionPinId },
          net: generateNetId(),
        });
        addConnection({
          id: generateConnectionId(),
          from: { componentId: junction.id, pinId: junctionPinId },
          to: conn.to,
          net: generateNetId(),
        });

        return; // done
      }
    }
  }
}, [addComponent, addConnection, removeConnection, circuit]);
```

Add `onConnectEnd` to the ReactFlow component props:
```tsx
<ReactFlow
  ... existing props ...
  onConnectEnd={onConnectEnd}
>
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add src/views/CircuitCanvas/CircuitCanvas.tsx src/utils/wiring.ts
git commit -m "feat: auto-junction when wire dropped on existing wire"
```

---

## Self-Review

**Spec coverage:**
- [x] Junction component (model, definition, node, registration) — Task 1
- [x] Waypoints on Connection data model — Task 2
- [x] updateConnection action — Task 2
- [x] Edge rendering through waypoints — Task 3
- [x] Waypoint diamonds — Task 3
- [x] Double-click to add waypoint — Task 4
- [x] Drag to reposition waypoint — Task 4
- [x] generateWaypointPath helper — Task 2
- [x] pointToSegmentDistance helper — Task 2
- [x] getEdgeSegments helper — Task 5
- [x] Auto-junction on wire drop (onConnectEnd) — Task 5
- [x] Wire splitting — Task 5

**Missing from spec (deferred):**
- Delete key for waypoints (can be added later — select waypoint + delete)
- Visual feedback while dragging near wire (highlight + preview dot) — enhancement
- Waypoint splitting for wires with existing waypoints during auto-junction — edge case, can be added

**Type consistency:** Connection.waypoints is `{ x: number; y: number }[]` throughout. ConnectionId used consistently. All functions use the same parameter names.
