# React Flow Migration Design

## Problem

The current UI uses custom SVG rendering with dnd-kit for both SchematicView and BoardView. This requires building and maintaining drag, selection, pan/zoom, connection, and routing primitives from scratch. React Flow provides all of these out of the box with better UX (marquee select, minimap, alignment guides, snap-to-handle).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| View architecture | Single unified React Flow canvas | Both views share circuit data, selection, interactions. View toggle switches node/edge renderers. |
| SVG rendering | React Flow SVG layer | Clean implementation, keeps symbols in native SVG space. |
| Component symbols | Reuse existing definition render functions | All `definition.schematic.symbol.render()` and `definition.board.symbol.render()` stay as-is inside custom nodes. |
| Pin/connection system | React Flow Handles + native edges | Each pin becomes a Handle. Custom edge renderers for schematic (orthogonal) and board (smoothstep). |
| Board wire routing | React Flow smoothstep edges | Drop custom A* routing for now. Can reintroduce later as a custom edge renderer. |
| Sidebar drag | Native HTML drag/drop | Drop dnd-kit entirely. `draggable` + `onDrop` with `screenToFlowPosition()`. |
| State management | CircuitContext stays source of truth | Sync layer converts between Circuit model and React Flow nodes/edges. |
| Migration strategy | Big bang replacement | Codebase is small (~30 UI files), boundaries are clean. Git revert if needed. |

## Architecture

### Core: CircuitCanvas

A single `CircuitCanvas` component replaces both `SchematicView` and `BoardView`. It wraps `<ReactFlow>` and accepts `viewMode: 'schematic' | 'board'`.

```
App.tsx
  └─ CircuitCanvas (viewMode, ledStates, onPotChange, onAddProbe)
       └─ <ReactFlow>
            ├─ Custom nodes (one per component type)
            ├─ Custom edges (schematic or board style)
            └─ ConnectionLine (preview wire)
```

### Data Mapping

**Circuit Component -> React Flow Node:**
```typescript
{
  id: component.id,
  type: component.type,          // maps to nodeTypes registry
  position: component.position,  // { x, y }
  data: {
    component,                   // full Component object
    viewMode,                    // 'schematic' | 'board'
    ledOn,                       // boolean for LEDs
    onPotChange,                 // callback for potentiometer
    onAddProbe,                  // callback for probe creation
  }
}
```

**Circuit Connection -> React Flow Edge:**
```typescript
{
  id: connection.id,
  type: viewMode,                // 'schematic' or 'board'
  source: connection.from.componentId,
  target: connection.to.componentId,
  sourceHandle: connection.from.pinId,
  targetHandle: connection.to.pinId,
  data: {
    wireColor,                   // from getWireColor()
    wireType,                    // 'power' | 'ground' | 'signal'
  }
}
```

### State Sync

CircuitContext remains the source of truth for circuit topology. React Flow manages visual state (viewport, drag positions).

**Downstream (Circuit -> React Flow):**
- `useMemo` derives React Flow nodes/edges from circuit state
- Controlled mode: `<ReactFlow nodes={nodes} edges={edges}>`
- LED states, parameters, view mode changes trigger node data updates

**Upstream (React Flow -> Circuit):**
- `onNodesChange`: node drag end -> `updateComponent(id, { position })`
- `onConnect`: new edge -> `addConnection()` with pin ID mapping
- `onSelectionChange`: -> `setSelection()`
- `onNodesDelete` / `onEdgesDelete`: -> `removeComponent()` / `removeConnection()`

**Undo/redo** stays in CircuitContext's reducer. Since nodes/edges are derived from circuit state, undo automatically updates the canvas.

### Sync Hook: useCircuitSync

```typescript
function useCircuitSync(circuit, viewMode, ledStates, onPotChange, onAddProbe) {
  // Derives nodes and edges from circuit + view state
  const nodes = useMemo(() => circuitToNodes(circuit, viewMode, ledStates, onPotChange, onAddProbe), [...]);
  const edges = useMemo(() => circuitToEdges(circuit, viewMode), [...]);

  // Handlers that map React Flow events back to CircuitContext
  const onNodesChange = useCallback(...);
  const onConnect = useCallback(...);
  const onSelectionChange = useCallback(...);
  const onNodesDelete = useCallback(...);
  const onEdgesDelete = useCallback(...);

  return { nodes, edges, onNodesChange, onConnect, ... };
}
```

## Custom Nodes

One custom node component per component type, registered via `nodeTypes`. Each node:

1. Reads `viewMode` from `data` prop
2. Wraps an inline `<svg>` containing the existing symbol via `definition[viewMode].symbol.render(params)`
3. Exposes React Flow `<Handle>` elements positioned with CSS (`position: absolute`, `top`/`left`) to align with pin locations within the SVG
4. All handles are bidirectional (both source and target)

React Flow renders nodes as HTML elements. Each custom node is a `<div>` containing an `<svg>` for the circuit symbol, with `<Handle>` elements positioned around it. React Flow's edges (rendered in a separate SVG layer) connect to handle positions automatically. `nodeOrigin={[0.5, 0.5]}` centers the node on the component's position, matching our current coordinate system.

