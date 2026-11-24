import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component } from '@/types/circuit';
import { replacementsFor, typedValueItem, type ShelfItem } from '@/views/ComponentDrawer/catalog';
import { ShelfTile } from '@/views/ComponentDrawer/ShelfTile';
import shelf from '@/views/ComponentDrawer/ComponentDrawer.module.css';
import { symbolBounds, type ViewMode } from '@/views/CircuitCanvas/routing/layout';
import { useReplacePart } from './ReplacePartContext';
import { partTitle } from './partTitle';
import styles from './ReplacePopover.module.css';

const WIDTH = 264;
/** Room between the popover and the part, and between it and the edge of the canvas. */
const GAP = 14;
const MARGIN = 8;
/** The scope's bar along the bottom of the window, until the page says how tall the scope is. */
const SCOPE_BAR = 32;

const noop = () => {};

/**
 * Opens beside a part that was double-clicked: its other values, the parts
 * that are like it, and the way on to every part there is (which is the
 * parts shelf). Clicking one puts it in the part's place, wires and all.
 */
export function ReplacePopover({ viewMode }: { viewMode: ViewMode }) {
  const { target, wide } = useReplacePart();
  if (!target || wide) return null;
  return <Popover key={target.id} part={target} viewMode={viewMode} />;
}

function Popover({ part, viewMode }: { part: Component; viewMode: ViewMode }) {
  const { cancel, widen, fits, replaceWith } = useReplacePart();
  const definitions = useMemo(() => ComponentRegistry.getInstance().listAll(), []);
  const definition = definitions.find((d) => d.type === part.type);
  const { values, similar } = useMemo(() => replacementsFor(part, definitions), [part, definitions]);

  // Stay beside the part as the canvas is panned and zoomed
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  // The scope lies over the bottom of the canvas: that much of it is not there to use
  const [floor, setFloor] = useState(SCOPE_BAR);
  useLayoutEffect(() => {
    setHeight(box.current?.offsetHeight ?? 0);
    setFloor(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scope-height')) || SCOPE_BAR);
  }, [values.length, similar.length, paneHeight]);

  const bounds = symbolBounds(part, viewMode) ?? { left: -20, right: 20, top: -20, bottom: 20 };
  const room = { right: paneWidth - MARGIN, bottom: paneHeight - floor - MARGIN };
  const centre = part.position.x * zoom + tx;
  const below = (part.position.y + bounds.bottom) * zoom + ty + GAP;
  const above = (part.position.y + bounds.top) * zoom + ty - GAP - height;
  const within = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
  // Under the part; over it when there is no room under; beside it when there is room for neither
  let left = within(centre - WIDTH / 2, MARGIN, room.right - WIDTH);
  let top = below;
  if (below + height > room.bottom) {
    if (above >= MARGIN) top = above;
    else {
      const rightOf = (part.position.x + bounds.right) * zoom + tx + GAP;
      const leftOf = (part.position.x + bounds.left) * zoom + tx - GAP - WIDTH;
      left = rightOf + WIDTH <= room.right || leftOf < MARGIN ? within(rightOf, MARGIN, room.right - WIDTH) : leftOf;
      top = within(part.position.y * zoom + ty - height / 2, MARGIN, room.bottom - height);
    }
  }

  // Escape, or a press anywhere else, puts it away
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    const onPress = (e: PointerEvent) => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) cancel();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPress, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPress, true);
    };
  }, [cancel]);

  // A part with a value: the box for typing one has the focus, so
  // double-click, type, Enter changes a value as it always did
  const field = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { (field.current ?? box.current)?.focus(); }, []);

  const pick = useCallback((item: ShelfItem) => replaceWith(item.definition, item.parameters), [replaceWith]);
  const typed = () => {
    if (!definition || !draft.trim()) return;
    const item = typedValueItem(definition, definitions, draft);
    if (item) pick(item); else setInvalid(true);
  };

  // Keys pressed here are for the popover, not canvas shortcuts (R, Delete)
  const keep = (e: React.SyntheticEvent) => e.stopPropagation();
  const tile = (item: ShelfItem, named: boolean) => (
    <ShelfTile key={item.key} item={item} onUsed={noop} named={named} onPick={pick}
      unfit={fits(item.definition) ? undefined : 'too few legs for the wires on this part'} />
  );

  return (
    <div ref={box} className={styles.popover} role="dialog" aria-label={`Replace ${partTitle(part)}`}
      data-testid="replace-popover" tabIndex={-1} style={{ left, top, maxHeight: Math.max(120, room.bottom - MARGIN) }}
      onKeyDown={keep} onKeyUp={keep} onDoubleClick={keep}>
      <div className={styles.head}>
        <div className={styles.heading}>
          <div className={styles.kind}>Replace</div>
          <div className={styles.what} data-testid="replace-what">{partTitle(part)}</div>
        </div>
        <button className={styles.close} aria-label="Close" title="Close (Esc)" onClick={cancel}>&times;</button>
      </div>

      {definition?.value && (
        <label className={styles.field}>
          <span className={styles.label}>Any value</span>
          <input ref={field} className={`${styles.input} ${invalid ? styles.invalid : ''}`} type="text" value={draft}
            placeholder={`Type one: ${definition.value.example}`} spellCheck={false} autoComplete="off"
            aria-label={`New ${definition.value.label.toLowerCase()}`} aria-invalid={invalid}
            onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') typed(); }} />
          {invalid && (
            <span className={styles.hint} role="alert">
              A number with an optional p, n, u, k or M: {definition.value.example}
            </span>
          )}
        </label>
      )}

      {values.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>Other values</span>
          <div className={shelf.grid} role="group" aria-label="Other values" data-testid="replace-values">
            {values.map((item) => tile(item, false))}
          </div>
        </div>
      )}

      {similar.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>Similar parts</span>
          <div className={styles.similar} role="group" aria-label="Similar parts" data-testid="replace-similar">
            {similar.map((item) => tile(item, true))}
          </div>
        </div>
      )}

      {values.length === 0 && similar.length === 0 && (
        <div className={styles.none}>Nothing else is quite like this part. Every part is on the shelf.</div>
      )}

      <button className={styles.all} data-testid="replace-all" onClick={widen}
        title="Choose from every part on the shelf">
        All parts
      </button>
    </div>
  );
}
