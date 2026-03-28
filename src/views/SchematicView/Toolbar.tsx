import React from 'react';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  activeView?: 'schematic' | 'breadboard';
  onToggleView?: () => void;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export const Toolbar = React.memo(function Toolbar({
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  activeView,
  onToggleView,
  zoom,
  onZoomIn,
  onZoomOut,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar} data-testid="tool-toolbar">
      {/* Undo/Redo */}
      <button
        className={styles.toolButton}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M4,5 L1,2 L4,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2,2 Q2,10 10,10 L12,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        className={styles.toolButton}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M10,5 L13,2 L10,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12,2 Q12,10 4,10 L2,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {onToggleView && (
        <>
          <div className={styles.divider} />
          {/* View toggle */}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewTab} ${activeView === 'schematic' ? styles.viewTabActive : ''}`}
              onClick={activeView !== 'schematic' ? onToggleView : undefined}
            >
              Schematic
            </button>
            <button
              className={`${styles.viewTab} ${activeView === 'breadboard' ? styles.viewTabActive : ''}`}
              onClick={activeView !== 'breadboard' ? onToggleView : undefined}
            >
              Board
            </button>
          </div>
        </>
      )}

      {onZoomIn && onZoomOut && zoom !== undefined && (
        <>
          <div className={styles.divider} />
          {/* Zoom */}
          <button className={styles.zoomButton} onClick={onZoomOut} aria-label="Zoom out">−</button>
          <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
          <button className={styles.zoomButton} onClick={onZoomIn} aria-label="Zoom in">+</button>
        </>
      )}
    </div>
  );
});
