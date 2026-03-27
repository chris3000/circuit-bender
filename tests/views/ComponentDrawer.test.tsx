import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { ComponentDrawer } from '@/views/ComponentDrawer/ComponentDrawer';

describe('ComponentDrawer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    registry.register(resistorDefinition);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Helper: type into search and flush the 200ms debounce */
  function searchFor(value: string) {
    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
  }

  it('should render the component drawer sidebar', () => {
    render(<ComponentDrawer />);

    const drawer = screen.getByTestId('component-drawer');
    expect(drawer).toBeInTheDocument();
  });

  it('should render the search bar', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByPlaceholderText('Search components...');
    expect(searchInput).toBeInTheDocument();
  });

  it('should have aria-label on search input', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByLabelText('Search components');
    expect(searchInput).toBeInTheDocument();
  });

  it('should render category sections based on registered components', () => {
    render(<ComponentDrawer />);

    // Resistor is in the "passive" category, which maps to "Passive Components"
    expect(screen.getByText('Passive Components')).toBeInTheDocument();
  });

  it('should display the Resistor component card', () => {
    render(<ComponentDrawer />);

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });

  it('should display category badge on component card', () => {
    render(<ComponentDrawer />);

    const badge = screen.getByTestId('category-badge-resistor');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('passive');
  });

  it('should render schematic symbol SVG in component card', () => {
    render(<ComponentDrawer />);

    const svg = screen.getByTestId('component-symbol-resistor');
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });

  it('should filter components by name when searching', () => {
    render(<ComponentDrawer />);

    searchFor('resist');

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });

  it('should hide components that do not match search', () => {
    render(<ComponentDrawer />);

    searchFor('capacitor');

    expect(screen.queryByText('Resistor')).not.toBeInTheDocument();
  });

  it('should filter by description', () => {
    render(<ComponentDrawer />);

    searchFor('limits current');

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });

  it('should filter case-insensitively', () => {
    render(<ComponentDrawer />);

    searchFor('RESISTOR');

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });

  it('should hide empty categories when search yields no results in that category', () => {
    render(<ComponentDrawer />);

    searchFor('nonexistent');

    expect(screen.queryByText('Passive Components')).not.toBeInTheDocument();
  });

  it('should toggle category section collapse', () => {
    render(<ComponentDrawer />);

    const categoryHeader = screen.getByText('Passive Components');
    const categoryContent = screen.getByTestId('category-content-passive');

    // Should start expanded
    expect(categoryContent).toBeVisible();

    // Click to collapse
    fireEvent.click(categoryHeader);
    expect(categoryContent).not.toBeVisible();

    // Click to expand again
    fireEvent.click(categoryHeader);
    expect(categoryContent).toBeVisible();
  });

  it('should toggle category with keyboard Enter key', () => {
    render(<ComponentDrawer />);

    const categoryHeader = screen.getByRole('button', { name: /passive components/i });
    const categoryContent = screen.getByTestId('category-content-passive');

    expect(categoryContent).toBeVisible();

    // Press Enter to collapse
    fireEvent.keyDown(categoryHeader, { key: 'Enter' });
    expect(categoryContent).not.toBeVisible();

    // Press Enter to expand
    fireEvent.keyDown(categoryHeader, { key: 'Enter' });
    expect(categoryContent).toBeVisible();
  });

  it('should toggle category with keyboard Space key', () => {
    render(<ComponentDrawer />);

    const categoryHeader = screen.getByRole('button', { name: /passive components/i });
    const categoryContent = screen.getByTestId('category-content-passive');

    expect(categoryContent).toBeVisible();

    // Press Space to collapse
    fireEvent.keyDown(categoryHeader, { key: ' ' });
    expect(categoryContent).not.toBeVisible();
  });

  it('should show a message when no components match the search', () => {
    render(<ComponentDrawer />);

    searchFor('zzzznotfound');

    expect(screen.getByText('No components found')).toBeInTheDocument();
  });

  it('should filter by category name', () => {
    render(<ComponentDrawer />);

    searchFor('passive');

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });

  it('should debounce search input', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value: 'capacitor' } });

    // Before debounce fires, Resistor should still be visible
    expect(screen.getByText('Resistor')).toBeInTheDocument();

    // After debounce, filter applies
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText('Resistor')).not.toBeInTheDocument();
  });
});
