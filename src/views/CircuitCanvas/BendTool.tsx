import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore, useStoreApi } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { isTextField } from '@/utils/keyboard';
import type { ViewMode } from './routing/layout';
import type { WireRoutes } from './routing/useWireRoutes';
import { BEND_KINDS, bendScene, bendTargetAt, canBend, keptBend, type BendKind, type BendPoint, type BendTarget } from './bend';
import styles from './BendTool.module.css';

/** A bend as the simulation is told of it. */
export interface Bend { from: BendPoint; to: BendPoint; ohms: number }

interface BendToolProps {
  /** The canvas: presses on it that land on metal start a jumper. */
  surface: RefObject<HTMLElement>;
  viewMode: ViewMode;
  routes: WireRoutes;
  /** Whether the circuit is running: a bend is only heard if it is. */
  playing: boolean;
  /** Make the bend in the running circuit, or let go of it (null). */
  onBend: (bend: Bend | null) => void;
  onClose: () => void;
}

/** How near the pointer has to be to a pin or wire, in screen pixels. */
const REACH = 14;

interface Held { from: BendTarget; to: BendTarget | null; x: number; y: number }

/**
 * The bend tool. While it is on, pressing on any pin or wire picks up one end
 * of a jumper; dragging to another pin or wire and holding there joins the
 * two in the running circuit, and letting go takes the jumper away again —
 * the way a circuit is explored with a clip lead before anything is soldered.
 *
 * A bend worth keeping can be put into the circuit as a switch or a push
 * button between the same two points.
 */
