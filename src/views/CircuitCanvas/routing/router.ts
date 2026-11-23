/**
 * Wire router for the circuit canvas.
 *
 * Every wire is routed on a 10px grid with a shortest-path search whose cost
 * says what a tidy schematic looks like:
 *
 *  - a wire does not pass through a part or its text,
 *  - wires of different nets never run on top of each other and never meet at
 *    a corner (either would read as a connection); they may cross at right
 *    angles, but crossings are expensive,
 *  - wires of the same net share track where they can, so a net is drawn as a
 *    trunk with branches rather than as a bundle of parallel lines,
 *  - a wire leaves a pin straight out of the part before it turns,
 *  - bends cost extra, so routes stay simple.
 *
 * All of these are costs rather than prohibitions, so a wire always gets a
 * route: in a layout with no room it takes the least bad one.
 *
 * Wires are routed one at a time, shortest first, each one seeing the wires
 * already placed. The result depends only on the geometry, not on the order
 * the wires were drawn in.
 */

export interface Point { x: number; y: number }
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** A rectangle wires should stay out of. Soft ones (text) are cheaper to cross than parts. */
export interface RouterObstacle {
  x: number; y: number; width: number; height: number;
  soft?: boolean;
}

export interface RouterPin {
  id: string;
  x: number; y: number;
  /** The way the pin points out of its part; null for a bare junction dot. */
  side: Side | null;
  /** The pin's own part. Its wire runs straight until it is clear of this. */
  body?: RouterObstacle;
}

export interface RouterWire { id: string; from: string; to: string }

export interface RoutedWire {
  /** Corners of the wire from the source pin to the target pin. */
  points: Point[];
  /** Places on this wire where three or more wires of its net meet. */
  dots: Point[];
}

export const GRID = 10;

/** Free cells kept around the circuit so wires can go around the outside. */
const MARGIN = 6;
/** Beyond this many grid points the canvas is too sparse to route as a whole. */
const MAX_POINTS = 600_000;
/** Wires keep at least this far (px) from the edge of a part. */
const CLEARANCE = 6;
/** A wire runs at least this far (px) straight out of a pin. */
const MIN_STUB = 10;
const MAX_STUB_CELLS = 8;

const STEP = 10;
/** A step along track this net already has. */
const REUSE = 2;
const BEND = 30;
/** Running right next to a part. */
const NEAR = 8;
/** Running right next to a parallel wire of another net. */
const BESIDE = 6;
const CROSS = 90;
const LABEL = 150;
const OVERLAP = 600;
const TOUCH = 600;
const FOREIGN_PIN = 600;
const BODY = 900;

const FREE = 0, NEAR_BODY = 1, TEXT = 2, PART = 3;

// Directions: 0 = +x, 1 = +y, 2 = −x, 3 = −y
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const SIDE_DIR: Record<Side, number> = { right: 0, bottom: 1, left: 2, top: 3 };

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number { return this.keys.length; }
  clear(): void { this.keys.length = 0; this.vals.length = 0; }

  push(key: number, val: number): void {
    const keys = this.keys, vals = this.vals;
    let i = keys.length;
    keys.push(key); vals.push(val);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent]; vals[i] = vals[parent];
      i = parent;
    }
    keys[i] = key; vals[i] = val;
  }

  pop(): number {
    const keys = this.keys, vals = this.vals;
    const top = vals[0];
    const key = keys.pop()!, val = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= key) break;
        keys[i] = keys[child]; vals[i] = vals[child];
        i = child;
      }
      keys[i] = key; vals[i] = val;
    }
    return top;
  }
}

interface PinInfo {
  net: number;
  /** Direction out of the part, or −1 for a junction dot. */
  dir: number;
  exact: Point;
  /** Grid points from the pin out to where the wire is free to turn. */
  stub: number[];
  body?: RouterObstacle;
}

