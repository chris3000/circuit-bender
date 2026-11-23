/**
 * The things on the cover: a knob to turn, a switch to flip, a button to
 * hold, plates to touch, a light, the pilot light, and the output — a socket
 * or a speaker — with its level meter. Each fills the cell the layout gave it
 * and has its name engraved underneath.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { KNOB_MIN_ANGLE, KNOB_SWEEP, knobPositionAt } from '@/components/art/knob';
import { MAX_PART_NAME_LENGTH } from '@/utils/partNames';
import type { ComponentParameters } from '@/types/circuit';
import type { CoverItem } from './coverLayout';
import { FONT, hexagon, INK, INK_DIM, METAL, METAL_DARK, METAL_LIGHT, PINK } from './PanelArt';
import styles from './Cover.module.css';

/** Change a part's parameters; `record: false` adds to the undo step already begun. */
export type SetParameters = (item: CoverItem, parameters: ComponentParameters, options?: { record?: boolean }) => void;

interface CellProps {
  item: CoverItem;
  onRename: (item: CoverItem, name: string) => void;
  /** Shown in place of the name for a moment (a knob's position while it turns). */
  readout?: string;
  children: ReactNode;
}

/** A control's place on the panel, with its name underneath. Click the name to change it. */
function Cell({ item, onRename, readout, children }: CellProps) {
  const [editing, setEditing] = useState(false);
  const commit = (raw: string) => {
    const next = raw.trim().slice(0, MAX_PART_NAME_LENGTH);
    if (next !== (item.component.label ?? '')) onRename(item, next);
    setEditing(false);
  };
  return (
    <div className={styles.cell} data-testid={`cover-${item.control}`} data-part={item.component.id}
      style={{ left: item.x, top: item.y, width: item.width, height: item.height }}>
      {children}
      {editing ? (
        <input className={styles.nameInput} autoFocus defaultValue={item.component.label ?? ''} maxLength={MAX_PART_NAME_LENGTH}
          placeholder={item.name} aria-label={`Name of ${item.name}`}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={(e) => commit(e.target.value)} />
      ) : readout ? (
        <div className={`${styles.name} ${styles.readout}`}>{readout}</div>
      ) : item.cover.fixedName ? (
        <div className={`${styles.name} ${styles.fixed}`}>{item.name}</div>
      ) : (
        <button type="button" className={`${styles.name} ${item.named ? '' : styles.standIn}`}
          title={item.named ? 'Click to rename' : 'Click to give it a name'} onClick={() => setEditing(true)}>
          {item.name}
        </button>
      )}
    </div>
  );
}

/** The drawing of a cell: an SVG the size of the cell, with (0, 0) at the centre of the control. */
function Art({ item, centre, children }: { item: CoverItem; centre: number; children: ReactNode }) {
  return (
    <svg className={styles.art} width={item.width} height={item.height}
      viewBox={`${-item.width / 2} ${-centre} ${item.width} ${item.height}`} aria-hidden="true">
      {children}
    </svg>
  );
}

const SMALL_PRINT = { fill: INK_DIM, fontFamily: FONT, fontSize: 8.5, fontWeight: 700, letterSpacing: 1.5 } as const;

// --- Knob ---

const KNOB_CENTRE = 72;
const KNOB_RADIUS = 34;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

interface ControlProps {
  item: CoverItem;
  onRename: (item: CoverItem, name: string) => void;
}

