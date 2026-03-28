import React from 'react';
import styles from './Toolbar.module.css';

export type ToolMode = 'select' | 'wire' | 'pan';

interface ToolbarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  activeView?: 'schematic' | 'breadboard';
  onToggleView?: () => void;
}

export const Toolbar = React.memo(function Toolbar({
  toolMode,
  onToolModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  activeView,
  onToggleView,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar} data-testid="tool-toolbar">
      <button
        className={styles.toolButton}
        data-active={toolMode === 'select' ? 'true' : 'false'}
        aria-label="Select tool"
        title="Select tool (V)"
        onClick={() => onToolModeChange('select')}
      >
        <span className={styles.icon} aria-hidden="true">{'\u2B06'}</span>
      </button>
      <button
        className={styles.toolButton}
        data-active={toolMode === 'wire' ? 'true' : 'false'}
        aria-label="Wire tool"
        title="Wire tool (W)"
        onClick={() => onToolModeChange('wire')}
      >
        <span className={styles.icon} aria-hidden="true">{'\u26A1'}</span>
      </button>

      <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />

      <button
        className={styles.toolButton}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <span className={styles.icon} aria-hidden="true">{'\u21A9'}</span>
      </button>
      <button
        className={styles.toolButton}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <span className={styles.icon} aria-hidden="true">{'\u21AA'}</span>
      </button>

      {onToggleView && (
        <>
          <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />
          <button
            className={styles.toolButton}
            aria-label="Toggle view"
            title="Toggle view (Tab)"
            onClick={onToggleView}
            style={{ width: 'auto', padding: '0 8px', fontSize: '12px' }}
          >
            {activeView === 'schematic' ? 'Breadboard' : 'Schematic'} <span style={{ opacity: 0.5 }}>(Tab)</span>
          </button>
        </>
      )}
    </div>
  );
});
