import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CircuitNodeData } from '../useCircuitSync';
import { pinTooltip } from './pinTooltip';

export const JunctionNode = memo(function JunctionNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const fill = viewMode === 'schematic' ? '#333' : '#c4a24e';
  const pin = component.pins[0];

  return (
    <div style={{ width: 12, height: 12, position: 'relative', cursor: 'move' }}>
      <svg width={12} height={12} viewBox="-6 -6 12 12" style={{ display: 'block', overflow: 'visible' }}>
        {selected && (
          <rect x={-9} y={-9} width={18} height={18}
            fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="3 2" rx="3" />
        )}
        <circle cx="0" cy="0" r="5" fill={fill} stroke={selected ? '#FF2D55' : 'none'} strokeWidth={selected ? 1 : 0} />
      </svg>
      <Handle
        id={pin.id} type="source" position={Position.Left} isConnectable={true}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 12, height: 12, borderRadius: '50%',
          background: 'transparent', border: 'none',
        }}
        title={pinTooltip(component.type, pin.label, pin.type)}
      />
      <Handle
        id={pin.id} type="target" position={Position.Left} isConnectable={true}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 12, height: 12, borderRadius: '50%',
          background: 'transparent', border: 'none',
          opacity: 0, pointerEvents: 'none',
        }}
      />
    </div>
  );
});
