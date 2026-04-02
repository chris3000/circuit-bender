import { useCallback } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import type { ComponentId } from '@/types/circuit';

interface RotateButtonProps {
  componentId: string;
  rotation: number;
  width: number;
  height: number;
}

/** Small rotate button that appears at the top-right corner of a selected component. */
export function RotateButton({ componentId, rotation, width, height }: RotateButtonProps) {
  const { updateComponent } = useCircuit();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const newRotation = ((rotation || 0) + 90) % 360;
    updateComponent(componentId as ComponentId, { rotation: newRotation });
  }, [componentId, rotation, updateComponent]);

  return (
    <div
      onClick={handleClick}
      title="Rotate 90° (R)"
      style={{
        position: 'absolute',
        right: -6,
        top: -6,
        width: 18,
        height: 18,
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
