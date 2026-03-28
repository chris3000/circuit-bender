import { describe, it, expect, beforeEach } from 'vitest';
import { BreadboardGrid } from '@/views/BreadboardView/autoPlace';

describe('BreadboardGrid', () => {
  let grid: BreadboardGrid;

  beforeEach(() => {
    grid = new BreadboardGrid();
  });

  it('should place first component at a starting position with row > 0 and column > 0', () => {
    const pos = grid.place('resistor', { rows: 1, columns: 4 });

    expect(pos.row).toBeGreaterThan(0);
    expect(pos.column).toBeGreaterThan(0);
  });

  it('should place components with gaps (second component offset by at least width + 1)', () => {
    const first = grid.place('resistor', { rows: 1, columns: 4 });
    const second = grid.place('resistor', { rows: 1, columns: 4 });

    expect(second.column).toBeGreaterThanOrEqual(first.column + 4 + 1);
  });

  it('should place ICs straddling center channel (row <= 5)', () => {
    const pos = grid.place('cd40106', { rows: 7, columns: 2 });

    expect(pos.row).toBeLessThanOrEqual(5);
  });

  it('should place LM741 ICs straddling center channel', () => {
    const pos = grid.place('lm741', { rows: 4, columns: 2 });

    expect(pos.row).toBeLessThanOrEqual(5);
  });

  it('should wrap to next row when full (15 resistors use multiple rows)', () => {
    const positions = [];
    for (let i = 0; i < 15; i++) {
      positions.push(grid.place('resistor', { rows: 1, columns: 4 }));
    }

    const uniqueRows = new Set(positions.map(p => p.row));
    expect(uniqueRows.size).toBeGreaterThan(1);
  });

  it('should reset all state when clear() is called', () => {
    grid.place('resistor', { rows: 1, columns: 4 });
    grid.place('resistor', { rows: 1, columns: 4 });
    grid.clear();

    const pos = grid.place('resistor', { rows: 1, columns: 4 });
    // After clear, should place at starting position again
    expect(pos.row).toBeGreaterThan(0);
    expect(pos.column).toBeGreaterThan(0);
  });

  it('should not overlap components', () => {
    const first = grid.place('capacitor', { rows: 1, columns: 2 });
    const second = grid.place('capacitor', { rows: 1, columns: 2 });

    // On the same row, columns should not overlap
    if (first.row === second.row) {
      expect(second.column).toBeGreaterThanOrEqual(first.column + 2);
    }
  });
});
