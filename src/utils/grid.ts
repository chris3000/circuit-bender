import type { Position2D } from '@/types/circuit';

export const GRID_SIZE = 20; // Default grid spacing in pixels

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
