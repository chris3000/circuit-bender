import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { partExampleFor } from '@/examples/parts';
import { formatValue } from '@/utils/parameterParser';
import { PartPicture } from '@/views/ComponentDrawer/ShelfTile';
import { ASKS_ABOUT_PART } from './asks';
import { ExampleDrawing } from './ExampleDrawing';
import { usePartExamples } from './PartExamplesContext';
import styles from './PartExamples.module.css';


const GAP = 10;

/**
 * A part's card: what the part does, and a small circuit that shows it, drawn
 * before it is opened. It comes up beside the shelf tile (or the inspector
 * button) that was clicked, and goes with Esc or a click anywhere else.
 */
export function PartCard() {
  const { asked, dismiss, open } = usePartExamples();
  const card = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  const chosen = useMemo(() => (asked ? partExampleFor(asked.definition, asked.parameters) : null), [asked]);
  const built = useMemo(() => (chosen ? chosen.example.build(chosen.value) : null), [chosen]);

  // Beside what was clicked, on whichever side has the room, and wholly on the screen
  useLayoutEffect(() => {
    if (!asked || !card.current) { setPlace(null); return; }
    const { width, height } = card.current.getBoundingClientRect();
    const right = asked.at.x + GAP;
    const left = right + width <= window.innerWidth - 8 ? right : Math.max(8, asked.at.left - GAP - width);
    const top = Math.max(8, Math.min(asked.at.y - height / 2, window.innerHeight - height - 8));
    setPlace({ left, top });
  }, [asked, chosen]);

  useEffect(() => {
    if (!asked) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(); } };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (card.current?.contains(target) || target?.closest?.(`[${ASKS_ABOUT_PART}]`)) return;
      dismiss();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    // A part picked up off the shelf is being used, not asked about
    window.addEventListener('dragstart', dismiss, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('dragstart', dismiss, true);
    };
  }, [asked, dismiss]);

  if (!asked) return null;
  const { definition, parameters } = asked;
  const all = { ...definition.defaultParameters, ...parameters };
  const value = definition.value ? Number(all[definition.value.parameter]) : NaN;
  const title = `${definition.metadata.name}${value > 0 ? ` ${formatValue(value, definition.value!.kind)}` : ''}`;

  return (
    <div ref={card} className={styles.card} role="dialog" aria-label={`About the ${title}`} data-testid="part-card"
      style={place ? { left: place.left, top: place.top } : { left: asked.at.x + GAP, top: 8, visibility: 'hidden' }}
      // Keys typed here are not canvas shortcuts
      onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}>
      <div className={styles.head}>
        <span className={styles.picture}><PartPicture definition={definition} parameters={all} /></span>
        <div className={styles.heading}>
          <div className={styles.kind}>What it does</div>
          <div className={styles.title} data-testid="part-card-title">{title}</div>
        </div>
        <button className={styles.close} aria-label="Close" title="Close (Esc)" onClick={dismiss}>&times;</button>
      </div>
      <p className={styles.text} data-testid="part-card-about">{definition.metadata.description.replace(/\.?$/, '.')}</p>
      {chosen && built && (
        <>
          <div className={styles.label}>Example<b data-testid="part-card-example">{chosen.example.name}</b></div>
          <div className={styles.drawing}>
            <ExampleDrawing components={built.components} connections={built.connections} featured={built.featured.id} />
          </div>
          <p className={styles.text} data-testid="part-card-text">{chosen.description}</p>
          <button className={styles.open} data-testid="part-card-open" onClick={() => open(chosen)}
            title="Put this example on the canvas, in place of what is there">
            Open the example
          </button>
        </>
      )}
    </div>
  );
}

/** The words of the example on the canvas, which stay above it until they are closed or another circuit is opened. */
export function ExampleNote() {
  const { note, closeNote } = usePartExamples();
  if (!note) return null;
  return (
    <div className={styles.note} role="note" data-testid="example-note">
      <span className={styles.noteKind}>EXAMPLE</span>
      <p className={styles.noteText}><b>{note.name}</b>{note.description}</p>
      <button className={styles.noteClose} aria-label="Close the note" title="Close" onClick={closeNote}>&times;</button>
    </div>
  );
}
