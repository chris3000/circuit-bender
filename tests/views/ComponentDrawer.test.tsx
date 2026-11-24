import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { ComponentDrawer } from '@/views/ComponentDrawer/ComponentDrawer';
import { junctionDefinition } from '@/components/definitions/Junction';
import { ALL_PARTS } from './allParts';

const store = new Map<string, string>();
const tiles = () => screen.queryAllByRole('listitem').map((el) => el.getAttribute('data-testid')!.replace('shelf-item-', ''));
// A part used lately is on the shelf twice, under Recent and in its usual place: this is the usual place
const tile = (key: string) => screen.getAllByTestId(`shelf-item-${key}`).at(-1)!;
const search = (text: string) => fireEvent.change(screen.getByLabelText('Search parts'), { target: { value: text } });
const remembered = () => JSON.parse(store.get('circuit_bender_shelf') ?? '{}');

/** A drag of a tile that ends dropped somewhere that took it (or, with `taken` false, nowhere). */
function drag(key: string, taken = true) {
  const data = new Map<string, string>();
  const dataTransfer = {
    setData: (k: string, v: string) => { data.set(k, v); }, setDragImage: () => {},
    effectAllowed: '', dropEffect: taken ? 'move' : 'none',
  };
  fireEvent.dragStart(tile(key), { dataTransfer });
  fireEvent.dragEnd(tile(key), { dataTransfer });
  return data;
}

