import { useCallback, useEffect, useRef, useState } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { parseValue } from '@/utils/parameterParser';
import { valueParameters } from '@/utils/partValue';
import { rotateParts } from '@/utils/circuitEdits';
import { SIGNAL_WAVE_NAMES } from '@/components/definitions/AudioInput';
import { MAX_PART_NAME_LENGTH } from '@/utils/partNames';
import { resolveWireColors, WIRE_COLORS } from '@/utils/wireColors';
import type { Component, ComponentId, ComponentParameters, Connection, ConnectionId } from '@/types/circuit';
import type { MeterReading, MeterTarget } from '@/simulation/worklet/Instruments';
import { OVERLOADED, useInstruments } from '@/views/Instruments';
import { useReplacePart } from '@/views/ReplacePart/ReplacePartContext';
import { usePartExamples } from '@/views/PartExamples/PartExamplesContext';
import { ASKS_ABOUT_PART } from '@/views/PartExamples/asks';
import { meterTargetOf, sameTarget } from '@/utils/meterTarget';
import { formatAmps, formatHertz, formatRange, formatVolts } from '@/utils/readings';
import styles from './Inspector.module.css';

interface InspectorProps {
  /** Wire colors are shown in the shade they have in this view. */
  viewMode: 'schematic' | 'board';
  /** Remove parts from the circuit (the canvas knows how to heal a wire when a junction goes). */
  /** Delete these parts and wires, as one step. */
  onDeleteComponents: (ids: ComponentId[], wires?: ConnectionId[]) => void;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
}


function partName(component: Component): string {
  return component.label || ComponentRegistry.getInstance().get(component.type)?.metadata.name || component.type;
}

/**
 * Everything that can be changed about what is selected, in one visible
 * place: a part's name, value, controls and rotation, or a wire's probe.
 * The same edits exist as gestures on the canvas (double-click to swap or rename, R, right-click, Delete).
 */
export function Inspector({ viewMode, onDeleteComponents, onAddProbe }: InspectorProps) {
  const { circuit, selectedComponents, selectedConnections, editCircuit, setWireColor, clearSelection } = useCircuit();
  const { begin: beginReplace } = useReplacePart();

  const parts = selectedComponents
    .map((id) => circuit.getComponent(id))
    .filter((c): c is Component => c !== undefined);
  const wires = selectedConnections
    .map((id) => circuit.getConnections().find((c) => c.id === id))
    .filter((c): c is Connection => c !== undefined);

  // However many parts are selected, a turn is one undo step
  const rotate = useCallback((by: number) => {
    editCircuit((c) => rotateParts(c, parts.map((p) => p.id), by));
  }, [parts, editCircuit]);

  const remove = useCallback(() => {
    onDeleteComponents(parts.map((p) => p.id), wires.map((w) => w.id));
    clearSelection();
  }, [parts, wires, onDeleteComponents, clearSelection]);

  if (parts.length === 0 && wires.length === 0) return null;

  // Keys typed here are text, not canvas shortcuts (R would rotate, Backspace delete)
  const keepKeys = (e: React.KeyboardEvent) => e.stopPropagation();

  let body: React.ReactNode;
  if (parts.length === 1) {
    body = <PartFields key={parts[0].id} part={parts[0]} />;
  } else if (parts.length > 1) {
    body = <div><div className={styles.kind}>{parts.length} parts</div></div>;
  } else if (wires.length === 1) {
    const wire = wires[0];
    const from = circuit.getComponent(wire.from.componentId);
    const to = circuit.getComponent(wire.to.componentId);
    const fromPin = from?.pins.find((p) => p.id === wire.from.pinId);
    const toPin = to?.pins.find((p) => p.id === wire.to.pinId);
    body = (
      <>
        <div>
          <div className={styles.kind}>Wire</div>
          {from && to && fromPin && toPin && (
            <div className={styles.description}>
              {partName(from)} {fromPin.label} to {partName(to)} {toPin.label}
            </div>
          )}
        </div>
        {onAddProbe && from && fromPin && (
          <button className={styles.button} style={{ flex: 'none' }} title="Show this wire's voltage on the scope (or right-click the wire)"
            onClick={() => onAddProbe(from.id, fromPin.id, `${partName(from)} ${fromPin.label}`)}>
            Probe on scope
          </button>
        )}
      </>
    );
  } else {
    body = <div><div className={styles.kind}>{wires.length} wires</div></div>;
  }

  // Coloring is for wires: offered when only wires are selected
  let colorField: React.ReactNode = null;
  if (parts.length === 0) {
    const colors = resolveWireColors(circuit.getConnections());
    const current = new Set(wires.map((w) => colors.get(w.id)?.id));
    const ids = wires.map((w) => w.id);
    colorField = (
      <div className={styles.field}>
        <div className={styles.label}>Color</div>
        <div className={styles.swatches} role="group" aria-label="Wire color">
          <button className={`${styles.swatch} ${styles.auto}`} aria-pressed={current.size === 1 && current.has(undefined)}
            aria-label="Default color" title="Default color" onClick={() => setWireColor(ids, undefined)} />
          {WIRE_COLORS.map((color) => (
            <button key={color.id} className={styles.swatch} style={{ background: color[viewMode] }}
              aria-pressed={current.size === 1 && current.has(color.id)}
              aria-label={color.name} title={color.name} onClick={() => setWireColor(ids, color.id)} />
          ))}
        </div>
        <div className={styles.description}>Colors everything this wire is joined to.</div>
      </div>
    );
  }

  // A wire, or a part with two legs, can be read like a meter while the circuit runs
  const meterTarget = meterTargetOf(circuit, selectedComponents, selectedConnections);

  const canRotate = parts.some((p) => p.type !== 'junction');
  const angle = parts.length === 1 ? `${parts[0].rotation || 0}°` : '';

  return (
    <aside className={styles.panel} aria-label="Selection" data-testid="inspector"
      onKeyDown={keepKeys} onKeyUp={keepKeys}>
      {body}
      {parts.length === 1 && <Overload part={parts[0]} />}
      {meterTarget && <Meter key={`${meterTarget.componentId}:${meterTarget.pinId ?? ''}`} target={meterTarget} />}
      {colorField}
      {canRotate && (
        <div className={styles.field}>
          <div className={styles.label}>Rotation</div>
          <div className={styles.row}>
            <button className={styles.button} onClick={() => rotate(-90)} title="Rotate a quarter turn anticlockwise" aria-label="Rotate anticlockwise">
              <RotateIcon flip />
            </button>
            {angle && <span className={styles.angle}>{angle}</span>}
            <button className={styles.button} onClick={() => rotate(90)} title="Rotate a quarter turn clockwise (R)" aria-label="Rotate clockwise">
              <RotateIcon />
            </button>
          </div>
        </div>
      )}
      {parts.length === 1 && wires.length === 0 && <AboutButton part={parts[0]} />}
      {parts.length === 1 && wires.length === 0 && parts[0].type !== 'junction' && (
        <button className={styles.button} style={{ flex: 'none' }} data-testid="inspector-replace"
          title="Swap this part for another, keeping its wires (or double-click the part)"
          onClick={() => beginReplace(parts[0].id)}>
          Replace
        </button>
      )}
      <button className={`${styles.button} ${styles.danger}`} style={{ flex: 'none' }} onClick={remove}>
        Delete <span className={styles.key}>⌫</span>
      </button>
    </aside>
  );
}

