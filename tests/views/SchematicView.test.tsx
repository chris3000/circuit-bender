import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CircuitProvider } from '@/context/CircuitContext';
import SchematicView from '@/views/SchematicView';

describe('SchematicView', () => {
  it('should render SVG canvas', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    const svg = screen.getByTestId('schematic-svg');
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });

  it('should show grid', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    const grid = screen.getByTestId('schematic-grid');
    expect(grid).toBeInTheDocument();
  });

  it('should have view controls', () => {
    render(
      <CircuitProvider>
        <SchematicView />
      </CircuitProvider>
    );

    expect(screen.getByText(/zoom/i)).toBeInTheDocument();
  });
});
