import { createContext, useContext, useMemo } from 'react';
import type { Component, Connection, Position2D } from '@/types/circuit';
import { routeWires, type RoutedWire, type RouterObstacle, type RouterPin } from './router';
import { componentObstacles, componentPins, pinKey, type ViewMode } from './layout';

export type WireRoutes = Map<string, RoutedWire>;

const NO_ROUTES: WireRoutes = new Map();

/** Routes for every wire on the canvas, by connection id. */
export const WireRoutesContext = createContext<WireRoutes>(NO_ROUTES);

export function useWireRoute(connectionId: string): RoutedWire | undefined {
  return useContext(WireRoutesContext).get(connectionId);
}

export interface PlacedComponent {
  component: Component;
  /** Where the part is right now, which during a drag is not where the circuit has it. */
  position: Position2D;
}

export function computeWireRoutes(placed: PlacedComponent[], connections: Connection[], viewMode: ViewMode): WireRoutes {
  const obstacles: RouterObstacle[] = [];
  const pins: RouterPin[] = [];
  for (const { component, position } of placed) {
    obstacles.push(...componentObstacles(component, position, viewMode));
    pins.push(...componentPins(component, position, viewMode));
  }
  const wires = connections.map(c => ({
    id: c.id,
    from: pinKey(c.from.componentId, c.from.pinId),
    to: pinKey(c.to.componentId, c.to.pinId),
  }));
  return routeWires(obstacles, pins, wires);
}

/**
 * Routes all wires, and again whenever something that affects them changes:
 * a part moves, turns or is renamed, or a wire is added or removed.
 */
export function useWireRoutes(placed: PlacedComponent[], connections: Connection[], viewMode: ViewMode): WireRoutes {
  // Selection, LED states and knob positions re-render the canvas constantly;
  // only re-route when the geometry is actually different
  const signature = useMemo(() => {
    const parts = placed.map(({ component: c, position: p }) =>
      `${c.id}:${c.type}:${p.x},${p.y}:${c.rotation || 0}:${c.label ?? ''}`);
    const wires = connections.map(c => `${c.id}:${c.from.componentId}.${c.from.pinId}>${c.to.componentId}.${c.to.pinId}`);
    return `${viewMode}|${parts.join('|')}|${wires.join('|')}`;
  }, [placed, connections, viewMode]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeWireRoutes(placed, connections, viewMode), [signature]);
}