function findRoot(parent: Map<string, string>, id: string): string {
  let root = id;
  while (parent.get(root) !== root) root = parent.get(root)!;
  let cur = id;
  while (cur !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
  return root;
}

export function routeWires(
  obstacles: RouterObstacle[],
  pins: RouterPin[],
  wires: RouterWire[],
): Map<string, RoutedWire> {
  const routed = new Map<string, RoutedWire>();
  const pinById = new Map<string, RouterPin>();
  for (const p of pins) pinById.set(p.id, p);
  const usable = wires.filter(w => w.from !== w.to && pinById.has(w.from) && pinById.has(w.to));
  if (usable.length === 0) return routed;

  // --- Nets: pins joined by wires, directly or through other pins ---
  const parent = new Map<string, string>();
  for (const w of usable) {
    if (!parent.has(w.from)) parent.set(w.from, w.from);
    if (!parent.has(w.to)) parent.set(w.to, w.to);
    parent.set(findRoot(parent, w.from), findRoot(parent, w.to));
  }
  const netIds = new Map<string, number>();
  const netOf = (pinId: string): number => {
    const root = findRoot(parent, pinId);
    let id = netIds.get(root);
    if (id === undefined) { id = netIds.size + 1; netIds.set(root, id); }
    return id;
  };

  // --- Grid: the wired pins, every part that reaches into that area, and a margin ---
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of parent.keys()) {
    const p = pinById.get(id)!;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pinBox = { minX, minY, maxX, maxY };
  for (const o of obstacles) {
    if (o.x > pinBox.maxX || o.x + o.width < pinBox.minX || o.y > pinBox.maxY || o.y + o.height < pinBox.minY) continue;
    minX = Math.min(minX, o.x); maxX = Math.max(maxX, o.x + o.width);
    minY = Math.min(minY, o.y); maxY = Math.max(maxY, o.y + o.height);
  }
  const originX = (Math.floor(minX / GRID) - MARGIN) * GRID;
  const originY = (Math.floor(minY / GRID) - MARGIN) * GRID;
  const cols = Math.ceil(maxX / GRID) + MARGIN - originX / GRID + 1;
  const rows = Math.ceil(maxY / GRID) + MARGIN - originY / GRID + 1;
  const count = cols * rows;
  if (count > MAX_POINTS) return routed;

  const kind = new Uint8Array(count);
  const hNet = new Int32Array(count);
  const vNet = new Int32Array(count);
  const pinNet = new Int32Array(count);

  const paint = (o: RouterObstacle, grow: number, value: number) => {
    const x0 = Math.max(0, Math.ceil((o.x - grow - originX) / GRID));
    const x1 = Math.min(cols - 1, Math.floor((o.x + o.width + grow - originX) / GRID));
    const y0 = Math.max(0, Math.ceil((o.y - grow - originY) / GRID));
    const y1 = Math.min(rows - 1, Math.floor((o.y + o.height + grow - originY) / GRID));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const i = gy * cols + gx;
        if (kind[i] < value) kind[i] = value;
      }
    }
  };
  for (const o of obstacles) {
    if (o.soft) {
      paint(o, 0, TEXT);
    } else {
      paint(o, CLEARANCE + GRID, NEAR_BODY);
      paint(o, CLEARANCE, PART);
    }
  }

  const clampX = (gx: number) => Math.max(0, Math.min(cols - 1, gx));
  const clampY = (gy: number) => Math.max(0, Math.min(rows - 1, gy));

  // --- Pins: where each one sits on the grid and the straight stub out of its part ---
  const pinInfo = new Map<string, PinInfo>();
  for (const id of parent.keys()) {
    const p = pinById.get(id)!;
    const net = netOf(id);
    const dir = p.side === null ? -1 : SIDE_DIR[p.side];
    const fx = (p.x - originX) / GRID, fy = (p.y - originY) / GRID;
    let gx: number, gy: number;
    if (dir === 0) { gx = Math.ceil(fx - 1e-6); gy = Math.round(fy); }
    else if (dir === 2) { gx = Math.floor(fx + 1e-6); gy = Math.round(fy); }
    else if (dir === 1) { gx = Math.round(fx); gy = Math.ceil(fy - 1e-6); }
    else if (dir === 3) { gx = Math.round(fx); gy = Math.floor(fy + 1e-6); }
    else { gx = Math.round(fx); gy = Math.round(fy); }
    gx = clampX(gx); gy = clampY(gy);

    const stub = [gy * cols + gx];
    if (dir >= 0) {
      // Straight out until clear of the pin's own part (whatever else is nearby)
      const body = p.body;
      const insideOwnPart = (cx: number, cy: number): boolean => {
        if (!body) return kind[cy * cols + cx] === PART;
        const x = originX + cx * GRID, y = originY + cy * GRID;
        return x >= body.x - CLEARANCE && x <= body.x + body.width + CLEARANCE
          && y >= body.y - CLEARANCE && y <= body.y + body.height + CLEARANCE;
      };
      for (let n = 0; n < MAX_STUB_CELLS; n++) {
        const out = Math.abs((gx - fx) * DX[dir] + (gy - fy) * DY[dir]) * GRID;
        if (!insideOwnPart(gx, gy) && out >= MIN_STUB - 1e-6) break;
        const nx = gx + DX[dir], ny = gy + DY[dir];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) break;
        gx = nx; gy = ny;
        stub.push(gy * cols + gx);
      }
    }
    pinInfo.set(id, { net, dir, exact: { x: p.x, y: p.y }, stub, body: p.body });
  }
  // A stub belongs to its net: nothing else may use those points
  for (const info of pinInfo.values()) {
    for (const i of info.stub) if (pinNet[i] === 0) pinNet[i] = info.net;
  }

  // --- Search state, reused across wires ---
  const GOAL = count * 4;
  const cost = new Int32Array(GOAL + 1);
  const cameFrom = new Int32Array(GOAL + 1);
  const seen = new Int32Array(GOAL + 1);
  const closed = new Int32Array(GOAL + 1);
  const heap = new MinHeap();
  let generation = 0;

  const search = (src: PinInfo, dst: PinInfo, net: number): number[] | null => {
    generation++;
    heap.clear();
    const start = src.stub[src.stub.length - 1];
    const target = dst.stub[dst.stub.length - 1];
    const tx = target % cols, ty = (target - tx) / cols;

    const open = (state: number, g: number, from: number, h: number) => {
      if (seen[state] === generation && cost[state] <= g) return;
      seen[state] = generation;
      cost[state] = g;
      cameFrom[state] = from;
      heap.push(g + h, state);
    };
    const sx = start % cols, sy = (start - sx) / cols;
    const h0 = STEP * (Math.abs(sx - tx) + Math.abs(sy - ty));
    if (src.dir >= 0) open(start * 4 + src.dir, 0, -1, h0);
    else for (let d = 0; d < 4; d++) open(start * 4 + d, 0, -1, h0);

    while (heap.size > 0) {
      const state = heap.pop();
      if (closed[state] === generation) continue;
      closed[state] = generation;
      if (state === GOAL) break;
      const g = cost[state];
      const p = state >> 2, d = state & 3;

      if (p === target) {
        // Finish by running down the target's stub; arriving from behind the pin is no use
        if (dst.dir < 0) open(GOAL, g, state, 0);
        else if (d !== dst.dir) open(GOAL, g + (d === (dst.dir + 2) % 4 ? 0 : BEND), state, 0);
        if (dst.dir < 0 || d !== dst.dir) continue;
      }

      const px = p % cols, py = (p - px) / cols;
      const hHere = hNet[p], vHere = vNet[p], pinHere = pinNet[p];
      const foreignHere = (hHere !== 0 && hHere !== net) || (vHere !== 0 && vHere !== net) || (pinHere !== 0 && pinHere !== net);
      const ownCorner = hHere === net && vHere === net;

      for (let d2 = 0; d2 < 4; d2++) {
        if (d2 === ((d + 2) & 3)) continue;
        const qx = px + DX[d2], qy = py + DY[d2];
        if (qx < 0 || qy < 0 || qx >= cols || qy >= rows) continue;
        const q = qy * cols + qx;
        const next = q * 4 + d2;
        if (closed[next] === generation) continue;

        const horizontal = (d2 & 1) === 0;
        const along = horizontal ? hNet[q] : vNet[q];
        const across = horizontal ? vNet[q] : hNet[q];
        const alongHere = horizontal ? hHere : vHere;

        let c = along === net && alongHere === net ? REUSE : STEP;
        if (d2 !== d) {
          // Turning on another net's wire would look like a connection
          if (foreignHere) c += TOUCH;
          if (!ownCorner) c += BEND;
        }
        if (along !== 0 && along !== net) c += OVERLAP;
        else if (across !== 0 && across !== net) c += CROSS;
        const pinThere = pinNet[q];
        if (pinThere !== 0 && pinThere !== net) c += FOREIGN_PIN;
        const k = kind[q];
        if (k === PART) { if (pinThere !== net) c += BODY; }
        else if (k === TEXT) c += LABEL;
        else if (k === NEAR_BODY) c += NEAR;
        if (along !== net) {
          // Keep a gap from parallel wires of other nets when there is room
          const sideA = horizontal ? q - cols : q - 1;
          const sideB = horizontal ? q + cols : q + 1;
          const lanes = horizontal ? hNet : vNet;
          if (horizontal ? qy > 0 : qx > 0) { const n = lanes[sideA]; if (n !== 0 && n !== net) c += BESIDE; }
          if (horizontal ? qy < rows - 1 : qx < cols - 1) { const n = lanes[sideB]; if (n !== 0 && n !== net) c += BESIDE; }
        }

        open(next, g + c, state, STEP * (Math.abs(qx - tx) + Math.abs(qy - ty)));
      }
    }

    if (closed[GOAL] !== generation) return null;
    const path: number[] = [];
    for (let s = cameFrom[GOAL]; s !== -1; s = cameFrom[s]) path.push(s >> 2);
    path.reverse();
    return path;
  };

  /**
   * Two pins that point at each other along one line, with nothing between
   * them but their own parts, are joined directly. (Their stubs may overlap
   * when the parts are close, which the search cannot express.)
   */
  const facingPins = (src: PinInfo, dst: PinInfo): number[] | null => {
    if (src.dir < 0 || dst.dir !== ((src.dir + 2) & 3)) return null;
    const a = src.stub[0], b = dst.stub[0];
    const ax = a % cols, ay = (a - ax) / cols, bx = b % cols, by = (b - bx) / cols;
    const steps = (bx - ax) * DX[src.dir] + (by - ay) * DY[src.dir];
    if (steps < 0 || (bx - ax) * DY[src.dir] !== 0 || (by - ay) * DX[src.dir] !== 0) return null;
    const inside = (body: RouterObstacle | undefined, x: number, y: number) => body !== undefined
      && x >= body.x - CLEARANCE && x <= body.x + body.width + CLEARANCE
      && y >= body.y - CLEARANCE && y <= body.y + body.height + CLEARANCE;
    const path: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const gx = ax + DX[src.dir] * i, gy = ay + DY[src.dir] * i;
      const p = gy * cols + gx;
      const x = originX + gx * GRID, y = originY + gy * GRID;
      const lane = (src.dir & 1) === 0 ? hNet[p] : vNet[p];
      if (lane !== 0 && lane !== src.net) return null;
      if (pinNet[p] !== 0 && pinNet[p] !== src.net) return null;
      if (kind[p] === PART && !inside(src.body, x, y) && !inside(dst.body, x, y)) return null;
      path.push(p);
    }
    return path;
  };

  // --- Route, shortest wires first ---
  const order = [...usable].sort((a, b) => {
    const pa = pinById.get(a.from)!, qa = pinById.get(a.to)!;
    const pb = pinById.get(b.from)!, qb = pinById.get(b.to)!;
    const la = Math.abs(pa.x - qa.x) + Math.abs(pa.y - qa.y);
    const lb = Math.abs(pb.x - qb.x) + Math.abs(pb.y - qb.y);
    return la - lb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });

  /** Which ways wires of a net leave each grid point: key = net * count + point. */
  const arms = new Map<number, number>();
  const gridPaths = new Map<string, number[]>();

  for (const w of order) {
    const src = pinInfo.get(w.from)!, dst = pinInfo.get(w.to)!;
    const net = src.net;
    let path = facingPins(src, dst);
    if (!path) {
      const middle = search(src, dst, net);
      if (!middle) continue;
      path = src.stub.slice(0, -1).concat(middle);
      for (let i = dst.stub.length - 2; i >= 0; i--) path.push(dst.stub[i]);
    }

    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (a === b) continue;
      const horizontal = Math.abs(b - a) === 1;
      const lanes = horizontal ? hNet : vNet;
      if (lanes[a] === 0) lanes[a] = net;
      if (lanes[b] === 0) lanes[b] = net;
      const d = b - a === 1 ? 0 : b - a === -1 ? 2 : b > a ? 1 : 3;
      const ka = net * count + a, kb = net * count + b;
      arms.set(ka, (arms.get(ka) ?? 0) | (1 << d));
      arms.set(kb, (arms.get(kb) ?? 0) | (1 << ((d + 2) & 3)));
    }
    gridPaths.set(w.id, path);
    routed.set(w.id, { points: toPolyline(path, src, dst, cols, originX, originY), dots: [] });
  }

  // --- Junction dots where a net branches ---
  const junctionPoints = new Set<number>();
  for (const info of pinInfo.values()) if (info.dir < 0) junctionPoints.add(info.net * count + info.stub[0]);
  const placed = new Set<number>();
  for (const w of order) {
    const path = gridPaths.get(w.id);
    if (!path) continue;
    const net = pinInfo.get(w.from)!.net;
    const wire = routed.get(w.id)!;
    for (const p of path) {
      const key = net * count + p;
      if (placed.has(key) || junctionPoints.has(key)) continue;
      const mask = arms.get(key) ?? 0;
      const n = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
      if (n < 3) continue;
      placed.add(key);
      const gx = p % cols, gy = (p - gx) / cols;
      wire.dots.push(nearestOnPolyline(wire.points, { x: originX + gx * GRID, y: originY + gy * GRID }));
    }
  }

  return routed;
}

