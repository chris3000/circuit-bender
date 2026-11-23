import React from 'react';
import { VIEWS, type ActiveView } from '@/views/viewModes';
import styles from './Toolbar.module.css';

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
