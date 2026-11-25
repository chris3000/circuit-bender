/**
 * What each part does, as the app shows it: a tile of the shelf clicked (not
 * dragged) brings up the part's card, the card opens its example on the
 * canvas, and the example's words stay above the canvas.
 */
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import { ComponentDrawer } from '@/views/ComponentDrawer/ComponentDrawer';
import { ReplaceGuard } from '@/views/ReplaceGuard';
import { PartExamplesProvider, usePartExamples } from '@/views/PartExamples/PartExamplesContext';
import { ExampleNote, PartCard } from '@/views/PartExamples/PartCard';
import { partExampleFor } from '@/examples/parts';
import { capacitor, resistor } from '@/examples/circuits';
import { Circuit } from '@/models/Circuit';
import { Inspector } from '@/views/Inspector/Inspector';
import { ALL_PARTS } from './allParts';

/** What is on the canvas and what is selected, written out for the test to read. */
function Canvas() {
  const { circuit, selectedComponents, addComponent, isDirty } = useCircuit();
  const { ask } = usePartExamples();
  const selected = selectedComponents.map((id) => circuit.getComponent(id)?.type).join(',');
  return (
    <div>
      <output data-testid="canvas" data-name={circuit.name} data-selected={selected} data-dirty={isDirty || undefined}>
        {circuit.getComponents().map((c) => c.type).join(',')}
      </output>
      <button onClick={() => addComponent(resistor(1000, 0, 0))}>edit</button>
      <button onClick={() => ask({ definition: ALL_PARTS.find((d) => d.type === 'lm741')!, parameters: {}, at: { x: 900, left: 700, y: 100 } })}>ask</button>
    </div>
  );
}

function App() {
  return (
    <CircuitProvider>
      <ReplaceGuard>
        <PartExamplesProvider>
          <ComponentDrawer />
          <ExampleNote />
          <Canvas />
          <PartCard />
        </PartExamplesProvider>
      </ReplaceGuard>
    </CircuitProvider>
  );
}

const tile = (key: string) => screen.getAllByTestId(`shelf-item-${key}`).at(-1)!;
const card = () => screen.queryByTestId('part-card');
const canvas = () => screen.getByTestId('canvas');

