import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CircuitNodeData } from '../useCircuitSync';

const LONG_PRESS_MS = 400;
const PROGRESS_RADIUS = 12;
const CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;

export const JunctionNode = memo(function JunctionNode({ data, selected, dragging }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const fill = viewMode === 'schematic' ? '#333' : '#c4a24e';
  const pin = component.pins[0];

  const [hovered, setHovered] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [progress, setProgress] = useState(0);
  const pressStart = useRef(0);
  const animFrame = useRef(0);

  const r = hovered || pressing ? 7 : 5;

  // Animate the radial progress during long press
  const animateProgress = useCallback(() => {
    const elapsed = Date.now() - pressStart.current;
    const pct = Math.min(elapsed / LONG_PRESS_MS, 1);
    setProgress(pct);
    if (pct < 1) {
      animFrame.current = requestAnimationFrame(animateProgress);
    } else {
      setUnlocked(true);
      setPressing(false);
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (unlocked) return; // already unlocked — let React Flow handle drag
    e.stopPropagation();
    e.preventDefault();
    pressStart.current = Date.now();
    setPressing(true);
    setProgress(0);
    animFrame.current = requestAnimationFrame(animateProgress);
  }, [unlocked, animateProgress]);

  const handlePointerUp = useCallback(() => {
    if (pressing) {
      cancelAnimationFrame(animFrame.current);
      setPressing(false);
      setProgress(0);
    }
  }, [pressing]);

  // Reset unlocked state when mouse leaves or drag ends
  useEffect(() => {
    if (!hovered && !dragging) {
      setUnlocked(false);
      setProgress(0);
    }
  }, [hovered, dragging]);

  // Clean up animation on unmount
  useEffect(() => () => cancelAnimationFrame(animFrame.current), []);

  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div
      style={{
        width: 12, height: 12, position: 'relative',
        cursor: unlocked ? 'move' : 'pointer',
        // Block React Flow drag until unlocked
        pointerEvents: unlocked ? 'auto' : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); handlePointerUp(); }}
      onPointerDown={unlocked ? undefined : handlePointerDown}
      onPointerUp={handlePointerUp}
      className={unlocked ? undefined : 'nopan nodrag'}
    >
      <svg width={12} height={12} viewBox="-6 -6 12 12" style={{ display: 'block', overflow: 'visible' }}>
        {/* Selection border */}
        {selected && (
          <rect x={-9} y={-9} width={18} height={18}
            fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="3 2" rx="3" />
        )}

        {/* Long-press radial progress */}
        {pressing && (
          <circle
            cx="0" cy="0" r={PROGRESS_RADIUS}
            fill="none" stroke="#FF2D55" strokeWidth="2"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90)"
            opacity="0.8"
          />
        )}

        {/* Unlocked glow */}
        {unlocked && !selected && (
          <circle cx="0" cy="0" r={PROGRESS_RADIUS} fill="none" stroke="#FF2D55" strokeWidth="1.5" opacity="0.5" />
        )}

        {/* Hover ring */}
        {hovered && !selected && !pressing && !unlocked && (
          <circle cx="0" cy="0" r="10" fill="none" stroke={fill} strokeWidth="1" opacity="0.4" />
        )}

        {/* The dot */}
        <circle cx="0" cy="0" r={r} fill={unlocked ? '#FF2D55' : fill}
          stroke={selected ? '#FF2D55' : hovered || pressing ? '#888' : 'none'}
          strokeWidth={selected || hovered || pressing ? 1 : 0}
        />
      </svg>

      {/* Target Handle — junctions receive wires, drag-to-connect lands here */}
      <Handle
        id={pin.id} type="target" position={Position.Left} isConnectable={true}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 16, height: 16, borderRadius: '50%',
          background: 'transparent', border: 'none',
        }}
        title="Wire junction — hold to move, drag wires here to connect"
      />
    </div>
  );
});
