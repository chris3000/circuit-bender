import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { NodeProps } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { KNOB_MIN_ANGLE, KNOB_SWEEP } from '@/components/art/knob';
import type { CircuitNodeData } from '../useCircuitSync';
import { rotatePin } from '../routing/layout';
import { NodeFrame } from './NodeFrame';

const KNOB_RADIUS = 7;
/** Pointer travel, in screen pixels, that takes a knob from one end to the other. */
const KNOB_TRAVEL = 150;
/** ...and a touch from its lightest to its firmest. */
const TOUCH_TRAVEL = 100;
/** The part of a symbol that is pressed; the rest of it still drags the part. */
const PRESS_SIZE = 24;
const FONT = "'Courier New', Courier, monospace";

const unit = (value: number) => Math.max(0, Math.min(1, value));

/**
 * A part with a control of its own on the canvas, as its definition says
 * (`control`): a small knob beside the symbol, dragged up and down like the
 * potentiometer's, or the symbol itself held down. The audio engine sends
 * the change to the running simulation as a live parameter.
 */
export const ControlNode = memo(function ControlNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const { updateComponent } = useCircuit();
  const control = ComponentRegistry.getInstance().get(component.type)?.control;
  const [active, setActive] = useState(false);
  const latest = useRef(component);
  latest.current = component;

  const set = useCallback((value: number, record: boolean) => {
    if (!control) return false;
    const now = latest.current;
    if (now.parameters[control.parameter] === value) return false;
    updateComponent(now.id, { parameters: { ...now.parameters, [control.parameter]: value } }, { record });
    return true;
  }, [control, updateComponent]);

  /** Follow the pointer until it is let go. */
  const follow = useCallback((e: React.PointerEvent, onMove: (move: PointerEvent) => void, onEnd?: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setActive(false);
      onEnd?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    setActive(true);
  }, []);

  // Something held is let go if the part leaves the canvas under the finger
  const holding = useRef(false);
  useEffect(() => () => { if (holding.current) set(0, false); }, [set]);

  if (!control) return <NodeFrame component={component} viewMode={viewMode} selected={selected} />;

  if (control.kind === 'hold') {
    const held = control.held ?? 1;
    const value = Number(component.parameters[control.parameter] ?? 0);
    const press = (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const y0 = e.clientY;
      holding.current = true;
      // Pressing and letting go are not edits: there is nothing to undo
      set(held, false);
      follow(e, (move) => {
        if (held < 1) set(Math.round(Math.max(0.05, unit(held + (y0 - move.clientY) / TOUCH_TRAVEL)) * 100) / 100, false);
      }, () => { holding.current = false; set(0, false); });
    };
    const hint = held < 1
      ? `${control.name}: press and hold; drag up to press harder${value > 0 ? ` (${Math.round(value * 100)}%)` : ''}`
      : `${control.name}: press and hold`;
    return (
      <NodeFrame component={component} viewMode={viewMode} selected={selected}>
        <div className="nodrag" onPointerDown={press} title={hint} data-testid="node-hold" data-held={value > 0}
          style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: PRESS_SIZE, height: PRESS_SIZE, borderRadius: 8, cursor: 'pointer', touchAction: 'none',
          }} />
      </NodeFrame>
    );
  }

  const position = unit(Number(component.parameters[control.parameter] ?? control.rest ?? 0));
  const at = rotatePin(control.at?.x ?? 0, control.at?.y ?? 0, component.rotation || 0);
  const percent = `${Math.round(position * 100)}%`;
  const pointer = ((KNOB_MIN_ANGLE + position * KNOB_SWEEP) * Math.PI) / 180;
  const ink = viewMode === 'schematic' ? '#222' : '#D4ECD4';

  const turn = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, from = position;
    let first = true;
    // One undo step for the whole turn, not one per pixel
    follow(e, (move) => {
      const next = Math.round(unit(from + ((move.clientX - x0) - (move.clientY - y0)) / KNOB_TRAVEL) * 100) / 100;
      if (set(next, first)) first = false;
    });
  };

  const knob = (
    <g data-testid="node-dial" data-position={position}>
      <circle cx={at.x} cy={at.y} r={KNOB_RADIUS} fill="#fff" stroke={active ? '#FF2D55' : '#222'} strokeWidth="1.5" />
      <line x1={at.x} y1={at.y}
        x2={at.x + Math.cos(pointer) * (KNOB_RADIUS - 1.5)} y2={at.y + Math.sin(pointer) * (KNOB_RADIUS - 1.5)}
        stroke="#FF2D55" strokeWidth="2" strokeLinecap="round" />
      {(control.print || active) && (
        <text x={at.x} y={at.y + KNOB_RADIUS + 8} textAnchor="middle" fontSize="6.5" fontWeight="bold" fontFamily={FONT}
          fill={active || position > 0 && control.print ? '#FF2D55' : ink}>
          {active || (control.print && position > 0) ? percent : control.print}
        </text>
      )}
    </g>
  );

  return (
    <NodeFrame component={component} viewMode={viewMode} selected={selected} overlay={knob}>
      <div className="nodrag" onPointerDown={turn} onDoubleClick={(e) => e.stopPropagation()}
        title={`${control.name}: drag up or down (${percent})`}
        style={{
          position: 'absolute', left: `calc(50% + ${at.x}px)`, top: `calc(50% + ${at.y}px)`,
          transform: 'translate(-50%, -50%)', width: 20, height: 20, borderRadius: '50%', cursor: 'ns-resize', touchAction: 'none',
        }} />
    </NodeFrame>
  );
});
