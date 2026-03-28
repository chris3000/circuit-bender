import React, { useRef, useEffect, useCallback } from 'react';
import { parseValue, formatValue } from '@/utils/parameterParser';

interface ParameterEditorProps {
  value: string;
  parameterKey: 'resistance' | 'capacitance';
  position: { x: number; y: number };
  onConfirm: (rawValue: number, displayValue: string) => void;
  onCancel: () => void;
}

export const ParameterEditor = React.memo(function ParameterEditor({
  value,
  parameterKey,
  position,
  onConfirm,
  onCancel,
}: ParameterEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();

      if (e.key === 'Enter') {
        const raw = inputRef.current?.value ?? '';
        const parsed = parseValue(raw);
        if (!isNaN(parsed)) {
          const display = formatValue(parsed, parameterKey);
          onConfirm(parsed, display);
        }
        // Invalid input is silently ignored (editor stays open)
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [parameterKey, onConfirm, onCancel]
  );

  const handleBlur = useCallback(() => {
    onCancel();
  }, [onCancel]);

  return (
    <foreignObject x={position.x - 40} y={position.y - 14} width={80} height={28}>
      <input
        ref={inputRef}
        defaultValue={value}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: '100%',
          height: '100%',
          border: '1px solid #4CAF50',
          borderRadius: '3px',
          padding: '2px 4px',
          fontSize: '12px',
          textAlign: 'center',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </foreignObject>
  );
});
