# Board Wire Routing: Obstacle-Aware Curved Paths

## Problem
Board view wires use simple quadratic Bezier curves that pass through components. Wires should route around component bounding boxes like real PCB traces, while maintaining a smooth curved aesthetic.

## Design

### New file: `src/utils/boardRouting.ts`

**Obstacle grid:**
- 50x40 cells (20px each) covering the 1000x800 board area
- Component bounding boxes (from `definition.board.dimensions`) padded by 10px mark cells as blocked
- Components connected by the current wire are excluded from obstacles

**A* pathfinding:**
- 8-directional movement (orthogonal + diagonal) on the grid
- Manhattan distance heuristic
- Returns array of grid cell coordinates
- Diagonal moves cost sqrt(2), orthogonal cost 1

**Path simplification:**
- Remove collinear intermediate points, keeping only turn waypoints
- Ensures minimal control points for smooth curves

**Catmull-Rom to SVG:**
- Convert waypoints to cubic Bezier segments using Catmull-Rom interpolation
- Tension parameter ~0.5 for natural wire curves
- Output as SVG `d` attribute string (M + C commands)

**Fallback:**
- If A* finds no path, fall back to the current simple Bezier curve
- If start/end are in the same or adjacent cells, use direct curve

### Changes to `BoardWire.tsx`
- Accept optional `pathData` prop (pre-computed SVG path string)
- If `pathData` provided, use it; otherwise fall back to `generateCurvedPath()`

### Changes to `BoardView.tsx`
- Compute obstacle grid once, memoized on components array
- For each connection, run pathfinder and generate SVG path
- Memoize per-connection paths on [connections, components]
- Pass `pathData` to each `BoardWire`

### Performance
- Grid: 2000 cells, A* is sub-ms per wire
- Recomputes only when components or connections change
- Typical circuits have <20 wires
