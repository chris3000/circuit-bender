# Wire Management — Junction Component + Waypoints

## Problem

Wires are auto-routed with no user control. There's no way to indicate electrical junctions (where wires connect at a crossing), no way to manually route wires around components, and no way to clean up wire layout. The schematic view uses fixed Manhattan routing (H→V→H from midpoint) and the board view uses React Flow's smooth step paths.

## Approach

Three features that work together:

1. **Junction component** — a new circuit element with a single pin. All wires meeting at a junction share the same net. Dragged from the sidebar or auto-created when connecting to a wire mid-span.
2. **Wire waypoints** — optional intermediate points stored on each Connection. Users add/drag/delete waypoints to control wire routing. Waypoints persist when components move; the path auto-adjusts between endpoints and waypoints.
3. **Auto-junction on wire drop** — when a wire is dropped on the middle of an existing wire (not on a pin), the app automatically creates a junction, splits the target wire, and connects everything.

## 1. Junction Component

### Model (`JunctionModel`)

- Type: `'junction'`
- 1 pin (bidirectional), 0 internal nodes, 0 branches
- Stamps nothing — purely a topology element (like GroundModel)
- All wires connected to its single pin share the same net via union-find

### Component Definition

- Category: `'passive'`
- Single pin at position `{x: 0, y: 0}`
- Schematic symbol: filled circle, 6px radius, `#333`
- Board symbol: filled circle, 6px radius, `#c4a24e`
- Dimensions: 20x20 (minimal footprint)
- No editable parameters, no `value` display

### UI Node (`JunctionNode`)

- Minimal custom React Flow node
- Single centered Handle accepting connections from any direction
- No selection border — just the dot
- Draggable like any other component

### Registration

- Sidebar: "Passive" category, labeled "Junction" with dot icon
- Worklet: `reg.register('junction', () => new JunctionModel())`
- Node types: `junction: JunctionNode`
- Main.tsx: `registry.register(junctionDefinition)`

## 2. Wire Waypoints

### Data Model

Add optional `waypoints` array to Connection:

```typescript
interface Connection {
  id: ConnectionId;
  from: { componentId: ComponentId; pinId: PinId };
  to: { componentId: ComponentId; pinId: PinId };
  net: NetId;
  waypoints?: { x: number; y: number }[];
}
```

Empty or undefined means auto-routed (current H→V→H behavior).

### Edge Rendering

When waypoints exist, the edge renders through them in order:
`source → waypoint[0] → waypoint[1] → ... → target`

Each segment uses orthogonal routing (H/V). The path generator:
1. From source to first waypoint: H then V (or V then H depending on relative position)
2. Between waypoints: same orthogonal routing
3. From last waypoint to target: same

Helper function: `generateWaypointPath(sourceX, sourceY, targetX, targetY, waypoints)` in `src/utils/wiring.ts`.

### Adding Waypoints

- Double-click on a wire segment to insert a waypoint at that position
- The waypoint appears as a small draggable diamond shape (4px, lighter color than junction dots)
- Inserted into the waypoints array between the two points that define the clicked segment

### Dragging Waypoints

- Drag a waypoint diamond to reposition it
- Updates the Connection's waypoints array via `updateConnection` (new CircuitContext action)
- Snaps to grid if snap-to-grid is enabled

### Deleting Waypoints

- Select a waypoint, press Delete/Backspace to remove it
- Wire re-routes through remaining waypoints

### Component Movement Behavior

- Waypoints are absolute positions — they don't move when components move
- Source/target endpoints move with their components (React Flow handles this)
- The orthogonal path from the new endpoint to the first waypoint adjusts automatically
- This gives "keep waypoints but auto-adjust" behavior

### Circuit Model Changes

Add `updateConnection` method to `Circuit` class (same pattern as `updateComponent`):

```typescript
updateConnection(connectionId: ConnectionId, updates: Partial<Connection>): Circuit
```

Add corresponding `UPDATE_CONNECTION` action to CircuitContext reducer.

## 3. Auto-Junction on Wire Drop

### Interaction Flow

User drags a wire from a pin and drops it on the middle of an existing wire (not on a pin):

1. App detects drop point is within ~15px of an existing wire segment
2. Creates a junction component at the drop position
3. Splits the target wire into two wires, both connecting through the junction
4. Connects the new wire to the junction

### Detection

Intercept React Flow's `onConnectEnd` event (fires when connection drag ends without connecting to a Handle). Convert mouse position to canvas coordinates. Test against all rendered wire paths:

For each edge, compute point-to-segment distance for each segment of the wire (including waypoints). If minimum distance < 15px, trigger auto-junction.

Helper function: `pointToSegmentDistance(px, py, x1, y1, x2, y2)` in `src/utils/wiring.ts`.

### Wire Splitting

When a junction is inserted on an existing wire:

1. Create junction component at hit point
2. Delete the original connection
3. Create Wire A: original source → junction pin
4. Create Wire B: junction pin → original target
5. Create Wire C: dragging source → junction pin
6. If the original wire had waypoints, split them based on which side of the hit point they fall on — waypoints before go to Wire A, waypoints after go to Wire B

Helper function: `splitConnectionAtPoint(connection, hitX, hitY, junctionId, junctionPinId)` in `src/utils/wiring.ts`.

### Visual Feedback

While dragging near a wire, highlight the target wire and show a preview dot at the closest point on the wire. This reuses the proximity detection logic.

## Files Changed

| File | Change |
|------|--------|
| `src/simulation/models/JunctionModel.ts` | Create — stamps nothing |
| `src/components/definitions/Junction.tsx` | Create — dot symbol, single pin |
| `src/views/CircuitCanvas/nodes/JunctionNode.tsx` | Create — minimal dot node |
| `src/views/CircuitCanvas/nodes/index.ts` | Add JunctionNode to nodeTypes |
| `src/simulation/worklet/processor.ts` | Register JunctionModel |
| `src/simulation/index.ts` | Export JunctionModel |
| `src/main.tsx` | Register junctionDefinition |
| `src/types/circuit.ts` | Add optional waypoints to Connection |
| `src/views/CircuitCanvas/edges/SchematicEdge.tsx` | Render through waypoints, waypoint handles |
| `src/views/CircuitCanvas/edges/BoardEdge.tsx` | Render through waypoints |
| `src/views/CircuitCanvas/useCircuitSync.ts` | Pass waypoints to edge data, handle updates |
| `src/views/CircuitCanvas/CircuitCanvas.tsx` | Add onConnectEnd for auto-junction |
| `src/context/CircuitContext.tsx` | Add updateConnection action |
| `src/models/Circuit.ts` | Add updateConnection method |
| `src/utils/wiring.ts` | Add generateWaypointPath, pointToSegmentDistance, splitConnectionAtPoint |
| `tests/simulation/models/JunctionModel.test.ts` | Create — stamps-nothing test |

## Testing

- JunctionModel unit test: verify 0 internal nodes, 0 branches, stamps nothing
- Waypoint path generation: verify orthogonal path through 1, 2, 3 waypoints
- Point-to-segment distance: verify detection at various distances and angles
- Wire split: verify waypoints are divided correctly between the two new wires
- Integration: verify junctions create correct net topology (all connected wires on same net)