describe('what each part does', () => {
  beforeEach(() => {
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    for (const definition of ALL_PARTS) registry.register(definition);
  });

  it('a tile that is clicked shows the part, what it does, and its example drawn', () => {
    render(<App />);
    expect(card()).toBeNull();
    fireEvent.click(tile('resistor@4700'));
    expect(screen.getByTestId('part-card-title')).toHaveTextContent('Resistor 4.7kΩ');
    expect(screen.getByTestId('part-card-about')).toHaveTextContent(/Holds current back.*shared out\.$/);
    expect(screen.getByTestId('part-card-example')).toHaveTextContent('Dimmer');
    expect(screen.getByTestId('part-card-text')).toHaveTextContent('the upper one has 4.7kΩ');
    // The drawing has the example's parts in it, the resistor's value among them
    const drawing = within(card()!).getByRole('img', { name: "The example's circuit" });
    expect(drawing.querySelectorAll('polyline').length).toBe(8);
    expect(drawing.textContent).toContain('4.7kΩ');
  });

  it('another value of the part has the example for that value; the same tile again, Esc or a click elsewhere puts the card away', () => {
    render(<App />);
    fireEvent.click(tile('resistor@4700'));
    fireEvent.click(tile('resistor@10000'));
    expect(screen.getByTestId('part-card-example')).toHaveTextContent('Pull-down');
    fireEvent.click(tile('resistor@10000'));
    expect(card()).toBeNull();

    fireEvent.click(tile('led'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(card()).toBeNull();

    fireEvent.click(tile('led'));
    fireEvent.mouseDown(card()!);
    expect(card()).not.toBeNull();
    fireEvent.mouseDown(canvas());
    expect(card()).toBeNull();
  });

  it('a tile can be asked from the keyboard, and picking the part up puts the card away', () => {
    render(<App />);
    fireEvent.keyDown(tile('cd40106'), { key: 'Enter' });
    expect(screen.getByTestId('part-card-title')).toHaveTextContent('CD40106');
    fireEvent.dragStart(tile('cd40106'), { dataTransfer: { setData: () => {}, setDragImage: () => {}, effectAllowed: '' } });
    expect(card()).toBeNull();
    expect(tile('cd40106').title).toContain('Click to see what it does');
  });

  it('opening the example puts it on the canvas, with the part it is about selected and its words above', () => {
    render(<App />);
    expect(screen.queryByTestId('example-note')).toBeNull();
    fireEvent.click(tile('led'));
    fireEvent.click(screen.getByTestId('part-card-open'));
    expect(card()).toBeNull();
    expect(canvas()).toHaveAttribute('data-name', 'A light');
    expect(canvas()).toHaveTextContent('power,ground,switch,resistor,led,ground');
    expect(canvas()).toHaveAttribute('data-selected', 'led');
    // An example that was only opened is not unsaved work
    expect(canvas()).not.toHaveAttribute('data-dirty');
    const note = screen.getByTestId('example-note');
    expect(note).toHaveTextContent('A light');
    expect(note).toHaveTextContent(partExampleFor(ALL_PARTS.find((d) => d.type === 'led')!)!.description);
  });

  it('the words stay while the example is worked on, and go when they are closed or another circuit takes its place', () => {
    render(<App />);
    fireEvent.click(tile('led'));
    fireEvent.click(screen.getByTestId('part-card-open'));
    fireEvent.click(screen.getByText('edit'));
    expect(screen.getByTestId('example-note')).toHaveTextContent('A light');
    fireEvent.click(screen.getByLabelText('Close the note'));
    expect(screen.queryByTestId('example-note')).toBeNull();

    // Another example: the work on the first is asked about before it is thrown away
    fireEvent.click(tile('switch'));
    fireEvent.click(screen.getByTestId('part-card-open'));
    expect(canvas()).toHaveAttribute('data-name', 'A light');
    expect(screen.queryByTestId('example-note')).toBeNull();
    fireEvent.click(screen.getByText('Discard and open'));
    expect(canvas()).toHaveAttribute('data-name', 'On and off');
    expect(canvas()).toHaveAttribute('data-selected', 'switch');
    expect(screen.getByTestId('example-note')).toHaveTextContent('On and off');
  });

  it('a part asked about from elsewhere (the inspector) gets the same card', () => {
    render(<App />);
    fireEvent.click(screen.getByText('ask'));
    expect(screen.getByTestId('part-card-title')).toHaveTextContent('LM741');
    expect(screen.getByTestId('part-card-about')).toHaveTextContent('op-amp');
  });

  it('the inspector offers the card of the selected part, for the value it has', () => {
    const part = capacitor(10e-6, 100, 100);
    function Select() {
      const { setSelection } = useCircuit();
      useEffect(() => setSelection([part.id], []), [setSelection]);
      return null;
    }
    render(
      <CircuitProvider initial={{ circuit: new Circuit('Test').addComponent(part), dirty: false }}>
        <ReplaceGuard>
          <PartExamplesProvider>
            <Select />
            <Inspector viewMode="schematic" onDeleteComponents={vi.fn()} />
            <PartCard />
          </PartExamplesProvider>
        </ReplaceGuard>
      </CircuitProvider>,
    );
    fireEvent.click(screen.getByTestId('inspector-about'));
    expect(screen.getByTestId('part-card-title')).toHaveTextContent('Capacitor 10uF');
    expect(screen.getByTestId('part-card-example')).toHaveTextContent('Slow enough to see');
    // The button again puts it away
    fireEvent.mouseDown(screen.getByTestId('inspector-about'));
    fireEvent.click(screen.getByTestId('inspector-about'));
    expect(card()).toBeNull();
  });

  it('every part and every value on the shelf has a card with something to open', () => {
    for (const definition of ALL_PARTS) {
      for (const value of definition.value ? definition.shelf?.stock ?? [] : [undefined]) {
        const chosen = partExampleFor(definition, value === undefined ? {} : { [definition.value!.parameter]: value });
        expect(chosen, `${definition.type} ${value ?? ''}`).not.toBeNull();
      }
    }
  });
});
