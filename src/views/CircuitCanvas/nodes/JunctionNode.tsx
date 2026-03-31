import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CircuitNodeData } from '../useCircuitSync';

const SIZE = 30; // large hit area for easy grabbing
const HALF = SIZE / 2;

export const JunctionNode = memo(function JunctionNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const fill = viewMode === 'schematic' ? '#333' : '#c4a24e';
  const pin = component.pins[0];
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ width: SIZE, height: SIZE, position: 'relative', cursor: 'move' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg width={SIZE} height={SIZE} viewBox={`-${HALF} -${HALF} ${SIZE} ${SIZE}`}
        style={{ display: 'block', overflow: 'visible' }}>

        {/* Hover: show grab zone with move arrows */}
        {hovered && !selected && (
          <g opacity="0.5">
            <circle cx="0" cy="0" r="13" fill="none" stroke={fill} strokeWidth="1" strokeDasharray="3 2" />
            {/* Small move arrows */}
            <line x1="0" y1="-9" x2="0" y2="-13" stroke={fill} strokeWidth="1.2" />
            <line x1="-2" y1="-11" x2="0" y2="-13" stroke={fill} strokeWidth="1.2" />
            <line x1="2" y1="-11" x2="0" y2="-13" stroke={fill} strokeWidth="1.2" />
            <line x1="0" y1="9" x2="0" y2="13" stroke={fill} strokeWidth="1.2" />
            <line x1="-2" y1="11" x2="0" y2="13" stroke={fill} strokeWidth="1.2" />
            <line x1="2" y1="11" x2="0" y2="13" stroke={fill} strokeWidth="1.2" />
            <line x1="-9" y1="0" x2="-13" y2="0" stroke={fill} strokeWidth="1.2" />
            <line x1="-11" y1="-2" x2="-13" y2="0" stroke={fill} strokeWidth="1.2" />
            <line x1="-11" y1="2" x2="-13" y2="0" stroke={fill} strokeWidth="1.2" />
            <line x1="9" y1="0" x2="13" y2="0" stroke={fill} strokeWidth="1.2" />
            <line x1="11" y1="-2" x2="13" y2="0" stroke={fill} strokeWidth="1.2" />
            <line x1="11" y1="2" x2="13" y2="0" stroke={fill} strokeWidth="1.2" />
          </g>
        )}

        {/* Selection border */}
        {selected && (
          <rect x={-HALF + 1} y={-HALF + 1} width={SIZE - 2} height={SIZE - 2}
            fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="3 2" rx="4" />
        )}

        {/* The dot */}
        <circle cx="0" cy="0" r="5" fill={fill}
          stroke={selected ? '#FF2D55' : 'none'}
          strokeWidth={selected ? 1.5 : 0}
        />
      </svg>

      {/* Target Handle — centered, covers the dot area for wire drops */}
      <Handle
        id={pin.id} type="target" position={Position.Left} isConnectable={true}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 14, height: 14, borderRadius: '50%',
          background: 'transparent', border: 'none',
        }}
        title="Junction — drag to move, drop wires here to connect"
      />
    </div>
  );
});