/** What the part does, and its example: the same card the shelf shows, beside the inspector. */
function AboutButton({ part }: { part: Component }) {
  const { ask } = usePartExamples();
  const definition = ComponentRegistry.getInstance().get(part.type);
  if (!definition) return null;
  return (
    <button className={styles.button} style={{ flex: 'none' }} data-testid="inspector-about" {...{ [ASKS_ABOUT_PART]: '' }}
      title="What this part does, with a small circuit that shows it"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const panel = e.currentTarget.closest('aside')?.getBoundingClientRect() ?? box;
        // No room to the right of the inspector: the card goes to its left
        ask({ definition, parameters: part.parameters, at: { x: window.innerWidth, left: panel.left, y: box.top + box.height / 2 } });
      }}>
      What it does
    </button>
  );
}

/** Why a part has a "!" beside it. */
function Overload({ part }: { part: Component }) {
  const { overloaded } = useInstruments();
  if (!overloaded.has(part.id)) return null;
  return (
    <div className={styles.warning} role="status" data-testid="inspector-overload">
      <span className={styles.mark} aria-hidden="true">!</span>
      {ComponentRegistry.getInstance().get(part.type)?.overload ?? OVERLOADED}
    </div>
  );
}

/**
 * The meter: what is selected, read as the circuit runs. A wire has a
 * voltage (measured from ground, like every voltage here); a part with two
 * legs has a current through it and a voltage across it.
 */
