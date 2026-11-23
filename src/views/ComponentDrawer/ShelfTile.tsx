import { memo, useCallback, useMemo } from 'react';
import type { ComponentDefinition, ComponentParameters } from '@/types/circuit';
import { shelfName, type ShelfItem } from './catalog';
import { writePartDrag } from './dragData';
import styles from './ComponentDrawer.module.css';

/** The part's picture: its own drawing, or failing that its board symbol fitted to the same box. */
function PartPicture({ definition, parameters }: { definition: ComponentDefinition; parameters: ComponentParameters }) {
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
}

/**
 * One compartment of the shelf: a part to drag onto the canvas. A value of a
 * part (4.7 kΩ) takes one column; a part that stands alone takes two, with
 * room for a word about what it is.
 */
export const ShelfTile = memo(function ShelfTile({ item, onUsed, compact = false }: ShelfTileProps) {
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
    if (e.dataTransfer.dropEffect !== 'none') onUsed(item.key);
  }, [item.key, onUsed]);

  const name = isValue ? `${shelfName(definition)} ${item.title}` : definition.metadata.name;
  const about = item.custom ? 'not a stock value, made to order' : definition.metadata.description;

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
