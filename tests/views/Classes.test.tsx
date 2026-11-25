/**
 * Taking a class: the menu that starts it and the panel beside the canvas,
 * which watches the learner's own circuit and ticks things off as they are done.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import { ReplaceGuard } from '@/views/ReplaceGuard';
import { ClassesProvider } from '@/views/Classes/ClassesContext';
import { ClassesMenu } from '@/views/Classes/ClassesMenu';
import { ClassPanel } from '@/views/Classes/ClassPanel';
import { theLoop } from '@/classes/theLoop';
import { readProgress } from '@/classes/progress';
import { place, resistor } from '@/examples/circuits';
import { formatValue } from '@/utils/parameterParser';
import type { ActiveView } from '@/views/viewModes';
import { ALL_PARTS } from './allParts';

beforeEach(() => {
  localStorage.clear();
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

let canvas: ReturnType<typeof useCircuit>;
function Canvas() {
  canvas = useCircuit();
  return null;
}

function App({ playing = false, view = 'schematic' as ActiveView }) {
  return (
    <CircuitProvider>
      <ReplaceGuard>
        <ClassesProvider>
          <Canvas />
          <ClassesMenu />
          <ClassPanel playing={playing} view={view} />
        </ClassesProvider>
      </ReplaceGuard>
    </CircuitProvider>
  );
}

const done = () => screen.queryAllByTestId(/^class-step-/).filter((s) => s.dataset.done).map((s) => s.dataset.testid!.replace('class-step-', ''));
const only = (type: string) => canvas.circuit.getComponents().find((c) => c.type === type)!;
const tab = (id: string) => fireEvent.click(screen.getByTestId(`class-tab-${id}`));

/** Class 1 open, with its finished circuit on the canvas. */
function begun(props: Parameters<typeof App>[0] = {}) {
  const view = render(<App {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
  fireEvent.click(screen.getByTestId('class-1'));
  fireEvent.click(screen.getByText(/^Stuck\?/));
  return view;
}
const closeSwitch = () => act(() => canvas.updateComponent(only('switch').id, { parameters: { ...only('switch').parameters, closed: 1 } }));
const setResistor = (ohms: number) => act(() => canvas.updateComponent(only('resistor').id, {
  parameters: { ...only('resistor').parameters, resistance: ohms, value: formatValue(ohms, 'resistance') },
}));

describe('the classes menu', () => {
  it('lists the whole course, every class ready to start', () => {
    render(<App />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(14);
    expect(items[0]).toHaveTextContent('The loop');
    expect(items[13]).toHaveTextContent('Bending, and the Weird Sound Generator');
    for (const item of items) {
      expect(item).toBeEnabled();
      expect(item).toHaveTextContent('START');
    }
  });

  it('starts a class on an empty canvas named for it, and closes', () => {
    render(<App />);
    expect(screen.queryByTestId('class-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    fireEvent.click(screen.getByTestId('class-1'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByTestId('class-panel')).toHaveTextContent('The loop');
    expect(canvas.circuit.name).toBe('Class 1: The loop');
    expect(canvas.circuit.getComponents()).toHaveLength(0);
    expect(readProgress().open).toBe('the-loop');
  });

  it('starts a class that follows on from another with that circuit on the canvas, as work not yet saved', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    fireEvent.click(screen.getByTestId('class-3'));
    expect(screen.getByTestId('class-panel')).toHaveTextContent('Storing charge');
    expect(canvas.circuit.name).toBe('Class 3: Storing charge');
    // The light class 1 keeps, with its switch named
    expect(only('switch').label).toBe('LIGHT');
    expect(only('led')).toBeDefined();
    expect(canvas.isDirty).toBe(true);
    expect(done()).toEqual([]);
  });

  it('asks before a class takes the place of unsaved work, and does not start if the answer is no', () => {
    render(<App />);
    act(() => canvas.addComponent(resistor(100, 0, 0)));
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    fireEvent.click(screen.getByTestId('class-1'));
    expect(screen.queryByTestId('class-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /cancel|keep/i }));
    expect(screen.queryByTestId('class-panel')).toBeNull();
    expect(canvas.circuit.getComponents()).toHaveLength(1);
  });

  it('says a class is open, then that it can be continued, and picks it up where it was left', () => {
    begun();
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    expect(screen.getByTestId('class-1')).toHaveTextContent('OPEN');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    tab('why');
    fireEvent.click(screen.getByRole('button', { name: 'Close the class' }));
    expect(screen.queryByTestId('class-panel')).toBeNull();
    const parts = canvas.circuit.getComponents().length;

    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    expect(screen.getByTestId('class-1')).toHaveTextContent('CONTINUE');
    fireEvent.click(screen.getByTestId('class-1'));
    expect(screen.getByTestId('class-section-why')).toBeInTheDocument();
    expect(canvas.circuit.getComponents()).toHaveLength(parts); // the canvas was left alone
  });
});

describe('building', () => {
  it('ticks each step when the canvas shows it done, and says how to do the next', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    fireEvent.click(screen.getByTestId('class-1'));
    expect(done()).toEqual([]);
    expect(screen.getByTestId('class-step-supply')).toHaveAttribute('data-next');
    expect(screen.getByTestId('class-step-supply')).toHaveTextContent(/shelf/);

    act(() => canvas.addComponent(place('power', 0, 0)));
    expect(done()).toEqual(['supply']);
    expect(screen.getByTestId('class-step-ground')).toHaveAttribute('data-next');

    // Out of order is fine: what is done is done
    act(() => canvas.addComponent(place('led', 200, 0)));
    expect(done()).toEqual(['supply', 'led']);
    expect(screen.getByTestId('class-step-ground')).toHaveAttribute('data-next');
  });

  it('a step once done stays done, whatever happens to the circuit next', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    fireEvent.click(screen.getByTestId('class-1'));
    const supply = place('power', 0, 0);
    act(() => canvas.addComponent(supply));
    act(() => canvas.removeComponent(supply.id));
    expect(done()).toEqual(['supply']);
  });

  it('with the finished circuit on the canvas, what is left is to play it, light it and read it', () => {
    const view = begun();
    expect(done()).toEqual(['supply', 'ground', 'return', 'switch', 'resistor', 'led', 'wire-switch', 'wire-resistor', 'wire-led', 'wire-ground']);
    expect(screen.getByTestId('class-tab-build')).not.toHaveAttribute('data-done');

    view.rerender(<App playing />);
    expect(done()).toContain('play');
    expect(done()).not.toContain('light');
    closeSwitch();
    expect(done()).toContain('light');
    act(() => canvas.setSelection([only('led').id], []));
    expect(done()).toContain('meter');
    expect(screen.getByTestId('class-tab-build')).toHaveAttribute('data-done');
    expect(screen.getByTestId('class-section-build')).toHaveTextContent('It works. Now for why.');
    expect(screen.queryByText(/^Stuck\?/)).toBeNull();
  });

  it('in a class that builds several things, "Stuck?" gives the one being worked on', () => {
    render(<App playing />);
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    fireEvent.click(screen.getByTestId('class-2'));
    fireEvent.click(screen.getByText('Stuck? Put this part of the build on the canvas, finished.'));
    // The divider alone: the knob and the photocell come later
    expect(canvas.circuit.getComponents().filter((c) => c.type === 'resistor')).toHaveLength(2);
    expect(only('potentiometer')).toBeUndefined();
    const first = done();
    expect(first.length).toBeGreaterThan(0);
    // With that part done, the same button gives the next
    for (const wire of canvas.circuit.getConnections()) act(() => canvas.setSelection([], [wire.id]));
    fireEvent.click(screen.getByText('Stuck? Put this part of the build on the canvas, finished.'));
    // What is on the canvas was never saved, so it is asked about first
    fireEvent.click(screen.getByRole('button', { name: 'Discard and open' }));
    expect(only('potentiometer')).toBeDefined();
    expect(done().length).toBeGreaterThan(first.length);
  });

  it('start over empties the canvas and the list', () => {
    begun();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    // The circuit on the canvas was never saved: it asks first
    fireEvent.click(screen.getByRole('button', { name: 'Discard and open' }));
    expect(canvas.circuit.getComponents()).toHaveLength(0);
    expect(done()).toEqual([]);
    expect(screen.getByTestId('class-section-build')).toBeInTheDocument();
  });
});

describe('the parts of a class', () => {
  it('steps through them with the buttons at the bottom, and by the tabs', () => {
    begun();
    fireEvent.click(screen.getByTestId('class-next'));
    expect(screen.getByTestId('class-section-why')).toHaveTextContent('6.8 V ÷ 470 Ω');
    fireEvent.click(screen.getByTestId('class-next'));
    expect(screen.getByTestId('class-section-try')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /← WHY/i }));
    expect(screen.getByTestId('class-section-why')).toBeInTheDocument();
    tab('words');
    expect(screen.getByTestId('class-section-words')).toHaveTextContent(theLoop.words[0].word);
    expect(screen.queryByTestId('class-next')).toBeNull();
    expect(readProgress().classes['the-loop'].section).toBe(5);
  });

  it('keys pressed in the panel are not canvas shortcuts', () => {
    begun();
    let heard = 0;
    const listen = () => { heard++; };
    document.body.addEventListener('keydown', listen);
    fireEvent.keyDown(screen.getByTestId('class-tab-why'), { key: 'Backspace' });
    document.body.removeEventListener('keydown', listen);
    expect(heard).toBe(0);
  });
});

describe('trying things', () => {
  const trial = (id: string) => screen.getByTestId(`class-try-${id}`);

  it('wants a guess before it shows what happened', () => {
    begun({ playing: true });
    closeSwitch();
    tab('try');
    expect(trial('ten-times')).toHaveTextContent('Pick one before you try it.');

    // The change made without a guess shows nothing
    setResistor(4700);
    expect(trial('ten-times')).not.toHaveAttribute('data-shown');

    fireEvent.click(within(trial('ten-times')).getAllByRole('button')[0]);
    expect(trial('ten-times')).toHaveAttribute('data-shown');
    expect(trial('ten-times')).toHaveTextContent('Not what you guessed.');
    expect(trial('ten-times')).toHaveTextContent('1.49 mA');
    for (const option of within(trial('ten-times')).getAllByRole('button')) expect(option).toBeDisabled();
  });

  it('says so when the guess was right, and keeps what it showed when the circuit moves on', () => {
    begun({ playing: true });
    closeSwitch();
    tab('try');
    const options = within(trial('ten-times')).getAllByRole('button');
    fireEvent.click(options[theLoop.tries.find((t) => t.id === 'ten-times')!.answer]);
    expect(trial('ten-times')).toHaveTextContent('Now try it.');
    setResistor(4700);
    expect(trial('ten-times')).toHaveTextContent('As you guessed.');
    const shown = trial('ten-times').textContent;
    setResistor(470);
    expect(trial('ten-times').textContent).toBe(shown);
    expect(screen.getByTestId('class-tab-try')).not.toHaveAttribute('data-done');
  });
});

describe('the check', () => {
  it('reads the learner\'s own circuit, and finishes the class when it reads right', () => {
    begun({ playing: true });
    closeSwitch();
    tab('check');
    expect(screen.getByTestId('class-reading')).toHaveTextContent('Your LED: 14.5 mA');
    expect(screen.queryByTestId('class-finished')).toBeNull();

    fireEvent.click(screen.getByText('Show a hint'));
    expect(screen.getByTestId('class-section-check')).toHaveTextContent(theLoop.check.hint);

    setResistor(3300);
    expect(screen.getByTestId('class-reading')).toHaveTextContent('Your LED: 2.12 mA');
    expect(screen.getByTestId('class-finished')).toBeInTheDocument();
    expect(screen.getByTestId('class-tab-check')).toHaveAttribute('data-done');
    expect(readProgress().classes['the-loop'].finished).toBe(true);

    // Finished is finished
    setResistor(470);
    expect(screen.getByTestId('class-finished')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    expect(screen.getByTestId('class-1')).toHaveTextContent('DONE');
  });

  it('looks at once when a control starts to be worked, then waits for it to rest', async () => {
    begun({ playing: true });
    tab('check');
    const turn = (ohms: number) => act(() => canvas.updateComponent(only('resistor').id, {
      parameters: { ...only('resistor').parameters, resistance: ohms, value: formatValue(ohms, 'resistance') },
    }, { record: false }));
    // The first movement is seen as it happens: a button pressed is seen while it is held
    act(() => canvas.updateComponent(only('switch').id, { parameters: { ...only('switch').parameters, closed: 1 } }, { record: false }));
    expect(screen.getByTestId('class-reading')).toHaveTextContent('Your LED: 14.5 mA');
    // A knob on its way round is not measured at every place it passes
    turn(1000);
    turn(2200);
    turn(3300);
    expect(screen.getByTestId('class-reading')).toHaveTextContent('Your LED: 14.5 mA');
    expect(screen.queryByTestId('class-finished')).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 260)));
    expect(screen.getByTestId('class-reading')).toHaveTextContent('Your LED: 2.12 mA');
    expect(screen.getByTestId('class-finished')).toBeInTheDocument();
    // An edit that is a step of its own is looked at straight away
    setResistor(470);
    expect(screen.getByTestId('class-reading')).toHaveTextContent('Your LED: 14.5 mA');
  });

  it('does not count a right value met on the way there', () => {
    begun({ playing: true });
    closeSwitch();
    tab('try');
    setResistor(3300);
    expect(readProgress().classes['the-loop'].finished).toBe(false);
    setResistor(470);
    tab('check');
    expect(screen.queryByTestId('class-finished')).toBeNull();
  });

  it('has nothing to read from an empty canvas', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Classes/ }));
    fireEvent.click(screen.getByTestId('class-1'));
    tab('check');
    expect(screen.getByTestId('class-reading')).toHaveTextContent('Nothing to measure yet.');
  });
});

describe('keeping it', () => {
  it('ticks naming the switch, looking at the cover and saving, and says what comes next', () => {
    const view = begun();
    tab('keep');
    act(() => canvas.updateComponent(only('switch').id, { label: 'light' }));
    expect(done()).toEqual(['name']);
    view.rerender(<App view="cover" />);
    expect(done()).toEqual(['name', 'cover']);
    act(() => canvas.markSaved(canvas.circuit));
    expect(done()).toEqual(['name', 'cover', 'save']);
    expect(screen.getByTestId('class-section-keep')).toHaveTextContent('Class 2, Sharing voltage, is next: it is in the Classes menu.');
  });
});
