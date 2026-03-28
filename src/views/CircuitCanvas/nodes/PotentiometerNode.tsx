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

export const PotentiometerNode = memo(function PotentiometerNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode, onPotChange } = data;
  const { updateComponent } = useCircuit();
  const definition = useMemo(() => ComponentRegistry.getInstance().get(component.type), [component.type]);

  const handleDialDrag = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - centerX;
      const dy = moveEvent.clientY - centerY;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      let normalized = (angle + 135) / 270;
      normalized = Math.max(0, Math.min(1, normalized));
      updateComponent(component.id, { parameters: { ...component.parameters, position: normalized } });
      if (onPotChange) onPotChange(component.id, normalized);
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [component, updateComponent, onPotChange]);

  if (!definition) return null;
  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'grab' }}>
      <svg width={dims.width} height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}>
        {selected && <rect x={-dims.width/2-3} y={-dims.height/2-3} width={dims.width+6} height={dims.height+6} fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="4 2" rx="4" />}
        {symbol.render(component.parameters)}
      </svg>
      {viewMode === 'board' && (
        <div onPointerDown={handleDialDrag} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 48, height: 48, borderRadius: '50%', cursor: 'grab' }} />
      )}
      {component.pins.map((pin) => (
        <Handle key={pin.id} id={pin.id} type="source" position={getHandlePosition(pin.position.x)} isConnectable={true}
          style={{ ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height), width: 10, height: 10, borderRadius: '50%', background: viewMode === 'schematic' ? '#999' : '#c4a24e', border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030' }}
        />
      ))}
    </div>
  );
});
