import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { ComponentDrawer } from '@/views/ComponentDrawer/ComponentDrawer';

describe('ComponentDrawer', () => {
  beforeEach(() => {
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    registry.register(resistorDefinition);
  });

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

    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value: 'resist' } });

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });

  it('should hide components that do not match search', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value: 'capacitor' } });

    expect(screen.queryByText('Resistor')).not.toBeInTheDocument();
  });

  it('should filter by description', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value: 'limits current' } });

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });

  it('should filter case-insensitively', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value: 'RESISTOR' } });

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });

  it('should hide empty categories when search yields no results in that category', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

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

  it('should show a message when no components match the search', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value: 'zzzznotfound' } });

    expect(screen.getByText('No components found')).toBeInTheDocument();
  });

  it('should filter by category name', () => {
    render(<ComponentDrawer />);

    const searchInput = screen.getByPlaceholderText('Search components...');
    fireEvent.change(searchInput, { target: { value: 'passive' } });

    expect(screen.getByText('Resistor')).toBeInTheDocument();
  });
});
