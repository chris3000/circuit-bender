import React, { useRef, useEffect, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import { DROPPABLE_BREADBOARD_ID } from '@/constants/dnd';
import { BreadboardRenderer } from './BreadboardRenderer';
import { Toolbar } from '../SchematicView/Toolbar';
import styles from './BreadboardView.module.css';

interface BreadboardViewProps {
  activeView: 'schematic' | 'breadboard';
  onToggleView: () => void;
}

const BreadboardView: React.FC<BreadboardViewProps> = ({ activeView, onToggleView }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { circuit } = useCircuit();

  const { setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_BREADBOARD_ID,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderer = new BreadboardRenderer(ctx);

    // Calculate scale to fit container
    const boardW = renderer.boardDisplayWidth;
    const boardH = renderer.boardDisplayHeight;
    const scale = Math.min(
      (canvas.width * 0.9) / boardW,
      (canvas.height * 0.9) / boardH,
      4 // max scale
    );

    // Clear and center
    renderer.clear();
    ctx.save();
    const offsetX = (canvas.width - boardW * scale) / 2;
    const offsetY = (canvas.height - boardH * scale) / 2;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw board and components
    renderer.renderBoard();

    const components = circuit.getComponents();
    for (const component of components) {
      renderer.renderComponent(component);
    }

    // Render wires
    const connections = circuit.getConnections();
    const componentMap = new Map(
      components.map((c) => [c.id, c])
    );

    for (const connection of connections) {
      const fromComponent = componentMap.get(connection.from.componentId);
      const toComponent = componentMap.get(connection.to.componentId);
      if (!fromComponent || !toComponent) continue;

      const fromPos = renderer.boardPosition(
        fromComponent.position.breadboard.row,
        fromComponent.position.breadboard.column
      );
      const toPos = renderer.boardPosition(
        toComponent.position.breadboard.row,
        toComponent.position.breadboard.column
      );

      let color = '#4169E1';
      const fromColor = renderer.getWireColor(connection.from.componentId as string, componentMap as Map<string, typeof fromComponent>);
      const toColor = renderer.getWireColor(connection.to.componentId as string, componentMap as Map<string, typeof toComponent>);

      if (fromColor === '#FF0000' || toColor === '#FF0000') {
        color = '#FF0000';
      } else if (fromColor === '#000000' || toColor === '#000000') {
        color = '#000000';
      }

      renderer.renderWire(fromPos, toPos, color);
    }

    ctx.restore();
  }, [circuit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
      }
      draw();
    });

    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div
      ref={setNodeRef}
      className={styles.container}
      data-testid="breadboard-container"
      style={{ outline: isOver ? '2px dashed #FF2D55' : 'none' }}
    >
      <Toolbar
        toolMode="select"
        onToolModeChange={() => {}}
        activeView={activeView}
        onToggleView={onToggleView}
      />
      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          data-testid="breadboard-canvas"
        />
      </div>
    </div>
  );
};

export default BreadboardView;
