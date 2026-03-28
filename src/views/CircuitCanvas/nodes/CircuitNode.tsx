import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(
  pinX: number, pinY: number, symbolWidth: number, symbolHeight: number,
): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${pinX + symbolWidth / 2}px`,
    top: `${pinY + symbolHeight / 2}px`,
    transform: 'translate(-50%, -50%)',
  };
}

function getHandlePosition(pinX: number): Position {
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const CircuitNode = memo(function CircuitNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const definition = useMemo(() => ComponentRegistry.getInstance().get(component.type), [component.type]);
  if (!definition) return null;
  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

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
        {symbol.render(component.parameters)}
      </svg>
      {component.pins.map((pin) => (
        <Handle key={pin.id} id={pin.id} type="source"
          position={getHandlePosition(pin.position.x)} isConnectable={true}
          style={{
            ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height),
            width: 10, height: 10, borderRadius: '50%',
            background: viewMode === 'schematic' ? '#999' : '#c4a24e',
            border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030',
          }}
        />
      ))}
    </div>
  );
});
