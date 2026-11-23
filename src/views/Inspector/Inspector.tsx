import { useCallback, useEffect, useRef, useState } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { parseValue } from '@/utils/parameterParser';
import { valueParameters } from '@/utils/partValue';
import { MAX_PART_NAME_LENGTH } from '@/utils/partNames';
import { resolveWireColors, WIRE_COLORS } from '@/utils/wireColors';
import type { Component, ComponentId, ComponentParameters, Connection } from '@/types/circuit';
import styles from './Inspector.module.css';

interface InspectorProps {
  /** Wire colors are shown in the shade they have in this view. */
  viewMode: 'schematic' | 'board';
  /** Remove parts from the circuit (the canvas knows how to heal a wire when a junction goes). */
  onDeleteComponents: (ids: ComponentId[]) => void;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
}


function partName(component: Component): string {
  return component.label || ComponentRegistry.getInstance().get(component.type)?.metadata.name || component.type;
}

/**
 * Everything that can be changed about what is selected, in one visible
 * place: a part's name, value, controls and rotation, or a wire's probe.
 * The same edits exist as gestures on the canvas (double-click, R, right-click).
 */
export function Inspector({ viewMode, onDeleteComponents, onAddProbe }: InspectorProps) {
  const { circuit, selectedComponents, selectedConnections, updateComponent, removeConnection, setWireColor, clearSelection } = useCircuit();

  const parts = selectedComponents
    .map((id) => circuit.getComponent(id))
    .filter((c): c is Component => c !== undefined);
  const wires = selectedConnections
    .map((id) => circuit.getConnections().find((c) => c.id === id))
    .filter((c): c is Connection => c !== undefined);

  const rotate = useCallback((by: number) => {
    for (const part of parts) {
      if (part.type === 'junction') continue; // a dot looks the same any way up
      updateComponent(part.id, { rotation: ((part.rotation || 0) + by + 360) % 360 });
    }
  }, [parts, updateComponent]);

  const remove = useCallback(() => {
    for (const wire of wires) removeConnection(wire.id);
    if (parts.length > 0) onDeleteComponents(parts.map((p) => p.id));
    clearSelection();
  }, [parts, wires, removeConnection, onDeleteComponents, clearSelection]);

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

  const canRotate = parts.some((p) => p.type !== 'junction');
  const angle = parts.length === 1 ? `${parts[0].rotation || 0}°` : '';

  return (
    <aside className={styles.panel} aria-label="Selection" data-testid="inspector"
      onKeyDown={keepKeys} onKeyUp={keepKeys}>
      {body}
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
      <button className={`${styles.button} ${styles.danger}`} style={{ flex: 'none' }} onClick={remove}>
        Delete <span className={styles.key}>⌫</span>
      </button>
    </aside>
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

      {part.type === 'switch' && (
        <div className={styles.field}>
          <div className={styles.label}>Switch</div>
          <div className={styles.row} role="group" aria-label="Switch position">
            {[{ text: 'Off', closed: 0 }, { text: 'On', closed: 1 }].map((option) => {
              const active = (Number(part.parameters.closed) >= 1 ? 1 : 0) === option.closed;
              return (
                <button key={option.text} aria-pressed={active}
                  className={`${styles.button} ${active ? styles.pressed : ''}`}
                  onClick={() => { if (!active) setParameters({ closed: option.closed }); }}>
                  {option.text}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
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