export function BendTool({ surface, viewMode, routes, playing, onBend, onClose }: BendToolProps) {
  const { circuit, addParts } = useCircuit();
  const flow = useStoreApi();
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const [kind, setKind] = useState<BendKind>('wire');
  const [hover, setHover] = useState<BendTarget | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  /** The last jumper that joined two things: it can be kept. */
  const [last, setLast] = useState<{ from: BendTarget; to: BendTarget; ohms: number } | null>(null);

  const scene = useMemo(
    () => bendScene(circuit.getComponents(), circuit.getConnections(), routes, viewMode),
    [circuit, routes, viewMode],
  );
  const ohms = BEND_KINDS.find((k) => k.id === kind)!.ohms;

  // The listeners are put on once; they read what is current from here
  const now = useRef({ scene, ohms, onBend });
  now.current = { scene, ohms, onBend };

  // Esc puts the tool down wherever the keyboard happens to be
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTextField(e.target) || document.querySelector('[aria-modal="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A bend that was found on another circuit is not one of this circuit's
  useEffect(() => setLast(null), [circuit.id]);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    let from: BendTarget | null = null;
    let joined: BendTarget | null = null;
    const targetAt = (e: PointerEvent | MouseEvent) => {
      // Where the pointer is on the canvas, exactly: React Flow's own conversion snaps to the grid
      // parts sit on, which is coarser than a pin
      const { transform: [x, y, z], domNode } = flow.getState();
      const box = (domNode ?? element).getBoundingClientRect();
      const at = { x: (e.clientX - box.left - x) / z, y: (e.clientY - box.top - y) / z };
      return { at, target: bendTargetAt(now.current.scene, at.x, at.y, REACH / z) };
    };
    const join = (to: BendTarget | null) => {
      const next = to && canBend(from, to) ? to : null;
      const same = (next === null && joined === null)
        || (next !== null && joined !== null && next.net === joined.net);
      joined = next;
      if (!same) now.current.onBend(next && from ? { from: from.point, to: next.point, ohms: now.current.ohms } : null);
      return next;
    };
    const onMove = (e: PointerEvent) => {
      const { at, target } = targetAt(e);
      if (!from) { setHover(target); return; }
      const to = join(target);
      if (to) setLast({ from, to, ohms: now.current.ohms });
      setHeld({ from, to, x: to ? to.x : at.x, y: to ? to.y : at.y });
    };
    const onUp = () => {
      if (!from) return;
      join(null);
      from = null;
      setHeld(null);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // The tool's own buttons, and everything else that is not the canvas, work as usual
      if ((e.target as HTMLElement).closest('[data-bend-ignore]')) return;
      const { at, target } = targetAt(e);
      if (!target || target.dead) return; // not on metal: the canvas pans as usual
      // Otherwise the press is the tool's: it must not also start a wire or move a part
      e.preventDefault();
      e.stopPropagation();
      from = target;
      joined = null;
      setHover(null);
      setHeld({ from, to: null, x: at.x, y: at.y });
    };
    // A press the tool took must not reach React Flow as a mouse event either
    const onMouseDown = (e: MouseEvent) => { if (from) { e.preventDefault(); e.stopPropagation(); } };
    const onLeave = () => setHover(null);
    element.addEventListener('pointerdown', onDown, true);
    element.addEventListener('mousedown', onMouseDown, true);
    element.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      element.removeEventListener('pointerdown', onDown, true);
      element.removeEventListener('mousedown', onMouseDown, true);
      element.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      // Put down with a jumper still in hand: let go of it
      if (joined) now.current.onBend(null);
    };
  }, [surface, flow]);

  /** Put the last bend into the circuit for good, as a part between the same two points. */
  const keep = (type: 'switch' | 'pushbutton') => {
    if (!last) return;
    const kept = keptBend(last.from, last.to, last.ohms, type, circuit.getComponents(), viewMode);
    if (!kept) return;
    addParts(kept.components, kept.connections);
    setLast(null);
    // The button that was pressed goes away with the offer: keep the keyboard on the canvas
    surface.current?.focus();
  };

  // The pointer says when it is over something a jumper can go on
  const overMetal = Boolean(held || (hover && !hover.dead));
  useEffect(() => {
    const element = surface.current;
    if (!element || !overMetal) return;
    element.setAttribute('data-bend-over', '');
    return () => element.removeAttribute('data-bend-over');
  }, [surface, overMetal]);

  const live = Boolean(held?.to);
  const status = held
    ? (held.to ? `${held.from.label} ↔ ${held.to.label}` : `From ${held.from.label}: drag to another pin or wire`)
    : hover
      ? (hover.dead ? `${hover.label}: an unused leg, nothing to bend` : hover.label)
      : playing ? 'Press on a pin or a wire, drag to another, and hold.' : 'Press play to hear a bend. Then press on a pin or a wire, drag to another, and hold.';

  // The jumper sags like a clip lead
  const sag = held ? Math.min(60, 12 + Math.hypot(held.x - held.from.x, held.y - held.from.y) * 0.18) : 0;

  return (
    <>
      <svg className={styles.overlay} aria-hidden="true">
        <g transform={`translate(${tx} ${ty}) scale(${zoom})`}>
          {hover && !held && (
            <circle cx={hover.x} cy={hover.y} r={9 / zoom} fill="none" strokeWidth={2 / zoom}
              stroke={hover.dead ? '#999' : '#FF2D55'} strokeDasharray={hover.dead ? `${3 / zoom} ${3 / zoom}` : undefined} />
          )}
          {held && (
            <g data-testid="bend-jumper" data-live={live}>
              <path d={`M ${held.from.x} ${held.from.y} Q ${(held.from.x + held.x) / 2} ${(held.from.y + held.y) / 2 + sag} ${held.x} ${held.y}`}
                fill="none" stroke="#222" strokeWidth={6 / zoom} strokeLinecap="round" opacity={0.25} />
              <path d={`M ${held.from.x} ${held.from.y} Q ${(held.from.x + held.x) / 2} ${(held.from.y + held.y) / 2 + sag} ${held.x} ${held.y}`}
                fill="none" stroke={live ? '#FF2D55' : '#FFB3C2'} strokeWidth={3.5 / zoom} strokeLinecap="round"
                strokeDasharray={live ? undefined : `${7 / zoom} ${6 / zoom}`} />
              <circle cx={held.from.x} cy={held.from.y} r={6 / zoom} fill="#FF2D55" stroke="#fff" strokeWidth={1.5 / zoom} />
              <circle cx={held.x} cy={held.y} r={6 / zoom} fill={live ? '#FF2D55' : '#fff'} stroke={live ? '#fff' : '#FF2D55'} strokeWidth={1.5 / zoom} />
            </g>
          )}
        </g>
      </svg>
      <div className={styles.bar} data-testid="bend-bar" data-bend-ignore role="toolbar" aria-label="Bend">
        <span className={styles.title}>BEND</span>
        <div className={styles.kinds} role="group" aria-label="Jumper">
          {BEND_KINDS.map((k) => (
            <button key={k.id} className={`${styles.kind} ${kind === k.id ? styles.kindActive : ''}`}
              aria-pressed={kind === k.id} title={k.hint} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        <span className={`${styles.status} ${live ? styles.live : ''}`} role="status" data-testid="bend-status">{status}</span>
        {last && !held && (
          <span className={styles.keep}>
            KEEP IT AS A
            <button className={styles.keepButton} onClick={() => keep('switch')}
              title={`Add a switch between ${last.from.label} and ${last.to.label}`}>SWITCH</button>
            <button className={styles.keepButton} onClick={() => keep('pushbutton')}
              title={`Add a push button between ${last.from.label} and ${last.to.label}`}>BUTTON</button>
          </span>
        )}
        <button className={styles.close} onClick={onClose} aria-label="Stop bending" title="Stop bending (B or Esc)">×</button>
      </div>
    </>
  );
}
