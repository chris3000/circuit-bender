import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CircuitNodeData } from '../useCircuitSync';
import { pinTooltip } from './pinTooltip';

export const JunctionNode = memo(function JunctionNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const fill = viewMode === 'schematic' ? '#333' : '#c4a24e';
  const pin = component.pins[0];
  const [hovered, setHovered] = useState(false);

  const r = hovered ? 7 : 5;

  return (
    <div
      style={{ width: 12, height: 12, position: 'relative', cursor: 'move' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg width={12} height={12} viewBox="-6 -6 12 12" style={{ display: 'block', overflow: 'visible' }}>
        {selected && (
          <rect x={-9} y={-9} width={18} height={18}
            fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="3 2" rx="3" />
        )}
        {hovered && !selected && (
          <circle cx="0" cy="0" r="10" fill="none" stroke={fill} strokeWidth="1" opacity="0.4" />
        )}
        <circle cx="0" cy="0" r={r} fill={fill}
          stroke={selected ? '#FF2D55' : hovered ? '#888' : 'none'}
          strokeWidth={selected || hovered ? 1 : 0}
          style={{ transition: 'r 0.1s ease' }}
        />
      </svg>
      {/* Target Handle only — junctions receive wires, never start them.
          This means drag = move (no conflict with wire initiation). */}
      <Handle
        id={pin.id} type="target" position={Position.Left} isConnectable={true}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 16, height: 16, borderRadius: '50%',
          background: 'transparent', border: 'none',
        }}
        title={pinTooltip(component.type, pin.label, pin.type)}
      />
    </div>
  );
});
