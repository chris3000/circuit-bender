import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { solderBlob } from '@/components/art/partArt';
import type { CircuitNodeData } from '../useCircuitSync';

const SIZE = 30; // large hit area for easy grabbing
const HALF = SIZE / 2;
const DOT_R = 5;
const HANDLE_SIZE = 12; // small — just covers the dot for wiring

export const JunctionNode = memo(function JunctionNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const fill = viewMode === 'schematic' ? '#333' : '#D4ECD4';
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

        {/* Hover: show grab zone with move arrows (outer ring = move area) */}
        {hovered && !selected && (
          <g opacity="0.5">
            <circle cx="0" cy="0" r="13" fill="none" stroke={fill} strokeWidth="1" strokeDasharray="3 2" />
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

        {/* The dot: ink on the schematic, a blob of solder on the board */}
        {viewMode === 'board' ? (
          <>
            {solderBlob({})}
            {selected && <circle cx="0" cy="0" r={DOT_R} fill="none" stroke="#FF2D55" strokeWidth="1.5" />}
          </>
        ) : (
          <circle cx="0" cy="0" r={DOT_R} fill={fill}
            stroke={selected ? '#FF2D55' : 'none'}
            strokeWidth={selected ? 1.5 : 0}
          />
        )}
      </svg>

      {/* Source Handle — small, just covers the dot. Drag FROM dot = start wire. */}
      <Handle
        id={pin.id} type="source" position={Position.Left} isConnectable={true}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: HANDLE_SIZE, height: HANDLE_SIZE, borderRadius: '50%',
          background: 'transparent', border: 'none',
          cursor: 'crosshair',
        }}
        title="Drag from dot to wire — drag outer ring to move"
      />
      {/* Target Handle — same position, invisible, receives incoming wires */}
      <Handle
        id={pin.id} type="target" position={Position.Left} isConnectable={true}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: HANDLE_SIZE, height: HANDLE_SIZE, borderRadius: '50%',
          background: 'transparent', border: 'none',
          opacity: 0, pointerEvents: 'none',
        }}
      />
    </div>
  );
});
