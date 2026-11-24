import { memo, useCallback, useMemo } from 'react';
import type { ComponentDefinition, ComponentParameters } from '@/types/circuit';
import { shelfName, type ShelfItem } from './catalog';
import { endPartDrag, writePartDrag } from './dragData';
import styles from './ComponentDrawer.module.css';

/** The part's picture: its own drawing, or failing that its board symbol fitted to the same box. */
export function PartPicture({ definition, parameters }: { definition: ComponentDefinition; parameters: ComponentParameters }) {
  const art = definition.shelf?.art;
  if (art) return <svg viewBox="-24 -12 48 24" aria-hidden="true">{art(parameters)}</svg>;
  const { width, height, render } = definition.board.symbol;
  const scale = Math.min(46 / width, 22 / height, 1.5);
  return (
    <svg viewBox="-24 -12 48 24" aria-hidden="true">
      <g transform={`scale(${scale})`}>{render(parameters)}</g>
    </svg>
  );
}

interface ShelfTileProps {
  item: ShelfItem;
  /** The part was dragged off the shelf and dropped somewhere that took it. */
  onUsed: (key: string) => void;
  /** Among tiles of both kinds: every tile the same height, so no caption. */
  compact?: boolean;
  /**
   * The tile is for choosing, not for dragging: a part on the canvas is being
   * swapped, and clicking the tile puts this one in its place.
   */
  onPick?: (item: ShelfItem) => void;
  /** With `onPick`: why this one cannot be chosen (too few legs for the wires). */
  unfit?: string;
  /** With `onPick`, among tiles of different parts: a value is shown under the name of what it is a value of. */
  named?: boolean;
}

/**
 * One compartment of the shelf: a part to drag onto the canvas. A value of a
 * part (4.7 kΩ) takes one column; a part that stands alone takes two, with
 * room for a word about what it is.
 */
export const ShelfTile = memo(function ShelfTile({ item, onUsed, compact = false, onPick, unfit, named = false }: ShelfTileProps) {
  const { definition } = item;
  const isValue = item.value !== undefined;
  const parameters = useMemo(
    () => ({ ...definition.defaultParameters, ...item.parameters }),
    [definition, item.parameters],
  );

  const onDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    writePartDrag(e.dataTransfer, definition.type, item.parameters);
    // What is picked up is the part, not the compartment it was lying in
    const picture = e.currentTarget.querySelector<HTMLElement>('[data-picture]');
    if (picture && typeof e.dataTransfer.setDragImage === 'function') {
      const box = picture.getBoundingClientRect();
      e.dataTransfer.setDragImage(picture, box.width / 2, box.height / 2);
    }
  }, [definition.type, item.parameters]);

  const onDragEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    endPartDrag();
    if (e.dataTransfer.dropEffect !== 'none') onUsed(item.key);
  }, [item.key, onUsed]);

  const name = isValue ? `${shelfName(definition)} ${item.title}` : definition.metadata.name;
  const about = item.custom ? 'not a stock value, made to order' : definition.metadata.description;

  if (onPick) {
    const pick = () => { if (!unfit) { onPick(item); onUsed(item.key); } };
    return (
      <div
        className={`${styles.tile} ${styles.pick} ${isValue && !named ? '' : styles.wide} ${item.custom ? styles.custom : ''} ${unfit ? styles.unfit : ''}`}
        role="button"
        tabIndex={unfit ? -1 : 0}
        aria-disabled={unfit ? true : undefined}
        aria-label={name}
        title={unfit ? `${name}: ${unfit}` : `${name} — ${about}. Click to put it in.`}
        data-testid={`shelf-item-${item.key}`}
        onClick={pick}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pick(); } }}
      >
        <span className={styles.art} data-picture><PartPicture definition={definition} parameters={parameters} /></span>
        <span className={styles.title}>{isValue && named ? shelfName(definition) : item.title}</span>
        {isValue && named && <span className={styles.caption}>{item.title}</span>}
        {!isValue && !compact && item.caption && <span className={styles.caption}>{item.caption}</span>}
      </div>
    );
  }

  return (
    <div
      className={`${styles.tile} ${isValue ? '' : styles.wide} ${item.custom ? styles.custom : ''}`}
      role="listitem"
      aria-label={name}
      title={`${name} — ${about}. Drag onto the canvas.`}
      data-testid={`shelf-item-${item.key}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className={styles.art} data-picture><PartPicture definition={definition} parameters={parameters} /></span>
      <span className={styles.title}>{item.title}</span>
      {!isValue && !compact && item.caption && <span className={styles.caption}>{item.caption}</span>}
    </div>
  );
});
