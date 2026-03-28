import { memo, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import { parseValue, formatValue } from '@/utils/parameterParser';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(pinX: number, pinY: number, w: number, h: number): React.CSSProperties {
  return { position: 'absolute', left: `${pinX + w / 2}px`, top: `${pinY + h / 2}px`, transform: 'translate(-50%, -50%)' };
}
function getHandlePosition(pinX: number): Position {
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const EditableNode = memo(function EditableNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const { updateComponent } = useCircuit();
  const [editing, setEditing] = useState(false);
  const definition = useMemo(() => ComponentRegistry.getInstance().get(component.type), [component.type]);
  const paramKey = component.type === 'resistor' ? 'resistance' : 'capacitance';

  const handleDoubleClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); setEditing(true); }, []);
  const handleConfirm = useCallback((raw: string) => {
    const parsed = parseValue(raw);
    if (!isNaN(parsed)) {
      const display = formatValue(parsed, paramKey as 'resistance' | 'capacitance');
      updateComponent(component.id, { parameters: { ...component.parameters, [paramKey]: parsed, value: display } });
    }
    setEditing(false);
  }, [component, paramKey, updateComponent]);
  const handleCancel = useCallback(() => setEditing(false), []);

  if (!definition) return null;
  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'grab' }} onDoubleClick={handleDoubleClick}>
      <svg width={dims.width} height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}>
        {selected && <rect x={-dims.width/2-3} y={-dims.height/2-3} width={dims.width+6} height={dims.height+6} fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="4 2" rx="4" />}
        {symbol.render(component.parameters)}
      </svg>
      {editing && (
        <input autoFocus defaultValue={String(component.parameters.value || '')}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleConfirm((e.target as HTMLInputElement).value); if (e.key === 'Escape') handleCancel(); }}
          onBlur={handleCancel}
          style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', width: 80, height: 24, border: '1px solid #FF2D55', borderRadius: 3, padding: '2px 4px', fontSize: 12, textAlign: 'center', outline: 'none', background: 'white', zIndex: 10 }}
        />
      )}
      {component.pins.map((pin) => (
        <Handle key={pin.id} id={pin.id} type="source" position={getHandlePosition(pin.position.x)} isConnectable={true}
          style={{ ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height), width: 10, height: 10, borderRadius: '50%', background: viewMode === 'schematic' ? '#999' : '#c4a24e', border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030' }}
        />
      ))}
    </div>
  );
});
