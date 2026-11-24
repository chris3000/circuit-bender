import { memo, useCallback, useState } from 'react';
import type { NodeProps } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { KNOB_MIN_ANGLE, KNOB_SWEEP, knobPositionAt } from '@/components/art/knob';
import type { CircuitNodeData } from '../useCircuitSync';
import { rotatePin } from '../routing/layout';
import { NodeFrame } from './NodeFrame';

/** Where the schematic symbol's little knob sits, relative to the part's centre (before rotation). */
const KNOB = { x: 18, y: -14, r: 7 };
/** Pointer travel, in screen pixels, that takes the schematic knob from one end to the other. */
const KNOB_TRAVEL = 150;

/**
 * A potentiometer. The knob turns in both views: in the board view by
 * dragging around the dial, in the schematic by dragging the small knob up
 * and down. The audio engine sends the new position to the running
 * simulation as a live parameter, so turning it does not restart anything.
 */
export const PotentiometerNode = memo(function PotentiometerNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const { updateComponent } = useCircuit();
  const [turning, setTurning] = useState(false);
  const position = Math.max(0, Math.min(1, (component.parameters.position as number) ?? 0.5));

  /** Follow the pointer until it is released; `toPosition` maps a pointer event to a knob position. */
  const startTurn = useCallback((e: React.PointerEvent, toPosition: (move: PointerEvent) => number) => {
    e.stopPropagation();
    e.preventDefault();
    let first = true;
    let last = position;
    const onMove = (move: PointerEvent) => {
      const next = Math.max(0, Math.min(1, toPosition(move)));
      if (next === last) return;
      last = next;
      // One undo step for the whole turn, not one per pixel
      updateComponent(component.id, { parameters: { ...component.parameters, position: next } }, { record: first });
      first = false;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setTurning(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    setTurning(true);
  }, [component, position, updateComponent]);

  const handleDialDrag = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const turned = component.rotation || 0;
    // The dial is drawn turned with the part
    startTurn(e, (move) => knobPositionAt(move.clientX - cx, move.clientY - cy, turned));
  }, [startTurn, component.rotation]);

  const handleKnobDrag = useCallback((e: React.PointerEvent) => {
    const x0 = e.clientX, y0 = e.clientY, from = position;
    startTurn(e, (move) => from + ((move.clientX - x0) - (move.clientY - y0)) / KNOB_TRAVEL);
  }, [startTurn, position]);

  const percent = `${Math.round(position * 100)}%`;
  const knob = rotatePin(KNOB.x, KNOB.y, component.rotation || 0);
  const pointer = ((KNOB_MIN_ANGLE + position * KNOB_SWEEP) * Math.PI) / 180;

  const schematicKnob = viewMode === 'schematic' ? (
    <g>
      <circle cx={knob.x} cy={knob.y} r={KNOB.r} fill="#fff" stroke={turning ? '#FF2D55' : '#222'} strokeWidth="1.5" />
      <line x1={knob.x} y1={knob.y}
        x2={knob.x + Math.cos(pointer) * (KNOB.r - 1.5)} y2={knob.y + Math.sin(pointer) * (KNOB.r - 1.5)}
        stroke="#FF2D55" strokeWidth="2" strokeLinecap="round" />
      {turning && (
        <text x={knob.x} y={knob.y - KNOB.r - 4} textAnchor="middle" fontSize="9" fontWeight="bold"
          fontFamily="'Courier New', Courier, monospace" fill="#FF2D55">{percent}</text>
      )}
    </g>
  ) : null;

  return (
    <NodeFrame component={component} viewMode={viewMode} selected={selected} overlay={schematicKnob}>
      {viewMode === 'board' ? (
        <div className="nodrag" onPointerDown={handleDialDrag} title={`Drag around the dial to turn (${percent})`}
          style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 48, height: 48, borderRadius: '50%', cursor: 'grab' }} />
      ) : (
        <div className="nodrag" onPointerDown={handleKnobDrag} onDoubleClick={(e) => e.stopPropagation()}
          title={`Drag up or down to turn (${percent})`}
          style={{
            position: 'absolute', left: `calc(50% + ${knob.x}px)`, top: `calc(50% + ${knob.y}px)`,
            transform: 'translate(-50%, -50%)', width: 20, height: 20, borderRadius: '50%', cursor: 'ns-resize',
          }} />
      )}
    </NodeFrame>
  );
});
