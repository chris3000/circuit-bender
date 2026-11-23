/**
 * Geometry of a part on the canvas: where its pins are and which way they
 * point, how much room the symbol takes, and where its name label goes.
 *
 * The node components draw from this and the wire router avoids it, so the
 * two always agree.
 */
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component, Position2D } from '@/types/circuit';
import type { RouterObstacle, RouterPin, Side } from './router';

export type ViewMode = 'schematic' | 'board';

export interface Box { left: number; top: number; right: number; bottom: number }

/** Rotate a pin position by a component's rotation (0, 90, 180, 270 degrees). */
export function rotatePin(x: number, y: number, rotation: number): Position2D {
  switch (((rotation % 360) + 360) % 360) {
    case 90: return { x: -y, y: x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: y, y: -x };
    default: return { x, y };
  }
}

/** Swap width/height for 90° and 270° rotations. */
export function rotateDimensions(
  width: number, height: number, rotation: number,
): { width: number; height: number } {
  const r = ((rotation % 360) + 360) % 360;
  return (r === 90 || r === 270) ? { width: height, height: width } : { width, height };
}

/**
 * The side of its part a pin points out of: the edge of the symbol's box it
 * is nearest to. (x, y) is the pin's offset from the centre and the box is
 * width × height, both after rotation.
 */
export function pinSide(x: number, y: number, width: number, height: number): Side {
  const toLeft = x + width / 2, toRight = width / 2 - x;
  const toTop = y + height / 2, toBottom = height / 2 - y;
  const nearest = Math.min(toLeft, toRight, toTop, toBottom);
  if (nearest === toLeft) return 'left';
  if (nearest === toRight) return 'right';
  return nearest === toTop ? 'top' : 'bottom';
}

/** Where each pin of a part is (relative to its centre) and which way it points, in the given view. */
export function pinLayout(component: Component, viewMode: ViewMode): Array<{ id: string; x: number; y: number; side: Side }> {
  const definition = ComponentRegistry.getInstance().get(component.type);
  const rotation = component.rotation || 0;
  const raw = definition ? definition[viewMode].dimensions : { width: 0, height: 0 };
  const { width, height } = rotateDimensions(raw.width, raw.height, rotation);
  return component.pins.map((pin) => {
    const p = rotatePin(pin.position.x, pin.position.y, rotation);
    return { id: pin.id, x: p.x, y: p.y, side: pinSide(p.x, p.y, width, height) };
  });
}

export function pinKey(componentId: string, pinId: string): string {
  return `${componentId}::${pinId}`;
}

/** Everything the symbol draws, relative to the part's centre: its box plus any text beyond it. */
export function symbolBounds(component: Component, viewMode: ViewMode): Box | null {
  const definition = ComponentRegistry.getInstance().get(component.type);
  if (!definition) return null;
  const view = definition[viewMode];
  const { width, height } = view.dimensions;
  const o = view.overhang ?? {};
  const a = rotatePin(-width / 2 - (o.left ?? 0), -height / 2 - (o.top ?? 0), component.rotation || 0);
  const b = rotatePin(width / 2 + (o.right ?? 0), height / 2 + (o.bottom ?? 0), component.rotation || 0);
  return {
    left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y),
  };
}

export const LABEL_FONT_SIZE = 10;
const LABEL_CHAR_WIDTH = 6.1;
const LABEL_HEIGHT = 12;
const LABEL_GAP = 3;

export interface LabelPlacement {
  /** Box relative to the part's centre. */
  box: Box;
  align: 'center' | 'left' | 'right';
}

/**
 * Where a name of the given text goes: on the first side of the part that has
 * no pins (below, above, right, left), clear of the symbol's own text.
 */
export function labelPlacement(component: Component, viewMode: ViewMode, text: string): LabelPlacement | null {
  const bounds = symbolBounds(component, viewMode);
  if (!bounds || component.type === 'junction') return null;
  const used = new Set<Side>(pinLayout(component, viewMode).map(p => p.side));
  const width = Math.ceil(text.length * LABEL_CHAR_WIDTH) + 4;
  const side = (['bottom', 'top', 'right', 'left'] as Side[]).find(s => !used.has(s)) ?? 'bottom';
  switch (side) {
    case 'bottom':
      return { align: 'center', box: { left: -width / 2, right: width / 2, top: bounds.bottom + LABEL_GAP, bottom: bounds.bottom + LABEL_GAP + LABEL_HEIGHT } };
    case 'top':
      return { align: 'center', box: { left: -width / 2, right: width / 2, top: bounds.top - LABEL_GAP - LABEL_HEIGHT, bottom: bounds.top - LABEL_GAP } };
    case 'right':
      return { align: 'left', box: { left: bounds.right + LABEL_GAP, right: bounds.right + LABEL_GAP + width, top: -LABEL_HEIGHT / 2, bottom: LABEL_HEIGHT / 2 } };
    default:
      return { align: 'right', box: { left: bounds.left - LABEL_GAP - width, right: bounds.left - LABEL_GAP, top: -LABEL_HEIGHT / 2, bottom: LABEL_HEIGHT / 2 } };
  }
}

/** What the router has to keep wires out of for one part at the given position. */
export function componentObstacles(component: Component, position: Position2D, viewMode: ViewMode): RouterObstacle[] {
  // A junction is only a dot on a wire
  if (component.type === 'junction') return [];
  const bounds = symbolBounds(component, viewMode);
  if (!bounds) return [];
  const obstacles: RouterObstacle[] = [{
    x: position.x + bounds.left, y: position.y + bounds.top,
    width: bounds.right - bounds.left, height: bounds.bottom - bounds.top,
  }];
  const label = component.label ? labelPlacement(component, viewMode, component.label) : null;
  if (label) {
    obstacles.push({
      x: position.x + label.box.left, y: position.y + label.box.top,
      width: label.box.right - label.box.left, height: label.box.bottom - label.box.top,
      soft: true,
    });
  }
  return obstacles;
}

export function componentPins(component: Component, position: Position2D, viewMode: ViewMode): RouterPin[] {
  const body = componentObstacles(component, position, viewMode).find(o => !o.soft);
  return pinLayout(component, viewMode).map((pin) => ({
    id: pinKey(component.id, pin.id),
    x: position.x + pin.x,
    y: position.y + pin.y,
    side: component.type === 'junction' ? null : pin.side,
    body,
  }));
}
