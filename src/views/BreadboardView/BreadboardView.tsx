import React, { useRef, useEffect } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { BreadboardRenderer } from './BreadboardRenderer';
import styles from './BreadboardView.module.css';

const BreadboardView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { circuit } = useCircuit();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderer = new BreadboardRenderer(ctx);

    // Clear and draw board
    renderer.clear();
    renderer.renderBoard();

    // Render components
    const components = circuit.getComponents();
    for (const component of components) {
      renderer.renderComponent(component);
    }

    // Render wires from connections
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

      // Wire color: red for power, black for ground, blue for others
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
  }, [circuit]);

  return (
    <div className={styles.container} data-testid="breadboard-container">
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-testid="breadboard-canvas"
      />
    </div>
  );
};

export default BreadboardView;
