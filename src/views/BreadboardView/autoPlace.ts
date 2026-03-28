import type { BreadboardPosition } from '@/types/circuit';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { BOARD_COLUMNS, ROWS_TOP } from './BreadboardRenderer';

export class BreadboardGrid {
  private occupied: Set<string> = new Set();
  private nextColumn = 2; // Start with some margin
  private nextRow = 1;

  private key(row: number, col: number): string {
    return `${row}:${col}`;
  }

  private isAvailable(row: number, col: number, rows: number, cols: number): boolean {
    for (let r = row; r < row + rows; r++) {
      for (let c = col; c < col + cols; c++) {
        if (this.occupied.has(this.key(r, c))) return false;
        if (c > BOARD_COLUMNS) return false;
      }
    }
    return true;
  }

  private markOccupied(row: number, col: number, rows: number, cols: number): void {
    for (let r = row; r < row + rows; r++) {
      for (let c = col; c < col + cols; c++) {
        this.occupied.add(this.key(r, c));
      }
    }
  }

  place(type: string, dimensions: { rows: number; columns: number }): BreadboardPosition {
    const { rows, columns } = dimensions;

    // ICs straddle the center channel
    const registry = ComponentRegistry.getInstance();
    const def = registry.get(type);
    const isIC = def?.metadata.category === 'ic';

    if (isIC) {
      return this.placeIC(rows, columns);
    }

    return this.placeGeneral(rows, columns);
  }

  private placeIC(rows: number, columns: number): BreadboardPosition {
    // ICs straddle center: place so they span rows across the channel
    const startRow = ROWS_TOP - Math.floor(rows / 2);

    for (let col = 2; col <= BOARD_COLUMNS - columns; col++) {
      if (this.isAvailable(startRow, col, rows, columns)) {
        this.markOccupied(startRow, col, rows, columns);
        return { row: startRow, column: col };
      }
    }

    // Fallback
    this.markOccupied(startRow, this.nextColumn, rows, columns);
    return { row: startRow, column: this.nextColumn };
  }

  private placeGeneral(rows: number, columns: number): BreadboardPosition {
    // Try current row first
    for (let row = this.nextRow; row <= ROWS_TOP; row++) {
      for (let col = (row === this.nextRow ? this.nextColumn : 2); col <= BOARD_COLUMNS - columns; col++) {
        if (this.isAvailable(row, col, rows, columns)) {
          this.markOccupied(row, col, rows, columns);
          this.nextColumn = col + columns + 1; // Gap of 1
          this.nextRow = row;

          // Wrap if next position would be off the board
          if (this.nextColumn > BOARD_COLUMNS - 4) {
            this.nextColumn = 2;
            this.nextRow = row + rows + 1;
          }

          return { row, column: col };
        }
      }
      // Move to next row
      this.nextColumn = 2;
    }

    // Fallback: use bottom side of board
    const fallbackRow = ROWS_TOP + 1;
    this.markOccupied(fallbackRow, 2, rows, columns);
    return { row: fallbackRow, column: 2 };
  }

  clear(): void {
    this.occupied.clear();
    this.nextColumn = 2;
    this.nextRow = 1;
  }
}
