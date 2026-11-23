interface ValueEditorProps {
  value: string;
  onConfirm: (raw: string) => void;
  onCancel: () => void;
}

/** Small input above a part for typing a new value ("4.7k", "100n"). */
export function ValueEditor({ value, onConfirm, onCancel }: ValueEditorProps) {
  return (
    <input
      className="nodrag nopan"
      autoFocus
      defaultValue={value}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onConfirm((e.target as HTMLInputElement).value);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={onCancel}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
        width: 80, height: 24, boxSizing: 'border-box',
        border: '1px solid #FF2D55', borderRadius: 4, padding: '2px 4px',
        fontFamily: "'Courier New', Courier, monospace", fontSize: 12, textAlign: 'center',
        outline: 'none', background: 'white', zIndex: 10,
      }}
    />
  );
}