function Meter({ target }: { target: MeterTarget }) {
  const { playing, meter } = useInstruments();
  const [reading, setReading] = useState<MeterReading | null>(null);
  useEffect(() => {
    if (!playing) { setReading(null); return; }
    return meter((report) => { if (sameTarget(report.target?.target ?? null, target)) setReading(report.target); });
  }, [playing, meter, target]);

  const onPin = target.pinId !== undefined;
  if (!playing) {
    return <div className={styles.description} data-testid="inspector-meter">Press play to read its {onPin ? 'voltage' : 'voltage and current'}.</div>;
  }
  // Which way round a part is drawn says nothing a beginner needs: sizes only
  const size = (r: { mean: number; min: number; max: number }) => {
    const a = Math.abs(r.min), b = Math.abs(r.max);
    return r.min < 0 && r.max > 0 ? { mean: Math.abs(r.mean), min: 0, max: Math.max(a, b) }
      : { mean: Math.abs(r.mean), min: Math.min(a, b), max: Math.max(a, b) };
  };
  const volts = reading?.volts ? formatRange(onPin ? reading.volts : size(reading.volts), formatVolts) : '…';
  return (
    <div className={styles.meter} data-testid="inspector-meter" aria-live="off">
      {!onPin && reading?.amps && (
        <div className={styles.reading}><span>Current</span><strong data-testid="meter-amps">{formatRange(size(reading.amps), formatAmps)}</strong></div>
      )}
      <div className={styles.reading}>
        <span>{onPin ? 'Voltage' : 'Voltage across'}</span><strong data-testid="meter-volts">{volts}</strong>
      </div>
      {reading?.volts && reading.volts.hertz !== null && (
        <div className={styles.reading}><span>Frequency</span><strong data-testid="meter-hertz">{formatHertz(reading.volts.hertz)}</strong></div>
      )}
    </div>
  );
}

function RotateIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden="true">
      <path d="M6 1.5 A4.5 4.5 0 1 1 1.5 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 -0.5 L6 3.5 L2.8 1.5 Z" fill="currentColor" />
    </svg>
  );
}

/** The fields of one selected part. */
function PartFields({ part }: { part: Component }) {
  const { updateComponent } = useCircuit();
  const definition = ComponentRegistry.getInstance().get(part.type);
  const setParameters = useCallback((changes: ComponentParameters, record = true) => {
    updateComponent(part.id, { parameters: { ...part.parameters, ...changes } }, { record });
  }, [part, updateComponent]);

  // The number the part is known by, if it has one (a resistor's resistance)
  const valueField = definition?.value;
  const control = definition?.control;

  return (
    <>
      <div>
        <div className={styles.kind}>{definition?.metadata.name ?? part.type}</div>
        {definition && !valueField && <div className={styles.description}>{definition.metadata.description}</div>}
      </div>

      {part.type !== 'junction' && (
        <TextField label="Name" value={part.label ?? ''} placeholder="none" maxLength={MAX_PART_NAME_LENGTH}
          onCommit={(raw) => {
            const next = raw.trim();
            if (next !== (part.label ?? '')) updateComponent(part.id, { label: next || undefined });
            return true;
          }} />
      )}

      {valueField && (
        <TextField label={valueField.label} value={String(part.parameters.value ?? '')}
          hint={`A number with an optional p, n, u, k or M: ${valueField.example}`}
          onCommit={(raw) => {
            const parsed = parseValue(raw);
            if (!Number.isFinite(parsed) || parsed <= 0) return false;
            if (parsed !== part.parameters[valueField.parameter]) {
              setParameters(valueParameters(valueField, parsed));
            }
            return true;
          }} />
      )}

      {part.type === 'power' && (
        <TextField label="Voltage" value={`${part.parameters.voltage ?? 9}`} hint="Volts, from 1 to 18"
          onCommit={(raw) => {
            const volts = Number(raw.trim().replace(/^\+/, '').replace(/v$/i, ''));
            if (!Number.isFinite(volts) || volts < 1 || volts > 18) return false;
            if (volts !== part.parameters.voltage) setParameters({ voltage: volts, value: `+${volts}V` });
            return true;
          }} />
      )}

      {part.type === 'potentiometer' && (
        <SliderField label="Position" min={0} max={1} step={0.01}
          value={Math.max(0, Math.min(1, Number(part.parameters.position ?? 0.5)))}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v, record) => setParameters({ position: v }, record)} />
      )}

      {part.type === 'audio-output' && (
        <SliderField label="Level trim" min={0.1} max={2} step={0.05}
          value={Number(part.parameters.gain) > 0 ? Number(part.parameters.gain) : 1}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v, record) => setParameters({ gain: v }, record)} />
      )}

      {part.type === 'lm386' && (
        <SliderField label="Gain" min={20} max={200} step={1}
          value={Math.max(20, Math.min(200, Number(part.parameters.gain) || 20))}
          format={(v) => `×${v}`}
          onChange={(v, record) => setParameters({ gain: v }, record)} />
      )}

      {part.type === 'switch' && (
        <TwoWay label="Switch" group="Switch position" off="Off" on="On"
          value={Number(part.parameters.closed) >= 1} onChange={(on) => setParameters({ closed: on ? 1 : 0 })} />
      )}

      {part.type === 'spdt' && (
        <TwoWay label="Common goes to" group="Switch position" off="A" on="B"
          value={Number(part.parameters.throw) >= 1} onChange={(on) => setParameters({ throw: on ? 1 : 0 })} />
      )}

      {part.type === 'audio-input' && (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inspector-wave">Signal</label>
            <select id="inspector-wave" className={styles.input} value={Number(part.parameters.wave ?? 0)}
              onChange={(e) => setParameters({ wave: Number(e.target.value) })}>
              {SIGNAL_WAVE_NAMES.map((name, wave) => <option key={name} value={wave}>{name}</option>)}
            </select>
          </div>
          <TextField label="Pitch" value={`${part.parameters.frequency ?? 220}Hz`} hint="Hertz, from 0.1 to 20000: 220, 1k"
            onCommit={(raw) => {
              const hertz = parseValue(raw.trim().replace(/hz$/i, ''));
              if (!Number.isFinite(hertz) || hertz < 0.1 || hertz > 20000) return false;
              if (hertz !== part.parameters.frequency) setParameters({ frequency: hertz });
              return true;
            }} />
          <TextField label="Size at full level" value={`${part.parameters.volts ?? 1}V`} hint="Volts at its peak, up to 10: 0.1 for a guitar, 1 for a line"
            onCommit={(raw) => {
              const volts = parseValue(raw.trim().replace(/v$/i, ''));
              if (!Number.isFinite(volts) || volts <= 0 || volts > 10) return false;
              if (volts !== part.parameters.volts) setParameters({ volts });
              return true;
            }} />
        </>
      )}

      {/* The control the part has on the canvas, whatever it is: here it stays where it is put */}
      {control?.kind === 'dial' && (
        <SliderField label={control.name} min={0} max={1} step={0.01}
          value={Math.max(0, Math.min(1, Number(part.parameters[control.parameter] ?? control.rest ?? 0)))}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v, record) => setParameters({ [control.parameter]: v }, record)} />
      )}
      {control?.kind === 'hold' && (control.held ?? 1) < 1 && (
        <SliderField label={control.name} min={0} max={1} step={0.01}
          value={Math.max(0, Math.min(1, Number(part.parameters[control.parameter] ?? 0)))}
          format={(v) => (v > 0 ? `${Math.round(v * 100)}%` : 'off')}
          onChange={(v, record) => setParameters({ [control.parameter]: v }, record)} />
      )}
      {control?.kind === 'hold' && (control.held ?? 1) >= 1 && (
        <TwoWay label={control.name} group={`${control.name} position`} off="Up" on="Held down"
          value={Number(part.parameters[control.parameter]) >= 1}
          onChange={(on) => setParameters({ [control.parameter]: on ? 1 : 0 })} />
      )}
    </>
  );
}

