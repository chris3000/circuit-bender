import type { Component } from '@/types/circuit';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';

export const HOLE_SPACING = 10;
export const BOARD_PADDING = 20;
export const BOARD_COLUMNS = 63;
export const ROWS_TOP = 5;
export const ROWS_BOTTOM = 5;
export const CHANNEL_GAP = 16;
export const HOLE_RADIUS = 2;

export class BreadboardRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  boardPosition(row: number, column: number): { x: number; y: number } {
    const x = BOARD_PADDING + (column - 1) * HOLE_SPACING;
    let y: number;
    if (row <= ROWS_TOP) {
      y = BOARD_PADDING + (row - 1) * HOLE_SPACING;
    } else {
      y = BOARD_PADDING + (ROWS_TOP - 1) * HOLE_SPACING + CHANNEL_GAP + (row - ROWS_TOP - 1) * HOLE_SPACING;
    }
    return { x, y };
  }

  renderBoard(): void {
    const ctx = this.ctx;
    const boardWidth = BOARD_PADDING * 2 + (BOARD_COLUMNS - 1) * HOLE_SPACING;
    const totalRows = ROWS_TOP + ROWS_BOTTOM;
    const boardHeight = BOARD_PADDING * 2 + (totalRows - 2) * HOLE_SPACING + CHANNEL_GAP;

    // Outer background
    ctx.fillStyle = '#F5E6C8';
    ctx.fillRect(0, 0, boardWidth, boardHeight);

    // Board area
    ctx.fillStyle = '#E8D5B0';
    ctx.fillRect(BOARD_PADDING / 2, BOARD_PADDING / 2, boardWidth - BOARD_PADDING, boardHeight - BOARD_PADDING);

    // Power rails (top)
    this.renderPowerRail(BOARD_PADDING, BOARD_PADDING / 2 - 4, 'red');
    this.renderPowerRail(BOARD_PADDING, BOARD_PADDING / 2 + 2, 'blue');

    // Power rails (bottom)
    this.renderPowerRail(BOARD_PADDING, boardHeight - BOARD_PADDING / 2 - 2, 'red');
    this.renderPowerRail(BOARD_PADDING, boardHeight - BOARD_PADDING / 2 + 4, 'blue');

    // Hole grid - top rows (a-e)
    for (let row = 1; row <= ROWS_TOP; row++) {
      for (let col = 1; col <= BOARD_COLUMNS; col++) {
        const pos = this.boardPosition(row, col);
        this.renderHole(pos.x, pos.y);
      }
    }

    // Center channel
    const channelY = BOARD_PADDING + (ROWS_TOP - 1) * HOLE_SPACING + HOLE_SPACING / 2;
    ctx.fillStyle = '#C4A882';
    ctx.fillRect(BOARD_PADDING / 2, channelY, boardWidth - BOARD_PADDING, CHANNEL_GAP - HOLE_SPACING + 6);

    // Hole grid - bottom rows (f-j)
    for (let row = ROWS_TOP + 1; row <= ROWS_TOP + ROWS_BOTTOM; row++) {
      for (let col = 1; col <= BOARD_COLUMNS; col++) {
        const pos = this.boardPosition(row, col);
        this.renderHole(pos.x, pos.y);
      }
    }
  }

  private renderPowerRail(startX: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.setLineDash([4, 2]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + (BOARD_COLUMNS - 1) * HOLE_SPACING, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Holes along the rail
    for (let col = 1; col <= BOARD_COLUMNS; col += 2) {
      const x = startX + (col - 1) * HOLE_SPACING;
      this.renderHole(x, y);
    }
  }

  private renderHole(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.arc(x, y, HOLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  renderComponent(component: Component): void {
    const ctx = this.ctx;
    const registry = ComponentRegistry.getInstance();
    const definition = registry.get(component.type);

    if (!definition) return;

    const pos = this.boardPosition(
      component.position.breadboard.row,
      component.position.breadboard.column
    );

    ctx.save();
    ctx.translate(pos.x, pos.y);
    definition.breadboard.renderer(ctx, component.parameters);
    ctx.restore();
  }

  renderWire(
    fromPos: { x: number; y: number },
    toPos: { x: number; y: number },
    color: string
  ): void {
    const ctx = this.ctx;
    const midX = (fromPos.x + toPos.x) / 2;
    const midY = Math.max(fromPos.y, toPos.y) + 8;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);
    ctx.quadraticCurveTo(midX, midY, toPos.x, toPos.y);
    ctx.stroke();
  }

  getWireColor(componentId: string, components: Map<string, Component>): string {
    const component = components.get(componentId);
    if (!component) return '#4169E1';

    const registry = ComponentRegistry.getInstance();
    const definition = registry.get(component.type);
    if (!definition) return '#4169E1';

    if (definition.metadata.category === 'power') return '#FF0000';

    // Check pin types
    const hasPowerPin = component.pins.some((p) => p.type === 'power');
    const hasGroundPin = component.pins.some((p) => p.type === 'ground');

    if (definition.type === 'power-supply' || hasPowerPin) return '#FF0000';
    if (definition.type === 'ground' || hasGroundPin) return '#000000';

    return '#4169E1';
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }
}