export function Knob({ item, onRename, onChange }: ControlProps & { onChange: SetParameters }) {
  const key = item.cover.parameter ?? 'position';
  const position = Math.max(0, Math.min(1, Number(item.component.parameters[key] ?? 0.5)));
  const [turning, setTurning] = useState(false);
  const latest = useRef({ item, position });
  latest.current = { item, position };

  const set = useCallback((next: number, record: boolean) => {
    const { item: now, position: from } = latest.current;
    const clamped = Math.max(0, Math.min(1, next));
    if (clamped === from) return false;
    onChange(now, { ...now.component.parameters, [key]: clamped }, { record });
    return true;
  }, [key, onChange]);

  // Drag round the dial, as on the board. The whole turn is one undo step.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const dial = e.currentTarget;
    dial.focus();
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let first = true;
    const onMove = (move: PointerEvent) => {
      if (set(knobPositionAt(move.clientX - cx, move.clientY - cy), first)) first = false;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setTurning(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    setTurning(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const to = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? position + step
      : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? position - step
        : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    // A held key is one undo step, not one per repeat
    set(Math.round(to * 100) / 100, !e.repeat);
  };

  const percent = Math.round(position * 100);
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = toRadians(KNOB_MIN_ANGLE + (i / 10) * KNOB_SWEEP);
    return { i, cos: Math.cos(a), sin: Math.sin(a) };
  });
  const grip = Array.from({ length: 24 }, (_, i) => toRadians(i * 15));

  return (
    <Cell item={item} onRename={onRename} readout={turning ? `${percent}%` : undefined}>
      <Art item={item} centre={KNOB_CENTRE}>
        {/* Scale: 0 to 10 */}
        {ticks.map(({ i, cos, sin }) => (
          <g key={i}>
            <line x1={cos * 41} y1={sin * 41} x2={cos * (i % 5 === 0 ? 48 : 45.5)} y2={sin * (i % 5 === 0 ? 48 : 45.5)}
              stroke={INK} strokeWidth={i % 5 === 0 ? 1.8 : 1.1} opacity={i / 10 <= position + 0.001 ? 1 : 0.45} />
            <text x={cos * 56.5} y={sin * 56.5 + 2.8} textAnchor="middle" fill={INK_DIM} fontFamily={FONT} fontSize="8" fontWeight="700">{i}</text>
          </g>
        ))}
        {/* Skirt with a grip, pale cap, pink pointer */}
        <circle cx="2.5" cy="4.5" r={KNOB_RADIUS} fill="#000" opacity="0.4" />
        <circle r={KNOB_RADIUS} fill="#171717" stroke="#4A4A4A" strokeWidth="1" />
        {grip.map((a) => (
          <line key={a} x1={Math.cos(a) * 28.5} y1={Math.sin(a) * 28.5} x2={Math.cos(a) * 32.5} y2={Math.sin(a) * 32.5} stroke="#3A3A3A" strokeWidth="1.5" />
        ))}
        <circle r="25" fill="#DADADA" />
        <circle cx="-0.8" cy="-1.2" r="23.6" fill={INK} />
        <path d="M -19.5 -6 A 20.5 20.5 0 0 1 -6 -19.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <g transform={`rotate(${KNOB_MIN_ANGLE + position * KNOB_SWEEP})`} data-testid="cover-knob-pointer">
          <line x1="7" y1="0" x2="31.5" y2="0" stroke={PINK} strokeWidth="4.5" strokeLinecap="round" />
        </g>
      </Art>
      <div className={styles.dial} role="slider" tabIndex={0}
        aria-label={item.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%`}
        title={`${item.name}: ${percent}%. Drag round the dial, or use the arrow keys.`}
        style={{ top: KNOB_CENTRE, width: KNOB_RADIUS * 2 + 8, height: KNOB_RADIUS * 2 + 8, cursor: turning ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown} onKeyDown={onKeyDown} />
    </Cell>
  );
}

// --- Toggle switch ---

const ROW_CENTRE = 66;

export function Toggle({ item, onRename, onChange }: ControlProps & { onChange: SetParameters }) {
  const key = item.cover.parameter ?? 'closed';
  const on = Number(item.component.parameters[key] ?? 0) >= 1;
  // The bat handle leans to whichever end it was thrown to
  const tip = on ? -25 : 25;
  const lever = `M -3.6 0 L -5.4 ${tip} L 5.4 ${tip} L 3.6 0 Z`;
  return (
    <Cell item={item} onRename={onRename}>
      <Art item={item} centre={ROW_CENTRE}>
        <text x="0" y="-41" textAnchor="middle" {...SMALL_PRINT} fill={on ? INK : INK_DIM}>ON</text>
        <circle cx="1.5" cy="2.5" r="17" fill="#000" opacity="0.35" />
        <circle r="17" fill={METAL_DARK} />
        <polygon points={hexagon(13.5)} fill={METAL} stroke="#6E6E6E" strokeWidth="1" />
        <path d="M -6.7 -11.6 L 6.7 -11.6" stroke={METAL_LIGHT} strokeWidth="1.4" strokeLinecap="round" />
        <circle r="7" fill="#6E6E6E" />
        <path d={lever} fill="#000" opacity="0.35" transform="translate(3.5 3.5)" />
        <circle cx="3.5" cy={tip + 3.5} r="6.6" fill="#000" opacity="0.35" />
        <path d={lever} fill="#E2E2E2" stroke={METAL_DARK} strokeWidth="0.8" strokeLinejoin="round" />
        <circle cy={tip} r="6.6" fill={INK} stroke={METAL_DARK} strokeWidth="0.8" />
        <line x1="-2.2" y1={tip * 0.15} x2="-3.4" y2={tip * 0.9} stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="-2" cy={tip - 2} r="1.8" fill="#fff" />
      </Art>
      <button type="button" className={styles.lever} role="switch" aria-checked={on} aria-label={item.name}
        title={`${item.name}: ${on ? 'on' : 'off'}. Click to flip.`} style={{ top: ROW_CENTRE }}
        onClick={() => onChange(item, { ...item.component.parameters, [key]: on ? 0 : 1 })} />
    </Cell>
  );
}

// --- Push button and touch plates: on only while they are held ---

/**
 * Holding something down. `press(value)` sets the parameter, `release()`
 * puts it back to 0; neither is an undo step, and it is let go if the pointer
 * is lost or the control goes away while held.
 */
function useHold(item: CoverItem, key: string, onChange: SetParameters) {
  // Read when the pointer moves, not when the control was drawn: the hold outlives many redraws
  const latest = useRef({ item, onChange });
  latest.current = { item, onChange };
  const set = useCallback((value: number) => {
    const { item: now, onChange: change } = latest.current;
    if (Number(now.component.parameters[key] ?? 0) === value) return;
    change(now, { ...now.component.parameters, [key]: value }, { record: false });
  }, [key]);
  const release = useCallback(() => set(0), [set]);
  // Let go if the control goes away while it is held (the view changed under the finger)
  useEffect(() => release, [release]);
  /** Call from pointerdown: follows the pointer until it is let go. */
  const follow = useCallback((e: React.PointerEvent<HTMLElement>, valueAt: (clientY: number, target: DOMRect) => number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    const rect = e.currentTarget.getBoundingClientRect();
    set(valueAt(e.clientY, rect));
    const onMove = (move: PointerEvent) => set(valueAt(move.clientY, rect));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      release();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [set, release]);
  /** Enter holds it from the keyboard (Space plays and stops). */
  const keys = (value: number) => ({
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); set(value); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === 'Enter') release(); },
    onBlur: release,
  });
  return { follow, keys };
}

export function PushButton({ item, onRename, onChange }: ControlProps & { onChange: SetParameters }) {
  const key = item.cover.parameter ?? 'closed';
  const held = Number(item.component.parameters[key] ?? 0) >= 1;
  const { follow, keys } = useHold(item, key, onChange);
  return (
    <Cell item={item} onRename={onRename}>
      <Art item={item} centre={ROW_CENTRE}>
        <circle cx="1.5" cy="2.5" r="21" fill="#000" opacity="0.35" />
        <circle r="21" fill={METAL} stroke={METAL_DARK} strokeWidth="1" />
        <path d="M -16.4 -6.4 A 17.6 17.6 0 0 1 -6.4 -16.4" fill="none" stroke={METAL_LIGHT} strokeWidth="1.6" strokeLinecap="round" />
        <circle r="16" fill="#3A3A3A" />
        {/* The cap sinks into its collar while it is held */}
        {!held && <circle cx="1" cy="2" r="14" fill="#000" opacity="0.4" />}
        <circle r={held ? 13 : 14} fill={held ? '#B0152F' : PINK} data-testid="cover-button-cap" />
        {!held && <path d="M -9.6 -4.2 A 10.5 10.5 0 0 1 -4.2 -9.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />}
      </Art>
      <button type="button" className={styles.press} aria-pressed={held} aria-label={item.name}
        title={`${item.name}: hold to press`} style={{ top: ROW_CENTRE }}
        onPointerDown={(e) => follow(e, () => 1)} {...keys(1)} />
    </Cell>
  );
}

/** How hard a keyboard touches. */
const KEY_TOUCH = 0.6;
const PAD = { width: 68, height: 64 };

/** Two plates to put a finger across. The higher up they are pressed, the firmer the touch. */
export function TouchPad({ item, onRename, onChange }: ControlProps & { onChange: SetParameters }) {
  const key = item.cover.parameter ?? 'touch';
  const touch = Math.max(0, Math.min(1, Number(item.component.parameters[key] ?? 0)));
  const { follow, keys } = useHold(item, key, onChange);
  // From the lightest touch at the bottom edge to the firmest at the top
  const pressure = (clientY: number, rect: DOMRect) =>
    Math.round(Math.max(0.05, Math.min(1, (rect.bottom - clientY) / rect.height)) * 100) / 100;
  const top = -PAD.height / 2;
  return (
    <Cell item={item} onRename={onRename} readout={touch > 0 ? `${Math.round(touch * 100)}%` : undefined}>
      <Art item={item} centre={ROW_CENTRE}>
        <rect x={-PAD.width / 2 - 4 + 1.5} y={top - 4 + 2.5} width={PAD.width + 8} height={PAD.height + 8} rx="9" fill="#000" opacity="0.35" />
        <rect x={-PAD.width / 2 - 4} y={top - 4} width={PAD.width + 8} height={PAD.height + 8} rx="9" fill="#141414" stroke="#4A4A4A" strokeWidth="1" />
        {[-PAD.width / 2, 3].map((x) => (
          <g key={x}>
            <rect x={x} y={top} width={PAD.width / 2 - 3} height={PAD.height} rx="5" fill="#C9A85A" stroke="#93783A" strokeWidth="1" />
            <rect x={x + 4} y={top + 4} width={PAD.width / 2 - 11} height="2.4" rx="1.2" fill="#fff" opacity="0.5" />
            <rect x={x + 3} y={top + PAD.height - 8} width={PAD.width / 2 - 9} height="3.4" rx="1.7" fill="#000" opacity="0.14" />
          </g>
        ))}
        {touch > 0 && (
          <ellipse data-testid="cover-pad-finger" cx="0" cy={top + PAD.height * (1 - touch) * 0.8 + PAD.height * 0.1} rx="19" ry="12"
            fill={PINK} opacity={0.35 + 0.5 * touch} />
        )}
      </Art>
      <button type="button" className={styles.plates} aria-pressed={touch > 0} aria-label={item.name}
        title={`${item.name}: press and hold. Higher up is a firmer touch.`}
        style={{ top: ROW_CENTRE, width: PAD.width + 8, height: PAD.height + 8 }}
        onPointerDown={(e) => follow(e, pressure)} {...keys(KEY_TOUCH)} />
    </Cell>
  );
}

// --- Lights ---

/** A jewel in a chrome bezel. */
function Jewel({ lit, glow, dark, bright }: { lit: boolean; glow: string; dark: string; bright: string }) {
  return (
    <>
      {lit && (
        <>
          <circle r="29" fill={glow} opacity="0.05" />
          <circle r="24" fill={glow} opacity="0.08" />
          <circle r="19.5" fill={glow} opacity="0.16" />
        </>
      )}
      <circle cx="1.2" cy="2" r="14.5" fill="#000" opacity="0.35" />
      <circle r="14.5" fill={METAL} stroke={METAL_DARK} strokeWidth="1" />
      <path d="M -11.2 -4 A 12 12 0 0 1 -4 -11.2" fill="none" stroke={METAL_LIGHT} strokeWidth="1.5" strokeLinecap="round" />
      <circle r="10.5" fill="#3A3A3A" />
      <circle r="9" fill={lit ? glow : dark} />
      {lit && <circle r="5.5" fill={bright} />}
      <ellipse cx="-3.2" cy="-3.6" rx="2.6" ry="1.8" fill="#fff" opacity={lit ? 0.85 : 0.3} transform="rotate(-40 -3.2 -3.6)" />
    </>
  );
}

/** What a light is doing, for whoever cannot see it (the drawing itself is decoration). */
function LightState({ item, lit }: { item: CoverItem; lit: boolean }) {
  const state = `${item.name}: ${lit ? 'on' : 'off'}`;
  return <div className={styles.light} role="img" aria-label={state} title={state} data-lit={lit} style={{ top: ROW_CENTRE }} />;
}

export function Lamp({ item, onRename, lit }: ControlProps & { lit: boolean }) {
  return (
    <Cell item={item} onRename={onRename}>
      <Art item={item} centre={ROW_CENTRE}>
        <Jewel lit={lit} glow={PINK} dark="#5A1426" bright="#FF93A8" />
      </Art>
      <LightState item={item} lit={lit} />
    </Cell>
  );
}

/** The power light: on while the circuit is running. */
export function Pilot({ item, onRename, lit }: ControlProps & { lit: boolean }) {
  return (
    <Cell item={item} onRename={onRename}>
      <Art item={item} centre={ROW_CENTRE}>
        {item.detail && <text x="0" y="-41" textAnchor="middle" {...SMALL_PRINT}>{item.detail}</text>}
        <Jewel lit={lit} glow="#FFFFFF" dark="#555555" bright="#FFFFFF" />
      </Art>
      <LightState item={item} lit={lit} />
    </Cell>
  );
}

// --- Output socket and level meter ---

/** Hears how loud the output is: called with the peak of each block of samples (rail to rail is 0.5). */
export type LevelSource = (listener: (peak: number) => void) => () => void;

const SEGMENTS = 8;
/** Each segment is 3 dB above the one before; the last is a rail-to-rail swing. */
export function segmentsLit(level: number): number {
  if (level <= 0) return 0;
  const below = 20 * Math.log10(level / 0.5);
  return Math.max(0, Math.min(SEGMENTS, Math.floor(SEGMENTS + below / 3 + 1e-9)));
}
const SEGMENT_OFF = '#3D3D3D';

/** The row of lights above an output. It follows the sound without re-rendering anything. */
function Meter({ levels }: { levels?: LevelSource }) {
  const meter = useRef<SVGGElement>(null);

  // Peaks arrive many times a second, and the meter falls back on its own between them
  useEffect(() => {
    if (!levels) return;
    let level = 0, shown = -1, frame = 0;
    const draw = () => {
      frame = 0;
      const lit = segmentsLit(level);
      if (lit !== shown) {
        shown = lit;
        meter.current?.querySelectorAll('rect').forEach((segment, i) => {
          segment.setAttribute('fill', i < lit ? (i >= SEGMENTS - 2 ? PINK : INK) : SEGMENT_OFF);
        });
        meter.current?.setAttribute('data-lit', String(lit));
      }
      level *= 0.86;
      if (level > 0.005) frame = requestAnimationFrame(draw);
      else if (shown !== 0) { level = 0; frame = requestAnimationFrame(draw); }
    };
    const stop = levels((peak) => {
      if (peak > level) level = peak;
      if (!frame) frame = requestAnimationFrame(draw);
    });
    return () => { stop(); if (frame) cancelAnimationFrame(frame); };
  }, [levels]);

  const span = SEGMENTS * 8 + (SEGMENTS - 1) * 3;
  return (
    <g ref={meter} data-testid="cover-meter" data-lit="0">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <rect key={i} x={-span / 2 + i * 11} y="-50" width="8" height="6" rx="1.5" fill={SEGMENT_OFF} />
      ))}
    </g>
  );
}

/** The output as a socket: the signal goes on somewhere else. */
export function Jack({ item, onRename, levels }: ControlProps & { levels?: LevelSource }) {
  return (
    <Cell item={item} onRename={onRename}>
      <Art item={item} centre={ROW_CENTRE}>
        <Meter levels={levels} />
        <g transform="translate(0 4)">
          <circle cx="1.5" cy="2.5" r="18" fill="#000" opacity="0.35" />
          <circle r="18" fill={METAL_DARK} />
          <polygon points={hexagon(14.5)} fill={METAL} stroke="#6E6E6E" strokeWidth="1" />
          <path d="M -7.2 -12.5 L 7.2 -12.5" stroke={METAL_LIGHT} strokeWidth="1.4" strokeLinecap="round" />
          <circle r="9" fill="#8F8F8F" stroke="#5F5F5F" strokeWidth="1" />
          <circle r="5.6" fill="#0A0A0A" />
          <path d="M -3.6 4.2 A 5.6 5.6 0 0 0 4.2 3.6" fill="none" stroke="#555" strokeWidth="1" />
        </g>
      </Art>
    </Cell>
  );
}

/** Holes of a speaker grille: rings round a centre hole, inside `radius`. */
const GRILLE = [
  { r: 0, count: 1 }, { r: 5.4, count: 6 }, { r: 10.8, count: 12 }, { r: 16.2, count: 18 },
].flatMap(({ r, count }) => Array.from({ length: count }, (_, i) => {
  const a = (i / count) * 2 * Math.PI + (count === 12 ? Math.PI / 12 : 0);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}));

/** The output as a small speaker: what the circuit plays through. */
export function Speaker({ item, onRename, levels }: ControlProps & { levels?: LevelSource }) {
  return (
    <Cell item={item} onRename={onRename}>
      <Art item={item} centre={ROW_CENTRE}>
        <Meter levels={levels} />
        <g transform="translate(0 6)" data-testid="cover-speaker-grille">
          <circle cx="1.5" cy="2.5" r="25" fill="#000" opacity="0.35" />
          <circle r="25" fill={METAL} stroke={METAL_DARK} strokeWidth="1" />
          <path d="M -19.6 -8 A 21.2 21.2 0 0 1 -8 -19.6" fill="none" stroke={METAL_LIGHT} strokeWidth="1.6" strokeLinecap="round" />
          <circle r="21" fill="#1C1C1C" stroke="#0A0A0A" strokeWidth="1" />
          {GRILLE.map(({ x, y }) => <circle key={`${x.toFixed(1)},${y.toFixed(1)}`} cx={x} cy={y} r="1.9" fill="#050505" stroke="#3A3A3A" strokeWidth="0.6" />)}
        </g>
      </Art>
    </Cell>
  );
}
