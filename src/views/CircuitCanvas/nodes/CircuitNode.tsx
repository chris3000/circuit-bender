import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { CircuitNodeData } from '../useCircuitSync';
import { pinTooltip } from './pinTooltip';
import { rotatePin, rotateDimensions } from './rotatePin';

function pinPositionToHandleStyle(
  pinX: number, pinY: number, w: number, h: number,
): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${pinX + w / 2}px`,
    top: `${pinY + h / 2}px`,
    transform: 'translate(-50%, -50%)',
  };
}

function getHandlePosition(pinX: number, pinY: number): Position {
  // Pick the dominant axis for the handle direction
  if (Math.abs(pinX) >= Math.abs(pinY)) {
    return pinX < 0 ? Position.Left : Position.Right;
  }
  return pinY < 0 ? Position.Top : Position.Bottom;
}

export const CircuitNode = memo(function CircuitNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const definition = useMemo(() => ComponentRegistry.getInstance().get(component.type), [component.type]);
  if (!definition) return null;
  const symbol = definition[viewMode].symbol;
  const rawDims = definition[viewMode].dimensions;
  const rotation = component.rotation || 0;
  const dims = rotateDimensions(rawDims.width, rawDims.height, rotation);

  return (
    <div style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'grab' }}>
      <svg
        width={dims.width} height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {selected && (
          <rect x={-dims.width / 2 - 3} y={-dims.height / 2 - 3}
            width={dims.width + 6} height={dims.height + 6}
            fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="4 2" rx="4" />
        )}
        <g transform={rotation ? `rotate(${rotation})` : undefined}>
          {symbol.render(component.parameters)}
        </g>
      </svg>
      {component.pins.flatMap((pin) => {
        const rp = rotatePin(pin.position.x, pin.position.y, rotation);
        const handleStyle = {
          ...pinPositionToHandleStyle(rp.x, rp.y, dims.width, dims.height),
          width: 10, height: 10, borderRadius: '50%',
          background: viewMode === 'schematic' ? '#999' : '#c4a24e',
          border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030',
        };
        const pos = getHandlePosition(rp.x, rp.y);
        const tooltip = pinTooltip(component.type, pin.label, pin.type);
        return [
          <Handle key={`${pin.id}-src`} id={pin.id} type="source" position={pos} isConnectable={true} style={handleStyle} title={tooltip} />,
          <Handle key={`${pin.id}-tgt`} id={pin.id} type="target" position={pos} isConnectable={true} style={{ ...handleStyle, opacity: 0, pointerEvents: 'none' }} />,
        ];
      })}
    </div>
  );
});