/** A pair of buttons for something that is one way or the other. */
function TwoWay({ label, group, off, on, value, onChange }: {
  label: string; group: string; off: string; on: string; value: boolean; onChange: (on: boolean) => void;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.label}>{label}</div>
      <div className={styles.row} role="group" aria-label={group}>
        {[{ text: off, state: false }, { text: on, state: true }].map((option) => {
          const active = value === option.state;
          return (
            <button key={option.text} aria-pressed={active}
              className={`${styles.button} ${active ? styles.pressed : ''}`}
              onClick={() => { if (!active) onChange(option.state); }}>
              {option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  /** Shown when what was typed cannot be used. */
  hint?: string;
  /** Apply the text; return false if it cannot be used. */
  onCommit: (raw: string) => boolean;
}

/** A text box that applies on Enter or when left, and goes back on Escape. */
function TextField({ label, value, placeholder, maxLength, hint, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  // The value can change underneath (undo, the editor on the canvas)
  useEffect(() => { setDraft(value); setInvalid(false); }, [value]);

  const commit = () => {
    if (draft === value) { setInvalid(false); return; }
    setInvalid(!onCommit(draft));
  };

  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={`${styles.input} ${invalid ? styles.invalid : ''}`} type="text" value={draft}
        placeholder={placeholder} maxLength={maxLength} spellCheck={false} aria-invalid={invalid}
        // Nothing typed that is not already in the circuit: Ctrl+Z here undoes the circuit
        data-settled={draft === value}
        onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setInvalid(false); }
        }} />
      {invalid && hint && <span className={styles.hint} role="alert">{hint}</span>}
    </label>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  /** `record` is true for the first change of a drag, so a whole drag is one undo step. */
  onChange: (value: number, record: boolean) => void;
}

function SliderField({ label, value, min, max, step, format, onChange }: SliderFieldProps) {
  const recorded = useRef(false);
  const endGesture = () => { recorded.current = false; };
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}<span className={styles.readout}>{format(value)}</span></span>
      <input className={styles.slider} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => {
          onChange(Number(e.target.value), !recorded.current);
          recorded.current = true;
        }}
        onPointerUp={endGesture} onKeyUp={endGesture} onBlur={endGesture} />
    </label>
  );
}
