import { useMemo } from 'react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component, Connection } from '@/types/circuit';
import { computeWireRoutes } from '@/views/CircuitCanvas/routing/useWireRoutes';
import { LABEL_FONT_SIZE, labelPlacement, pinLayout, symbolBounds } from '@/views/CircuitCanvas/routing/layout';

interface ExampleDrawingProps {
  components: Component[];
  connections: Connection[];
  /** The part the example is about: it is ringed. */
  featured?: string;
}

const MARGIN = 14;

/**
 * A circuit drawn small and still: the schematic as the canvas would show
 * it, with the same symbols and the same wire routes, but nothing to click.
 * It is how an example is seen before it is opened.
 */
export function ExampleDrawing({ components, connections, featured }: ExampleDrawingProps) {
  const drawn = useMemo(() => {
    const routes = computeWireRoutes(components.map((component) => ({ component, position: component.position })), connections, 'schematic');
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const take = (x: number, y: number) => {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    };
    for (const part of components) {
      const { x, y } = part.position;
      const bounds = symbolBounds(part, 'schematic');
      if (bounds) { take(x + bounds.left, y + bounds.top); take(x + bounds.right, y + bounds.bottom); }
      const label = part.label ? labelPlacement(part, 'schematic', part.label) : null;
      if (label) { take(x + label.box.left, y + label.box.top); take(x + label.box.right, y + label.box.bottom); }
    }
    for (const route of routes.values()) for (const point of route.points) take(point.x, point.y);
    if (!Number.isFinite(left)) { left = 0; top = 0; right = 100; bottom = 60; }
    return { routes, box: { x: left - MARGIN, y: top - MARGIN, width: right - left + 2 * MARGIN, height: bottom - top + 2 * MARGIN } };
  }, [components, connections]);

  const registry = ComponentRegistry.getInstance();
  const { routes, box } = drawn;
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} role="img" aria-label="The example's circuit"
      preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: '100%' }}>
      {[...routes.entries()].map(([id, route]) => (
        <g key={id}>
          <polyline points={route.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#333" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
          {route.dots.map((dot) => <circle key={`${dot.x},${dot.y}`} cx={dot.x} cy={dot.y} r={3.5} fill="#333" />)}
        </g>
      ))}
      {components.map((part) => {
        const definition = registry.get(part.type);
        if (!definition) return null;
        const rotation = part.rotation || 0;
        const bounds = symbolBounds(part, 'schematic');
        const label = part.label ? labelPlacement(part, 'schematic', part.label) : null;
        return (
          <g key={part.id} transform={`translate(${part.position.x} ${part.position.y})`}>
            {part.id === featured && bounds && (
              <rect x={bounds.left - 5} y={bounds.top - 5} width={bounds.right - bounds.left + 10} height={bounds.bottom - bounds.top + 10}
                rx={6} fill="rgba(255, 45, 85, 0.08)" stroke="#FF2D55" strokeWidth={2} strokeDasharray="5 3" />
            )}
            <g transform={rotation ? `rotate(${rotation})` : undefined}
              className={rotation === 90 || rotation === 180 ? 'symbol-upright-text' : undefined}>
              {definition.schematic.symbol.render(part.parameters)}
            </g>
            {pinLayout(part, 'schematic').map((pin) => <circle key={pin.id} cx={pin.x} cy={pin.y} r={3} fill="#999" stroke="#666" strokeWidth={1} />)}
            {label && (
              <text x={label.align === 'center' ? 0 : label.align === 'left' ? label.box.left + 2 : label.box.right - 2}
                y={(label.box.top + label.box.bottom) / 2} dominantBaseline="central"
                textAnchor={label.align === 'center' ? 'middle' : label.align === 'left' ? 'start' : 'end'}
                fontFamily="'Courier New', Courier, monospace" fontSize={LABEL_FONT_SIZE} fontWeight={700} fill="#FF2D55">
                {part.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
