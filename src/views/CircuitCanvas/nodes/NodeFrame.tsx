import { useMemo, type ReactNode } from 'react';
import { Handle, Position } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component } from '@/types/circuit';
import { labelPlacement, pinLayout, rotateDimensions, symbolBounds, type ViewMode } from '../routing/layout';
import type { Side } from '../routing/router';
import { pinTooltip } from './pinTooltip';
import { RotateButton, ROTATE_BUTTON_SIZE } from './RotateButton';
import { NodeLabel } from './NodeLabel';
import { OVERLOADED, useInstruments } from '@/views/Instruments';

const HANDLE_POSITION: Record<Side, Position> = {
  left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom,
};

interface NodeFrameProps {
  component: Component;
  viewMode: ViewMode;
  selected: boolean;
  cursor?: string;
  onSymbolClick?: (e: React.MouseEvent) => void;
  /** SVG drawn behind the symbol, not rotated with it. */
  underlay?: ReactNode;
  /** SVG drawn over the symbol, not rotated with it. */
  overlay?: ReactNode;
  /** HTML placed over the node (editors, drag targets). */
  children?: ReactNode;
}

/** What every part on the canvas has: its symbol, selection outline, rotate button, name and pins. */
export function NodeFrame({
  component, viewMode, selected, cursor = 'grab', onSymbolClick, underlay, overlay, children,
}: NodeFrameProps) {
  const definition = useMemo(() => ComponentRegistry.getInstance().get(component.type), [component.type]);
  const overloaded = useInstruments().overloaded.has(component.id);
  if (!definition) return null;
  const symbol = definition[viewMode].symbol;
  const raw = definition[viewMode].dimensions;
  const rotation = component.rotation || 0;
  const { width, height } = rotateDimensions(raw.width, raw.height, rotation);

  // The rotate button sits diagonally off a corner of the symbol: outside
  // everything the symbol draws (pins, knob, value text), and at the bottom
  // corner when the part's name is along the top
  let rotateButton: ReactNode = null;
  if (selected) {
    const bounds = symbolBounds(component, viewMode) ?? { left: -width / 2, right: width / 2, top: -height / 2, bottom: height / 2 };
    const nameOnTop = (labelPlacement(component, viewMode, component.label || '+ name')?.box.bottom ?? 1) <= bounds.top;
    const GAP = 5;
    rotateButton = (
      <RotateButton componentId={component.id} rotation={rotation}
        left={width / 2 + bounds.right + GAP}
        top={nameOnTop ? height / 2 + bounds.bottom + GAP : height / 2 + bounds.top - GAP - ROTATE_BUTTON_SIZE} />
    );
  }

  return (
    <div style={{ width, height, position: 'relative', cursor }}>
      {rotateButton}
      <svg
        width={width} height={height}
        viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}
        style={{ display: 'block', overflow: 'visible' }}
        onClick={onSymbolClick}
      >
        {selected && (
          <rect x={-width / 2 - 3} y={-height / 2 - 3} width={width + 6} height={height + 6}
            fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="4 2" rx="4" />
        )}
        {underlay}
        <g transform={rotation ? `rotate(${rotation})` : undefined}
          className={rotation === 90 || rotation === 180 ? 'symbol-upright-text' : undefined}>
          {symbol.render(component.parameters)}
        </g>
        {overlay}
      </svg>
      {children}
      {overloaded && (
        // Driven harder than a real one would stand: the app carries on, and says so
        <div role="img" data-testid="overload-mark" aria-label={`Overloaded. ${definition.overload ?? OVERLOADED}`}
          title={definition.overload ?? OVERLOADED}
          style={{
            position: 'absolute', left: -9, top: -11, width: 16, height: 16, borderRadius: '50%', zIndex: 5,
            background: '#FF2D55', color: 'white', border: '1.5px solid white', boxSizing: 'border-box',
            font: "bold 11px/13px 'Courier New', Courier, monospace", textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)', cursor: 'help',
          }}>!</div>
      )}
      <NodeLabel component={component} viewMode={viewMode} selected={selected} width={width} height={height} />
      {pinLayout(component, viewMode).flatMap((p, index) => {
        const pin = component.pins[index];
        const style: React.CSSProperties = {
          position: 'absolute',
          left: `${p.x + width / 2}px`,
          top: `${p.y + height / 2}px`,
          transform: 'translate(-50%, -50%)',
          width: 10, height: 10, borderRadius: '50%',
          background: viewMode === 'schematic' ? '#999' : '#c4a24e',
          border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030',
        };
        const position = HANDLE_POSITION[p.side];
        return [
          <Handle key={`${pin.id}-src`} id={pin.id} type="source" position={position} isConnectable={true}
            style={style} title={pinTooltip(component.type, pin.label, pin.type)} />,
          <Handle key={`${pin.id}-tgt`} id={pin.id} type="target" position={position} isConnectable={true}
            style={{ ...style, opacity: 0, pointerEvents: 'none' }} />,
        ];
      })}
    </div>
  );
}
