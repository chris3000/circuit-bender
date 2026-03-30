import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CircuitNodeData } from '../useCircuitSync';
import { pinTooltip } from './pinTooltip';

export const JunctionNode = memo(function JunctionNode({ data }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const fill = viewMode === 'schematic' ? '#333' : '#c4a24e';
  const pin = component.pins[0];

  return (
    <div style={{ width: 20, height: 20, position: 'relative', cursor: 'grab' }}>
      <svg width={20} height={20} viewBox="-10 -10 20 20" style={{ display: 'block', overflow: 'visible' }}>
        <circle cx="0" cy="0" r="5" fill={fill} />
      </svg>
      <Handle
        id={pin.id} type="source" position={Position.Top} isConnectable={true}
        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: 'transparent', border: 'none' }}
        title={pinTooltip(component.type, pin.label, pin.type)}
      />
      <Handle
        id={pin.id} type="target" position={Position.Top} isConnectable={true}
        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: 'transparent', border: 'none', opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  );
});
