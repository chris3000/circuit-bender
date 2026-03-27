import { describe, it, expect } from 'vitest';
import { snapToGrid, gridDistance, snapPositionToGrid } from '@/utils/grid';

describe('Grid Utilities', () => {
  it('should snap coordinates to grid', () => {
    expect(snapToGrid(23, 10)).toBe(20);
    expect(snapToGrid(27, 10)).toBe(30);
    expect(snapToGrid(25, 10)).toBe(30);
    expect(snapToGrid(100, 20)).toBe(100);
  });

  it('should snap position to grid', () => {
    const pos = { x: 23, y: 47 };
    const snapped = snapPositionToGrid(pos, 10);

    expect(snapped.x).toBe(20);
    expect(snapped.y).toBe(50);
  });

  it('should calculate grid distance', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 30, y: 40 };

    expect(gridDistance(p1, p2)).toBe(50);
  });

  it('should handle negative coordinates', () => {
    expect(snapToGrid(-23, 10)).toBe(-20);
    expect(snapToGrid(-27, 10)).toBe(-30);
  });
});
