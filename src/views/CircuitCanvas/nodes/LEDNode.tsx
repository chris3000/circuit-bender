import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(pinX: number, pinY: number, w: number, h: number): React.CSSProperties {
  return { position: 'absolute', left: `${pinX + w / 2}px`, top: `${pinY + h / 2}px`, transform: 'translate(-50%, -50%)' };
}
function getHandlePosition(pinX: number): Position {
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const LEDNode = memo(function LEDNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode, ledOn } = data;
  const definition = useMemo(() => ComponentRegistry.getInstance().get(component.type), [component.type]);
  if (!definition) return null;
  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'grab' }}>
      <svg width={dims.width} height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <filter id="ledGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {selected && <rect x={-dims.width/2-3} y={-dims.height/2-3} width={dims.width+6} height={dims.height+6} fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="4 2" rx="4" />}
        {ledOn && (<><circle cx="0" cy="0" r="20" fill="#FF2D55" opacity="0.15" filter="url(#ledGlow)" /><circle cx="0" cy="0" r="12" fill="#FF2D55" opacity="0.3" /></>)}
        {symbol.render(component.parameters)}
      </svg>
      {component.pins.flatMap((pin) => {
        const handleStyle = { ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height), width: 10, height: 10, borderRadius: '50%', background: viewMode === 'schematic' ? '#999' : '#c4a24e', border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030' };
        const pos = getHandlePosition(pin.position.x);
        return [
          <Handle key={`${pin.id}-src`} id={pin.id} type="source" position={pos} isConnectable={true} style={handleStyle} />,
          <Handle key={`${pin.id}-tgt`} id={pin.id} type="target" position={pos} isConnectable={true} style={{ ...handleStyle, opacity: 0, pointerEvents: 'none' }} />,
        ];
      })}
    </div>
  );
});
