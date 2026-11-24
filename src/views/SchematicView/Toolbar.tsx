import React from 'react';
import { VIEWS, type ActiveView } from '@/views/viewModes';
import { shortcutName } from '@/utils/keyboard';
import styles from './Toolbar.module.css';

/** The arrow that turns back on itself, in a 16 px box. Redo is its mirror image. */
const UNDO_ARROW = (
  <path d="M6,2.5 L2.5,6 L6,9.5 M2.5,6 H9.5 A3.75,3.75 0 0 1 9.5,13.5 H6.5"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
);

interface ToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  activeView?: ActiveView;
  onSelectView?: (view: ActiveView) => void;
  /** The bend tool: whether it is on, and how to turn it on and off. Left out where there is nothing to bend (the cover). */
  bending?: boolean;
  onToggleBend?: () => void;
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
  onSelectView,
  bending = false,
  onToggleBend,
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
        title={`Undo (${shortcutName('Z')})`}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{UNDO_ARROW}</svg>
      </button>
      <button
        className={styles.toolButton}
        aria-label="Redo"
        title={`Redo (${shortcutName('Z', { shift: true })})`}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <g transform="translate(16 0) scale(-1 1)">{UNDO_ARROW}</g>
        </svg>
      </button>

      {onSelectView && (
        <>
          <div className={styles.divider} />
          {/* The three views of the circuit (Tab steps through them) */}
          <div className={styles.viewToggle} role="group" aria-label="View">
            {VIEWS.map((view) => (
              <button
                key={view.id}
                className={`${styles.viewTab} ${activeView === view.id ? styles.viewTabActive : ''}`}
                data-testid={`view-${view.id}`}
                aria-pressed={activeView === view.id}
                title={`${view.hint} (Tab for the next view)`}
                onClick={activeView !== view.id ? () => onSelectView(view.id) : undefined}
              >
                {view.label}
              </button>
            ))}
          </div>
        </>
      )}

      {onToggleBend && (
        <>
          <div className={styles.divider} />
          <button
            className={`${styles.bendButton} ${bending ? styles.bendButtonActive : ''}`}
            data-testid="bend-toggle"
            aria-pressed={bending}
            title="Bend: hold a jumper between two points of the circuit while it plays (B)"
            onClick={onToggleBend}
          >
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
              <path d="M2,3 Q8,14 14,3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="2" cy="3" r="1.8" fill="currentColor" />
              <circle cx="14" cy="3" r="1.8" fill="currentColor" />
            </svg>
            BEND
          </button>
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
