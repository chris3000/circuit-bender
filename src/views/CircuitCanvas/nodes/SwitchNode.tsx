import { memo, useMemo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(pinX: number, pinY: number, w: number, h: number): React.CSSProperties {
  return { position: 'absolute', left: `${pinX + w / 2}px`, top: `${pinY + h / 2}px`, transform: 'translate(-50%, -50%)' };
}
function getHandlePosition(pinX: number): Position {
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const SwitchNode = memo(function SwitchNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode, onPotChange } = data;
  const { updateComponent } = useCircuit();
  const definition = useMemo(() => ComponentRegistry.getInstance().get(component.type), [component.type]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const currentClosed = (component.parameters.closed as number) >= 1;
    const newClosed = currentClosed ? 0 : 1;
    updateComponent(component.id, { parameters: { ...component.parameters, closed: newClosed } });
    if (onPotChange) onPotChange(component.id, newClosed);
  }, [component, updateComponent, onPotChange]);

  if (!definition) return null;
  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'pointer' }}>
      <svg width={dims.width} height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}
        onClick={handleClick}>
        {selected && <rect x={-dims.width/2-3} y={-dims.height/2-3} width={dims.width+6} height={dims.height+6} fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="4 2" rx="4" />}
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
