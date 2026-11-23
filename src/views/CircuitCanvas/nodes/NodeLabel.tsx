import { useCallback, useState } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import type { Component } from '@/types/circuit';
import { MAX_PART_NAME_LENGTH } from '@/utils/partNames';
import { labelPlacement, LABEL_FONT_SIZE, type ViewMode } from '../routing/layout';

const PLACEHOLDER = '+ name';

interface NodeLabelProps {
  component: Component;
  viewMode: ViewMode;
  selected: boolean;
  /** Size of the node the label is positioned against. */
  width: number;
  height: number;
}

/**
 * The part's name ("WACKY", "CUTOFF"), on a side of the symbol that has no
 * pins. Double-click to rename; a selected part without a name offers to add one.
 */
export function NodeLabel({ component, viewMode, selected, width, height }: NodeLabelProps) {
  const { updateComponent } = useCircuit();
  const [editing, setEditing] = useState(false);
  const name = component.label ?? '';

  const commit = useCallback((raw: string) => {
    const next = raw.trim().slice(0, MAX_PART_NAME_LENGTH);
    if (next !== name) updateComponent(component.id, { label: next || undefined });
    setEditing(false);
  }, [component.id, name, updateComponent]);

  if (!name && !selected && !editing) return null;
  const shown = name || PLACEHOLDER;
  const placement = labelPlacement(component, viewMode, editing ? 'M'.repeat(12) : shown);
  if (!placement) return null;
  const { box, align } = placement;

  const base: React.CSSProperties = {
    position: 'absolute',
    left: width / 2 + box.left,
    top: height / 2 + box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
    lineHeight: `${box.bottom - box.top}px`,
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: LABEL_FONT_SIZE,
    fontWeight: 700,
    textAlign: align,
    whiteSpace: 'nowrap',
  };

  if (editing) {
    return (
      <input
        className="nodrag nopan"
        autoFocus
        defaultValue={name}
        maxLength={MAX_PART_NAME_LENGTH}
        placeholder="name"
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={(e) => commit(e.target.value)}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          ...base,
          top: height / 2 + box.top - 4,
          height: box.bottom - box.top + 8,
          boxSizing: 'border-box',
          border: '1px solid #FF2D55', borderRadius: 4, outline: 'none',
          padding: '0 3px', background: '#fff', color: '#222', zIndex: 10,
        }}
      />
    );
  }

  return (
    <div
      title={name ? 'Double-click to rename' : 'Double-click to name this part'}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{
        ...base,
        color: name ? (viewMode === 'schematic' ? '#FF2D55' : '#FFD0DA') : (viewMode === 'schematic' ? '#bbb' : '#8fc7a4'),
        cursor: 'text',
        userSelect: 'none',
      }}
    >
      {shown}
    </div>
  );
}
