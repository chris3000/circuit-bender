import { useCallback } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import type { ComponentId } from '@/types/circuit';

interface RotateButtonProps {
  componentId: string;
  rotation: number;
  /** Where to put the button's top-left corner, in the node's own coordinates. */
  left: number;
  top: number;
}

export const ROTATE_BUTTON_SIZE = 18;

/** Small rotate button shown beside a selected component, clear of its symbol. */
export function RotateButton({ componentId, rotation, left, top }: RotateButtonProps) {
  const { updateComponent } = useCircuit();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const newRotation = ((rotation || 0) + 90) % 360;
    updateComponent(componentId as ComponentId, { rotation: newRotation });
  }, [componentId, rotation, updateComponent]);

  return (
    <div
      className="nodrag nopan"
      onClick={handleClick}
      title="Rotate 90° (R)"
      style={{
        position: 'absolute',
        left,
        top,
        width: ROTATE_BUTTON_SIZE,
        height: ROTATE_BUTTON_SIZE,
        borderRadius: '50%',
        background: '#FF2D55',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path
          d="M6 1 A5 5 0 1 1 1 6"
          fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"
        />
        <path d="M6 0 L6 3 L3 1.5 Z" fill="white" />
      </svg>
    </div>
  );
}