/** Corners of a grid path, with the two ends moved onto the pins' exact positions. */
function toPolyline(
  path: number[], src: PinInfo, dst: PinInfo,
  cols: number, originX: number, originY: number,
): Point[] {
  const at = (i: number): Point => {
    const gx = i % cols;
    return { x: originX + gx * GRID, y: originY + ((i - gx) / cols) * GRID };
  };
  const pts: Point[] = [];
  for (let i = 0; i < path.length; i++) {
    if (i > 0 && path[i] === path[i - 1]) continue;
    const p = at(path[i]);
    const n = pts.length;
    if (n >= 2) {
      const a = pts[n - 2], b = pts[n - 1];
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) { pts[n - 1] = p; continue; }
    }
    pts.push(p);
  }
  const s = src.exact, t = dst.exact;
  if (pts.length < 2) return [{ ...s }, { ...t }];

  if (pts.length === 2) {
    // One straight run between two pins that may not be exactly in line
    const horizontal = pts[0].y === pts[1].y;
    const off = horizontal ? t.y - s.y : t.x - s.x;
    if (Math.abs(off) <= 2) return [{ ...s }, { ...t }];
    if (horizontal) {
      const mx = Math.round((s.x + t.x) / 2 / GRID) * GRID;
      return [{ ...s }, { x: mx, y: s.y }, { x: mx, y: t.y }, { ...t }];
    }
    const my = Math.round((s.y + t.y) / 2 / GRID) * GRID;
    return [{ ...s }, { x: s.x, y: my }, { x: t.x, y: my }, { ...t }];
  }

  // The first and last runs move sideways onto their pins; everything between stays on the grid
  const last = pts.length - 1;
  const startHorizontal = pts[0].y === pts[1].y;
  const endHorizontal = pts[last].y === pts[last - 1].y;
  pts[1] = startHorizontal ? { x: pts[1].x, y: s.y } : { x: s.x, y: pts[1].y };
  pts[last - 1] = endHorizontal ? { x: pts[last - 1].x, y: t.y } : { x: t.x, y: pts[last - 1].y };
  pts[0] = { ...s };
  pts[last] = { ...t };
  return pts;
}

function nearestOnPolyline(points: Point[], p: Point): Point {
  let best = points[0], bestDist = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
    const c = { x: a.x + dx * t, y: a.y + dy * t };
    const dist = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}