describe('the parts shelf', () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    for (const definition of ALL_PARTS) registry.register(definition);
  });

  it('shows every part, and for parts that come in values the common ones', () => {
    render(<ComponentDrawer />);
    expect(screen.getByTestId('component-drawer')).toBeInTheDocument();
    const shown = tiles();
    expect(shown.slice(0, 3)).toEqual(['power', 'ground', 'audio-output']);
    for (const key of ['junction', 'cd40106', 'lm741', '2n3904', '1n914', 'led', 'switch']) expect(shown).toContain(key);
    expect(shown.filter((k) => k.startsWith('resistor@'))).toHaveLength(12);
    expect(shown.filter((k) => k.startsWith('capacitor@'))).toHaveLength(12);
    expect(shown.filter((k) => k.startsWith('potentiometer@'))).toHaveLength(8);
    expect(screen.getByText('161')).toBeInTheDocument(); // everything in stock
  });

  it('names each part and says what it is', () => {
    render(<ComponentDrawer />);
    expect(within(tile('cd40106')).getByText('CD40106', { selector: 'span' })).toBeInTheDocument(); // and printed on the chip
    expect(within(tile('cd40106')).getByText('Schmitt ×6')).toBeInTheDocument();
    expect(within(tile('resistor@4700')).getByText('4.7kΩ')).toBeInTheDocument();
    expect(tile('resistor@4700')).toHaveAccessibleName('Resistor 4.7kΩ');
    expect(tile('2n3904').title).toContain('NPN');
  });

  it('draws a resistor with the colour bands of its value', () => {
    render(<ComponentDrawer />);
    const bands = (key: string) => [...tile(key).querySelectorAll('svg rect')].slice(0, 4).map((r) => r.getAttribute('fill'));
    expect(bands('resistor@4700')).toEqual(['#F5D21F', '#8E44C9', '#D62828', '#C9A227']); // yellow violet red, gold
    expect(bands('resistor@100000')).toEqual(['#7B4A1E', '#1E1E1E', '#F5D21F', '#C9A227']); // brown black yellow
    expect(new Set(tiles().filter((k) => k.startsWith('resistor@')).map((k) => bands(k).join())).size).toBe(12);
  });

  it('draws a capacitor as the kind its value comes in, marked with its value', () => {
    render(<ComponentDrawer />);
    expect(tile('capacitor@1e-10').querySelector('svg')).toHaveTextContent('101'); // ceramic disc
    expect(tile('capacitor@1e-7').querySelector('svg')).toHaveTextContent('104'); // film
    expect(tile('capacitor@0.00001').querySelector('svg')).toHaveTextContent('10µ'); // electrolytic
    expect(tile('capacitor@1e-10').querySelector('circle')).not.toBeNull();
    expect(tile('capacitor@1e-7').querySelector('circle')).toBeNull();
  });

  it('shows all the values of a part when asked, and remembers that', () => {
    const { unmount } = render(<ComponentDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'All 73 values' }));
    expect(tiles().filter((k) => k.startsWith('resistor@'))).toHaveLength(73);
    expect(tiles().filter((k) => k.startsWith('capacitor@'))).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /All \d+ values/, expanded: false })).toHaveTextContent('All 49 values');
    unmount();

    render(<ComponentDrawer />);
    expect(tiles().filter((k) => k.startsWith('resistor@'))).toHaveLength(73);
    fireEvent.click(screen.getByRole('button', { name: 'Common values' }));
    expect(tiles().filter((k) => k.startsWith('resistor@'))).toHaveLength(12);
  });

  it('has no "all values" for a part whose values are all shown', () => {
    render(<ComponentDrawer />);
    expect(within(screen.getByTestId('shelf-values-potentiometer')).queryByRole('button')).toBeNull();
  });

  it('folds a category away, and remembers that', () => {
    const { unmount } = render(<ComponentDrawer />);
    const passive = screen.getByRole('button', { name: /Passive/ });
    expect(passive).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(passive);
    expect(passive).toHaveAttribute('aria-expanded', 'false');
    expect(tiles().some((k) => k.startsWith('resistor@') || k === 'junction')).toBe(false);
    expect(tiles()).toContain('cd40106');
    unmount();

    render(<ComponentDrawer />);
    expect(tiles().some((k) => k.startsWith('resistor@'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Passive/ }));
    expect(tiles()).toContain('resistor@4700');
  });

  describe('search', () => {
    it('narrows the shelf to what was typed', () => {
      render(<ComponentDrawer />);
      search('schmitt');
      expect(tiles()).toEqual(['cd40106', 'cd4093']);
      expect(screen.getByRole('status')).toHaveTextContent('2 matches');
      search('opamp');
      expect(tiles()).toEqual(['lm741', 'lm324', 'tl072']);
      expect(screen.getByRole('status')).toHaveTextContent('3 matches');
      search('pnp');
      expect(tiles()).toEqual(['2n3906']);
      expect(screen.getByRole('status')).toHaveTextContent('1 match');
    });

    it('finds values that are not among the common ones', () => {
      render(<ComponentDrawer />);
      expect(tiles()).not.toContain('resistor@3300');
      search('3.3k');
      expect(tiles()[0]).toBe('resistor@3300');
    });

    it('makes a value that is not stocked, and marks it as made to order', () => {
      render(<ComponentDrawer />);
      search('56n');
      expect(tiles()).toEqual(['capacitor@5.6e-8']);
      expect(tile('capacitor@5.6e-8').title).toContain('made to order');
      expect(within(tile('capacitor@5.6e-8')).getByText('56nF')).toBeInTheDocument();
    });

    it('looks in folded categories and unshown values too', () => {
      render(<ComponentDrawer />);
      fireEvent.click(screen.getByRole('button', { name: /Passive/ }));
      search('solder');
      expect(tiles()).toEqual(['junction']);
    });

    it('says when nothing matches, and how to do better', () => {
      render(<ComponentDrawer />);
      search('flux capacitor');
      expect(tiles()).toEqual([]);
      expect(screen.getByRole('status')).toHaveTextContent('Nothing matches flux capacitor');
      expect(screen.getByRole('status')).toHaveTextContent('47k');
    });

    it('is cleared by its button or Escape, bringing the shelf back', () => {
      render(<ComponentDrawer />);
      search('gnd');
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
      expect(screen.getByLabelText('Search parts')).toHaveValue('');
      expect(tiles().length).toBeGreaterThan(40);
      search('gnd');
      fireEvent.keyDown(screen.getByLabelText('Search parts'), { key: 'Escape' });
      expect(screen.getByLabelText('Search parts')).toHaveValue('');
    });

    it('is where "/" goes from anywhere but a text field', () => {
      render(<><ComponentDrawer /><input aria-label="elsewhere" /></>);
      fireEvent.keyDown(screen.getByLabelText('elsewhere'), { key: '/' });
      expect(screen.getByLabelText('Search parts')).not.toHaveFocus();
      fireEvent.keyDown(document.body, { key: '/' });
      expect(screen.getByLabelText('Search parts')).toHaveFocus();
    });
  });

  describe('dragging', () => {
    it('carries the part and its value', () => {
      render(<ComponentDrawer />);
      const data = drag('resistor@4700');
      expect(data.get('application/circuit-component')).toBe('resistor');
      expect(JSON.parse(data.get('application/circuit-parameters')!)).toEqual({ resistance: 4700, value: '4.7kΩ' });
      expect(drag('cd40106').get('application/circuit-component')).toBe('cd40106');
    });

    it('keeps the parts used last to hand, newest first, each once', () => {
      render(<ComponentDrawer />);
      expect(screen.queryByTestId('shelf-section-recent')).toBeNull();
      drag('resistor@4700');
      drag('cd40106');
      drag('resistor@4700');
      const recent = within(screen.getByTestId('shelf-section-recent')).getAllByRole('listitem');
      expect(recent.map((el) => el.getAttribute('data-testid'))).toEqual(['shelf-item-resistor@4700', 'shelf-item-cd40106']);
      expect(remembered().recent).toEqual(['resistor@4700', 'cd40106']);
    });

    it('does not count a drag that was dropped nowhere', () => {
      render(<ComponentDrawer />);
      drag('led', false);
      expect(screen.queryByTestId('shelf-section-recent')).toBeNull();
    });

    it('remembers a made-to-order value like any other', () => {
      const { unmount } = render(<ComponentDrawer />);
      search('56n');
      drag('capacitor@5.6e-8');
      unmount();
      render(<ComponentDrawer />);
      expect(within(screen.getByTestId('shelf-section-recent')).getByText('56nF')).toBeInTheDocument();
    });

    it('keeps no more than eight', () => {
      render(<ComponentDrawer />);
      for (const key of ['power', 'ground', 'audio-output', 'junction', 'cd40106', 'lm741', '2n3904', '1n914', 'led', 'switch']) drag(key);
      expect(remembered().recent).toEqual(['switch', 'led', '1n914', '2n3904', 'lm741', 'cd40106', 'junction', 'audio-output']);
    });
  });

  it('folds to a strip and comes back, by its button or "/"', () => {
    const { unmount } = render(<ComponentDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide the parts shelf' }));
    expect(tiles()).toEqual([]);
    expect(screen.queryByLabelText('Search parts')).toBeNull();
    unmount();

    render(<ComponentDrawer />); // still folded on the next visit
    expect(tiles()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Show the parts shelf' }));
    expect(tiles().length).toBeGreaterThan(40);

    fireEvent.click(screen.getByRole('button', { name: 'Hide the parts shelf' }));
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByLabelText('Search parts')).toHaveFocus();
  });

  it('gives a part that says nothing about the shelf a place, drawn with its board symbol', () => {
    ComponentRegistry.getInstance().register({
      ...junctionDefinition, type: 'mystery', shelf: undefined,
      metadata: { name: 'Mystery Part', category: 'active', description: 'Does something' },
    });
    render(<ComponentDrawer />);
    expect(within(tile('mystery')).getByText('Mystery Part')).toBeInTheDocument();
    expect(tile('mystery').querySelector('svg circle')).toHaveAttribute('fill', '#C4C8CC');
  });

  it('works without anywhere to remember things', () => {
    vi.stubGlobal('localStorage', undefined);
    render(<ComponentDrawer />);
    fireEvent.click(screen.getByRole('button', { name: /Chips/ }));
    expect(tiles()).not.toContain('cd40106');
    drag('led');
    expect(screen.getByTestId('shelf-section-recent')).toBeInTheDocument();
  });

  it('forgets remembered parts that no longer exist', () => {
    store.set('circuit_bender_shelf', JSON.stringify({ recent: ['theremin', 'resistor@1000', 42], closed: 'nonsense' }));
    render(<ComponentDrawer />);
    const recent = within(screen.getByTestId('shelf-section-recent')).getAllByRole('listitem');
    expect(recent.map((el) => el.getAttribute('data-testid'))).toEqual(['shelf-item-resistor@1000']);
    expect(tiles()).toContain('cd40106');
  });
});
