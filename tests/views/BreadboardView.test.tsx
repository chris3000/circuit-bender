import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CircuitProvider } from '@/context/CircuitContext';
import { BreadboardRenderer, BOARD_PADDING, HOLE_SPACING, ROWS_TOP, CHANNEL_GAP } from '@/views/BreadboardView/BreadboardRenderer';
import BreadboardView from '@/views/BreadboardView/BreadboardView';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component, ComponentId, PinId } from '@/types/circuit';

function createMockContext(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    canvas: { width: 800, height: 600 },
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    quadraticCurveTo: vi.fn(),
    setLineDash: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createMockComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: 'comp_test1' as ComponentId,
    type: 'resistor',
    position: {
      schematic: { x: 0, y: 0 },
      breadboard: { row: 1, column: 5 },
    },
    rotation: 0,
    parameters: { resistance: 1000 },
    pins: [
      { id: 'pin1' as PinId, label: 'A', type: 'bidirectional', position: { x: 0, y: 0 } },
      { id: 'pin2' as PinId, label: 'B', type: 'bidirectional', position: { x: 10, y: 0 } },
    ],
    state: { voltages: new Map(), currents: new Map() },
    ...overrides,
  };
}

describe('BreadboardRenderer', () => {
  let ctx: CanvasRenderingContext2D;
  let renderer: BreadboardRenderer;

  beforeEach(() => {
    ctx = createMockContext();
    renderer = new BreadboardRenderer(ctx);
  });

  describe('renderBoard', () => {
    it('should call fillRect to draw the board background', () => {
      renderer.renderBoard();
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('should draw holes using arc', () => {
      renderer.renderBoard();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('should draw center channel', () => {
      renderer.renderBoard();
      // The center channel is drawn with fillStyle '#C4A882'
      const fillRectCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      // At least 3 fillRect calls: outer bg, board, channel
      expect(fillRectCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('boardPosition', () => {
    it('should calculate position for top rows', () => {
      const pos = renderer.boardPosition(1, 1);
      expect(pos.x).toBe(BOARD_PADDING);
      expect(pos.y).toBe(BOARD_PADDING);
    });

    it('should calculate position for top row with offset', () => {
      const pos = renderer.boardPosition(3, 5);
      expect(pos.x).toBe(BOARD_PADDING + 4 * HOLE_SPACING);
      expect(pos.y).toBe(BOARD_PADDING + 2 * HOLE_SPACING);
    });

    it('should add channel gap for bottom rows', () => {
      const topPos = renderer.boardPosition(ROWS_TOP, 1);
      const bottomPos = renderer.boardPosition(ROWS_TOP + 1, 1);
      expect(bottomPos.y - topPos.y).toBe(CHANNEL_GAP);
    });
  });

  describe('renderComponent', () => {
    it('should call save/translate/restore when rendering a registered component', () => {
      const registry = ComponentRegistry.getInstance();
      registry.clear();

      const mockRenderer = vi.fn();
      registry.register({
        type: 'resistor',
        metadata: { name: 'Resistor', category: 'passive', description: 'A resistor' },
        pins: [],
        defaultParameters: { resistance: 1000 },
        schematic: { symbol: { width: 60, height: 20, render: () => null }, dimensions: { width: 60, height: 20 } },
        breadboard: { renderer: mockRenderer, dimensions: { rows: 1, columns: 4 } },
        simulate: () => ({}),
      });

      const component = createMockComponent();
      renderer.renderComponent(component);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.translate).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
      expect(mockRenderer).toHaveBeenCalledWith(ctx, component.parameters);

      registry.clear();
    });

    it('should not render if component type is not registered', () => {
      const registry = ComponentRegistry.getInstance();
      registry.clear();

      const component = createMockComponent({ type: 'unknown-type' });
      renderer.renderComponent(component);

      expect(ctx.save).not.toHaveBeenCalled();
    });
  });

  describe('renderWire', () => {
    it('should draw a quadratic bezier curve', () => {
      const from = { x: 30, y: 30 };
      const to = { x: 70, y: 40 };

      renderer.renderWire(from, to, '#4169E1');

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalledWith(30, 30);
      expect(ctx.quadraticCurveTo).toHaveBeenCalledWith(50, 48, 70, 40); // midX=50, midY=max(30,40)+8=48
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });

  describe('getWireColor', () => {
    beforeEach(() => {
      const registry = ComponentRegistry.getInstance();
      registry.clear();
    });

    afterEach(() => {
      ComponentRegistry.getInstance().clear();
    });

    it('should return red for power category components', () => {
      const registry = ComponentRegistry.getInstance();
      registry.register({
        type: 'power-supply',
        metadata: { name: 'Power Supply', category: 'power', description: 'Power' },
        pins: [],
        defaultParameters: {},
        schematic: { symbol: { width: 20, height: 20, render: () => null }, dimensions: { width: 20, height: 20 } },
        breadboard: { renderer: vi.fn(), dimensions: { rows: 1, columns: 1 } },
        simulate: () => ({}),
      });

      const component = createMockComponent({ id: 'pwr1' as ComponentId, type: 'power-supply', pins: [] });
      const components = new Map([['pwr1', component]]);

      expect(renderer.getWireColor('pwr1', components)).toBe('#FF0000');
    });

    it('should return black for ground components', () => {
      const registry = ComponentRegistry.getInstance();
      registry.register({
        type: 'ground',
        metadata: { name: 'Ground', category: 'passive', description: 'Ground' },
        pins: [{ id: 'gnd' as PinId, label: 'GND', type: 'ground', position: { x: 0, y: 0 } }],
        defaultParameters: {},
        schematic: { symbol: { width: 20, height: 20, render: () => null }, dimensions: { width: 20, height: 20 } },
        breadboard: { renderer: vi.fn(), dimensions: { rows: 1, columns: 1 } },
        simulate: () => ({}),
      });

      const component = createMockComponent({
        id: 'gnd1' as ComponentId,
        type: 'ground',
        pins: [{ id: 'gnd' as PinId, label: 'GND', type: 'ground', position: { x: 0, y: 0 } }],
      });
      const components = new Map([['gnd1', component]]);

      expect(renderer.getWireColor('gnd1', components)).toBe('#000000');
    });

    it('should return blue for other components', () => {
      const registry = ComponentRegistry.getInstance();
      registry.register({
        type: 'resistor',
        metadata: { name: 'Resistor', category: 'passive', description: 'Resistor' },
        pins: [],
        defaultParameters: { resistance: 1000 },
        schematic: { symbol: { width: 60, height: 20, render: () => null }, dimensions: { width: 60, height: 20 } },
        breadboard: { renderer: vi.fn(), dimensions: { rows: 1, columns: 4 } },
        simulate: () => ({}),
      });

      const component = createMockComponent();
      const components = new Map([['comp_test1', component]]);

      expect(renderer.getWireColor('comp_test1', components)).toBe('#4169E1');
    });

    it('should return blue for unknown component ids', () => {
      const components = new Map<string, Component>();
      expect(renderer.getWireColor('nonexistent', components)).toBe('#4169E1');
    });
  });

  describe('clear', () => {
    it('should call clearRect', () => {
      renderer.clear();
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });
  });
});

describe('BreadboardView', () => {
  beforeEach(() => {
    // Mock canvas getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(createMockContext());
  });

  it('should render canvas element', () => {
    render(
      <CircuitProvider>
        <BreadboardView />
      </CircuitProvider>
    );

    const canvas = screen.getByTestId('breadboard-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName.toLowerCase()).toBe('canvas');
  });

  it('should render container with correct test id', () => {
    render(
      <CircuitProvider>
        <BreadboardView />
      </CircuitProvider>
    );

    const container = screen.getByTestId('breadboard-container');
    expect(container).toBeInTheDocument();
  });
});