Specialized behavior per node type:
- **Potentiometer:** Dial drag interaction in the node
- **LED:** Glow effect rendering when `data.ledOn` is true
- **Resistor/Capacitor:** Double-click opens parameter editor

### Generic vs Per-Type Nodes

A single `CircuitNode` component can handle most types by delegating to the definition's render function. Only potentiometer, LED, and resistor/capacitor need specialized wrappers for their unique interactions. Structure:

```
src/views/CircuitCanvas/nodes/
  CircuitNode.tsx          # Generic node: renders symbol + handles
  PotentiometerNode.tsx    # Extends CircuitNode with dial interaction
  LEDNode.tsx              # Extends CircuitNode with glow effect
  EditableNode.tsx         # Extends CircuitNode with double-click editing
```

The `nodeTypes` map:
```typescript
const nodeTypes = {
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

## Custom Edges

Two custom edge types:

### SchematicEdge
- Renders orthogonal Manhattan-style path (H-V-H) via `generateOrthogonalPath()`
- Stroke: #333 normal, #FF2D55 selected
- Transparent hit zone for click/right-click
- Right-click context menu for probe creation

### BoardEdge
- Uses React Flow's `smoothstep` path calculation via `getSmoothStepPath()`
- Wire color from `getWireColor()`: red (power), dark gray (ground), blue (signal)
- Wire width from `getWireType()`: 3px (power), 2.5px (ground), 2px (signal)
- Solder joint circles at endpoints
- Right-click context menu for probe creation

### ConnectionLine
Custom connection line component for the preview wire during dragging:
- Schematic mode: dashed orthogonal path
- Board mode: dashed smooth curve

### Connection Validation
React Flow's `isValidConnection` prop uses the existing `validateConnection()` utility:
- No self-loops (same component)
- No duplicate connections
- Both components and pins must exist

## Sidebar Component Creation

Replace dnd-kit with native HTML drag events.

**ComponentCard changes:**
- Add `draggable="true"`
- `onDragStart`: `e.dataTransfer.setData('application/circuit-component', componentType)`

**CircuitCanvas drop handling:**
- `onDragOver`: `e.preventDefault()` to allow drop
- `onDrop`: read component type, call `screenToFlowPosition()` for coordinates, create component in CircuitContext

## React Flow Configuration

```typescript
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  edgeTypes={edgeTypes}
  connectionLineComponent={ConnectionLine}
  isValidConnection={isValidConnection}
  snapToGrid={true}
  snapGrid={[20, 20]}
  nodeOrigin={[0.5, 0.5]}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  onConnect={onConnect}
  onSelectionChange={onSelectionChange}
  onNodesDelete={onNodesDelete}
  onEdgesDelete={onEdgesDelete}
  onDrop={onDrop}
  onDragOver={onDragOver}
  fitView
>
  <Background variant="dots" gap={20} />
  <Controls />
  <MiniMap />
</ReactFlow>
```

## Files Deleted

- `src/views/SchematicView.tsx` + `SchematicView.module.css`
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

## Files Created

- `src/views/CircuitCanvas/CircuitCanvas.tsx` — main React Flow wrapper
- `src/views/CircuitCanvas/useCircuitSync.ts` — Circuit <-> React Flow sync hook
- `src/views/CircuitCanvas/nodes/CircuitNode.tsx` — generic node renderer
- `src/views/CircuitCanvas/nodes/PotentiometerNode.tsx` — dial interaction
- `src/views/CircuitCanvas/nodes/LEDNode.tsx` — glow effect
- `src/views/CircuitCanvas/nodes/EditableNode.tsx` — double-click parameter editing
- `src/views/CircuitCanvas/edges/SchematicEdge.tsx` — orthogonal Manhattan edge
- `src/views/CircuitCanvas/edges/BoardEdge.tsx` — smoothstep colored edge
- `src/views/CircuitCanvas/ConnectionLine.tsx` — preview wire during connection

## Files Modified

- `src/App.tsx` — replace SchematicView/BoardView with CircuitCanvas, remove dnd-kit DndContext/DragOverlay, add native drop handling
- `src/views/ComponentDrawer/ComponentCard.tsx` — replace dnd-kit useDraggable with native `draggable` + `onDragStart`
- `package.json` — add `reactflow`, remove `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

## Files Unchanged

- `src/audio/*` — audio engine, bridge
- `src/views/Oscilloscope/*` — oscilloscope panel
- `src/models/Circuit.ts` — circuit data model
- `src/components/definitions/*` — all component SVG symbols
- `src/components/registry/*` — component registry
- `src/context/CircuitContext.tsx` — state management (source of truth)
- `src/utils/wiring.ts` — `validateConnection()`, `generateOrthogonalPath()`
- `src/utils/parameterParser.ts`, `ids.ts`, `grid.ts`
- `src/views/ExamplesMenu.tsx`
- `src/views/SchematicView/ParameterEditor.tsx` — reused by EditableNode
- `src/views/SchematicView/Toolbar.tsx` + `Toolbar.module.css` — reused by CircuitCanvas
- `public/audio-worklet-processor.js` — MNA solver
