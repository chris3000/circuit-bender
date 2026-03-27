import React from 'react';
import styles from './Toolbar.module.css';

export type ToolMode = 'select' | 'wire' | 'pan';

interface ToolbarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
}

export const Toolbar = React.memo(function Toolbar({ toolMode, onToolModeChange }: ToolbarProps) {
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
    </div>
  );
});
