import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { Toolbar } from '@/views/SchematicView/Toolbar';
import type { ActiveView } from '@/views/viewModes';
import { coverLayout, isCoverInput, PANEL, type CoverItem } from './coverLayout';
import { PanelArt } from './PanelArt';
import { Jack, Knob, Lamp, Pilot, PushButton, Speaker, Toggle, TouchPad, type LevelSource, type SetParameters } from './CoverControls';
import styles from './Cover.module.css';

interface CoverViewProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  /** How brightly each LED is lit, 0 to 1, by part id (from the running simulation). */
  lights: Record<string, number>;
  /** Whether the circuit is running: the pilot light. */
  playing: boolean;
  /** The output's loudness as it plays, for the level meter. */
  levels?: LevelSource;
}

/** The panel is drawn at up to this many screen pixels per panel unit. */
const MAX_SCALE = 1.8;

/** How much a `width` × `height` panel must be scaled to fill the element it is in. */
function useFit(width: number, height: number) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const { clientWidth, clientHeight } = element;
      if (clientWidth === 0 || clientHeight === 0) return;
      setScale(Math.max(0.2, Math.min(MAX_SCALE, clientWidth / width, clientHeight / height)));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => { window.removeEventListener('resize', measure); observer?.disconnect(); };
  }, [width, height]);
  return { stage, scale };
}

const count = (n: number, one: string, many = `${one}S`) => `${n} ${n === 1 ? one : many}`;

/**
 * The cover: the front panel of the circuit as a finished instrument, with
 * every input (knobs, switches, buttons, touch plates) and output (lights, the speaker) on it
 * and nothing else. It is the same circuit as the other two views, so a knob
 * turned here is turned there, and plays through the same simulation.
 */
export function CoverView({ activeView, onSelectView, lights, playing, levels }: CoverViewProps) {
  const { circuit, updateComponent, undo, redo, canUndo, canRedo } = useCircuit();
  const layout = useMemo(() => coverLayout(circuit.getComponents()), [circuit]);
  const { stage, scale } = useFit(layout.width, layout.height);

  const setParameters = useCallback<SetParameters>((item, parameters, options) => {
    updateComponent(item.component.id, { parameters }, options);
  }, [updateComponent]);
  const rename = useCallback((item: CoverItem, name: string) => {
    updateComponent(item.component.id, { label: name || undefined });
  }, [updateComponent]);

  const parts = circuit.getComponents().filter((c) => c.type !== 'junction').length;
  const inputs = layout.items.filter((item) => isCoverInput(item.control)).length;
  const footnote = parts === 0 ? 'NOTHING INSIDE YET' : `${count(parts, 'PART')} INSIDE`;

  return (
    <div className={styles.cover} data-testid="cover-view" tabIndex={-1}>
      <Toolbar onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} activeView={activeView} onSelectView={onSelectView} />
      <div className={styles.stage} ref={stage}>
        <div className={styles.fit} style={{ width: layout.width * scale, height: layout.height * scale }}>
          <div className={styles.panel} data-testid="cover-panel"
            style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
            <PanelArt layout={layout} name={circuit.name} footnote={footnote} />
            {layout.items.map((item) => {
              const shared = { item, onRename: rename };
              switch (item.control) {
                case 'knob': return <Knob key={item.id} {...shared} onChange={setParameters} />;
                case 'toggle': return <Toggle key={item.id} {...shared} onChange={setParameters} />;
                case 'button': return <PushButton key={item.id} {...shared} onChange={setParameters} />;
                case 'pad': return <TouchPad key={item.id} {...shared} onChange={setParameters} />;
                case 'lamp': return <Lamp key={item.id} {...shared} level={lights[item.component.id] ?? 0} />;
                case 'pilot': return <Pilot key={item.id} {...shared} lit={playing} />;
                case 'speaker': return <Speaker key={item.id} {...shared} levels={levels} />;
                default: return <Jack key={item.id} {...shared} levels={levels} />;
              }
            })}
            {layout.items.length === 0 && (
              <div className={styles.empty} data-testid="cover-empty"
                style={{ left: layout.face.left + PANEL.margin, right: layout.width - layout.face.right + PANEL.margin, top: PANEL.header + 28 }}>
                <strong>NOTHING ON THE COVER YET</strong>
                Knobs, switches, buttons, LEDs and the audio output show up here once they are in the circuit.
              </div>
            )}
          </div>
        </div>
      </div>
      {inputs > 0 && (
        <div className={styles.hint}>
          Drag round a knob to turn it, click a switch to flip it, hold a button or a touch plate, click a name to change it.
        </div>
      )}
    </div>
  );
}
