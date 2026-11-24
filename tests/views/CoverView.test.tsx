import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import { Circuit } from '@/models/Circuit';
import { exampleCircuits } from '@/examples/circuits';
import { exampleToCircuit } from '@/examples/load';
import { CoverView } from '@/views/Cover/CoverView';
import type { LevelSource } from '@/views/Cover/CoverControls';
import type { ActiveView } from '@/views/viewModes';
import { ALL_PARTS } from './allParts';

let circuit: Circuit;
function Spy() {
  circuit = useCircuit().circuit;
  return null;
}

interface Options {
  lights?: Record<string, number>;
  playing?: boolean;
  levels?: LevelSource;
  onSelectView?: (view: ActiveView) => void;
}

function show(example: string | null, options: Options = {}) {
  const initial = example
    ? { circuit: exampleToCircuit(exampleCircuits.find((e) => e.name === example)!), dirty: false }
    : null;
  return render(
    <CircuitProvider initial={initial}>
      <Spy />
      <CoverView activeView="cover" onSelectView={options.onSelectView ?? (() => {})}
        lights={options.lights ?? {}} playing={options.playing ?? false} levels={options.levels} />
    </CircuitProvider>,
  );
}

const partOf = (type: string, label?: string) =>
  circuit.getComponents().find((c) => c.type === type && (label === undefined || c.label === label))!;
const knob = (name: string) => screen.getByRole('slider', { name });
const toggle = (name: string) => screen.getByRole('switch', { name });
/** The thing that is held down called `name` (its engraving is a button too: the one that renames it). */
const press = (name: string) => screen.getAllByRole('button', { name }).find((b) => b.hasAttribute('aria-pressed'))!;
/** The place on the panel of the knob called `name`. */
const cell = (name: string) => knob(name).closest('[data-part]') as HTMLElement;

describe('the cover', () => {
  beforeEach(() => {
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    for (const definition of ALL_PARTS) registry.register(definition);
  });

  it('shows every input and output of the circuit, by name', () => {
    show('MFOS Weird Sound Generator');
    expect(screen.getAllByRole('slider').map((k) => k.getAttribute('aria-label'))).toEqual(['WACKY', 'ZANY', 'ZANINESS', 'WEIRD', 'ODDNESS', 'STARVE']);
    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual(['WACKINESS']);
    expect(screen.getAllByTestId('cover-pilot')).toHaveLength(1);
    // The output plays through a speaker; the socket is for when its signal can go somewhere else
    expect(screen.getAllByTestId('cover-speaker')).toHaveLength(1);
    expect(screen.queryByTestId('cover-jack')).toBeNull();
    expect(screen.getByTestId('cover-title')).toHaveTextContent('MFOS WEIRD SOUND GENERATOR');
    expect(screen.getByText('9V DC')).toBeInTheDocument();
    expect(screen.getByText('44 PARTS INSIDE')).toBeInTheDocument();
    expect(screen.queryByTestId('cover-empty')).toBeNull();
  });

  it('shows controls as they are set in the circuit', () => {
    show('MFOS Weird Sound Generator');
    expect(knob('WACKY')).toHaveAttribute('aria-valuenow', '35');
    expect(knob('ODDNESS')).toHaveAttribute('aria-valuetext', '90%');
    expect(toggle('WACKINESS')).toHaveAttribute('aria-checked', 'true');
  });

  it('says so when there is nothing to put on it', () => {
    show(null);
    expect(screen.getByTestId('cover-empty')).toHaveTextContent('NOTHING ON THE COVER YET');
    expect(screen.getByText('NOTHING INSIDE YET')).toBeInTheDocument();
    expect(screen.getByTestId('cover-title')).toHaveTextContent('UNTITLED CIRCUIT');
  });

  it('flips a switch in the circuit, as one undo step', () => {
    show('Simple Oscillator');
    expect(partOf('switch').parameters.closed).toBe(1);
    fireEvent.click(toggle('SOUND'));
    expect(partOf('switch').parameters.closed).toBe(0);
    expect(toggle('SOUND')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByLabelText('Undo'));
    expect(partOf('switch').parameters.closed).toBe(1);
    expect(screen.getByLabelText('Undo')).toBeDisabled();
  });

  it('holds a push button down for as long as it is pressed, with nothing to undo', () => {
    show('Light Theremin');
    const button = press('PLAY');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(partOf('pushbutton').parameters.closed ?? 0).toBe(0);

    fireEvent.pointerDown(button, { button: 0 });
    expect(partOf('pushbutton').parameters.closed).toBe(1);
    expect(press('PLAY')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.pointerUp(window);
    expect(partOf('pushbutton').parameters.closed).toBe(0);
    expect(press('PLAY')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Undo')).toBeDisabled();
  });

  it('holds a button from the keyboard with Enter, and lets go when the key does or the focus leaves', () => {
    show('Light Theremin');
    const button = press('PLAY');
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(partOf('pushbutton').parameters.closed).toBe(1);
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(partOf('pushbutton').parameters.closed).toBe(0);

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.blur(button);
    expect(partOf('pushbutton').parameters.closed).toBe(0);
    // Space is play and stop, here as everywhere
    fireEvent.keyDown(button, { key: ' ' });
    expect(partOf('pushbutton').parameters.closed).toBe(0);
  });

  it('ignores the other mouse buttons on a push button', () => {
    show('Light Theremin');
    fireEvent.pointerDown(press('PLAY'), { button: 2 });
    expect(partOf('pushbutton').parameters.closed ?? 0).toBe(0);
  });

  it('presses the touch plates harder the higher up they are held, and lets go', () => {
    show('Light Theremin');
    const plates = press('TOUCH');
    plates.getBoundingClientRect = () => ({ left: 0, right: 80, top: 100, bottom: 200, width: 80, height: 100, x: 0, y: 100, toJSON: () => ({}) });
    expect(screen.queryByTestId('cover-pad-finger')).toBeNull();

    fireEvent.pointerDown(plates, { button: 0, clientY: 180 });
    expect(partOf('body-contact').parameters.touch).toBe(0.2);
    expect(screen.getByTestId('cover-pad-finger')).toBeInTheDocument();
    expect(screen.getByTestId('cover-pad')).toHaveTextContent('20%');

    fireEvent.pointerMove(window, { clientY: 110 });
    expect(partOf('body-contact').parameters.touch).toBe(0.9);
    fireEvent.pointerMove(window, { clientY: 400 }); // slid off the bottom: still the lightest touch
    expect(partOf('body-contact').parameters.touch).toBe(0.05);

    fireEvent.pointerUp(window);
    expect(partOf('body-contact').parameters.touch).toBe(0);
    expect(screen.getByTestId('cover-pad')).toHaveTextContent('TOUCH');
    expect(screen.getByLabelText('Undo')).toBeDisabled();
  });

  it('lets go of what is held when the cover goes away', () => {
    const { rerender } = show('Light Theremin');
    fireEvent.pointerDown(press('PLAY'), { button: 0 });
    expect(partOf('pushbutton').parameters.closed).toBe(1);
    // Another view takes its place while the button is down
    rerender(<CircuitProvider initial={null}><Spy /></CircuitProvider>);
    expect(partOf('pushbutton').parameters.closed).toBe(0);
  });

  it('shows a bare speaker as a speaker, and the starve knob after the circuit\'s own', () => {
    show('Atari Punk Console');
    expect(screen.getAllByRole('slider').map((k) => k.getAttribute('aria-label'))).toEqual(['PITCH', 'WIDTH', 'STARVE']);
    expect(screen.getAllByTestId('cover-speaker')).toHaveLength(1);
    expect(screen.getByTestId('cover-speaker')).toHaveTextContent('SPEAKER');
    expect(screen.queryByTestId('cover-jack')).toBeNull();
  });

  it('turns a knob with the arrow keys', () => {
    show('Pitch Control');
    const pitch = knob('PITCH');
    fireEvent.keyDown(pitch, { key: 'ArrowUp' });
    expect(partOf('potentiometer').parameters.position).toBe(0.51);
    fireEvent.keyDown(pitch, { key: 'ArrowRight', shiftKey: true });
    expect(partOf('potentiometer').parameters.position).toBe(0.61);
    fireEvent.keyDown(pitch, { key: 'ArrowDown' });
    fireEvent.keyDown(pitch, { key: 'ArrowLeft' });
    expect(pitch).toHaveAttribute('aria-valuenow', '59');
    fireEvent.keyDown(pitch, { key: 'Home' });
    expect(partOf('potentiometer').parameters.position).toBe(0);
    fireEvent.keyDown(pitch, { key: 'ArrowDown' }); // already at the bottom
    fireEvent.keyDown(pitch, { key: 'End' });
    expect(partOf('potentiometer').parameters.position).toBe(1);
    fireEvent.keyDown(pitch, { key: 'a' });
    expect(partOf('potentiometer').parameters.position).toBe(1);
  });

  it('counts a held arrow key as one undo step', () => {
    show('Pitch Control');
    fireEvent.keyDown(knob('PITCH'), { key: 'ArrowUp' });
    for (let i = 0; i < 5; i++) fireEvent.keyDown(knob('PITCH'), { key: 'ArrowUp', repeat: true });
    expect(partOf('potentiometer').parameters.position).toBe(0.56);
    fireEvent.click(screen.getByLabelText('Undo'));
    expect(partOf('potentiometer').parameters.position).toBe(0.5);
  });

  it('turns a knob by dragging round it, as one undo step, leaving its other settings alone', () => {
    show('Pitch Control');
    const pitch = knob('PITCH');
    // In the test DOM the dial is at the origin: (10, 0) is due east, (0, 10) due south (the gap)
    fireEvent.pointerDown(pitch, { button: 0, clientX: 0, clientY: -10 });
    expect(screen.getByText('50%')).toBeInTheDocument(); // the name gives way to the position while it turns
    expect(partOf('potentiometer').parameters.position).toBe(0.5); // pressing alone turns nothing
    fireEvent.pointerMove(window, { clientX: 10, clientY: 0 });
    expect(partOf('potentiometer').parameters.position).toBeCloseTo(225 / 270, 6);
    expect(screen.getByText('83%')).toBeInTheDocument();
    fireEvent.pointerMove(window, { clientX: -10, clientY: 0 });
    expect(partOf('potentiometer').parameters.position).toBeCloseTo(45 / 270, 6);
    fireEvent.pointerMove(window, { clientX: -1, clientY: 10 });
    expect(partOf('potentiometer').parameters.position).toBe(0);
    fireEvent.pointerUp(window);
    expect(screen.queryByText('0%')).toBeNull();
    expect(within(cell('PITCH')).getByRole('button', { name: 'PITCH' })).toBeInTheDocument();
    expect(partOf('potentiometer').parameters).toMatchObject({ maxResistance: 100000, value: '100k' });
    fireEvent.pointerMove(window, { clientX: 10, clientY: 0 }); // let go: no longer turning
    expect(partOf('potentiometer').parameters.position).toBe(0);
    fireEvent.click(screen.getByLabelText('Undo'));
    expect(partOf('potentiometer').parameters.position).toBe(0.5);
    expect(screen.getByLabelText('Undo')).toBeDisabled();
  });

  it('draws the pointer at the knob position', () => {
    show('Pitch Control');
    const pointer = () => within(cell('PITCH')).getByTestId('cover-knob-pointer').getAttribute('transform');
    expect(pointer()).toBe('rotate(-90)'); // half way: straight up
    fireEvent.keyDown(knob('PITCH'), { key: 'Home' });
    expect(pointer()).toBe('rotate(-225)');
    fireEvent.keyDown(knob('PITCH'), { key: 'End' });
    expect(pointer()).toBe('rotate(45)');
  });

  it('renames a part from its engraving', () => {
    show('Simple Oscillator');
    fireEvent.click(screen.getByRole('button', { name: 'OUT' }));
    const input = screen.getByLabelText('Name of OUT') as HTMLInputElement;
    expect(input.value).toBe(''); // OUT is a stand-in, not its name
    fireEvent.change(input, { target: { value: '  Speaker  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(partOf('audio-output').label).toBe('Speaker');
    expect(screen.getByRole('button', { name: 'Speaker' })).toHaveAttribute('title', 'Click to rename');

    fireEvent.click(screen.getByRole('button', { name: 'Speaker' }));
    fireEvent.change(screen.getByLabelText('Name of Speaker'), { target: { value: 'Nope' } });
    fireEvent.keyDown(screen.getByLabelText('Name of Speaker'), { key: 'Escape' });
    expect(partOf('audio-output').label).toBe('Speaker');

    // Clearing the name goes back to the stand-in
    fireEvent.click(screen.getByRole('button', { name: 'Speaker' }));
    fireEvent.change(screen.getByLabelText('Name of Speaker'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Name of Speaker'));
    expect(partOf('audio-output').label).toBeUndefined();
    expect(screen.getByRole('button', { name: 'OUT' })).toHaveAttribute('title', 'Click to give it a name');
  });

  it('does not touch the circuit when a name is left as it was', () => {
    show('Simple Oscillator');
    const before = circuit;
    fireEvent.click(screen.getByRole('button', { name: 'SOUND' }));
    fireEvent.blur(screen.getByLabelText('Name of SOUND'));
    expect(circuit).toBe(before);
  });

  it('lights an LED when the simulation says it is lit', () => {
    const { rerender } = show('LED Blinker');
    const lamp = () => within(screen.getByTestId('cover-lamp')).getByRole('img');
    expect(lamp()).toHaveAccessibleName('LED: off');
    const led = partOf('led');
    rerender(
      <CircuitProvider initial={{ circuit, dirty: false }}>
        <Spy />
        <CoverView activeView="cover" onSelectView={() => {}} lights={{ [led.id]: 1 }} playing={true} />
      </CircuitProvider>,
    );
    expect(lamp()).toHaveAccessibleName('LED: on');
  });

  it('lights the pilot light while the circuit is running', () => {
    show('Simple Oscillator', { playing: false });
    expect(within(screen.getByTestId('cover-pilot')).getByRole('img')).toHaveAccessibleName('POWER: off');
  });

  it('...and only then', () => {
    show('Simple Oscillator', { playing: true });
    expect(within(screen.getByTestId('cover-pilot')).getByRole('img')).toHaveAccessibleName('POWER: on');
  });

  it('offers the other views', () => {
    const onSelectView = vi.fn();
    show('Simple Oscillator', { onSelectView });
    expect(screen.getByTestId('view-cover')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('view-cover'));
    expect(onSelectView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('view-board'));
    fireEvent.click(screen.getByTestId('view-schematic'));
    expect(onSelectView.mock.calls).toEqual([['board'], ['schematic']]);
  });

  // The keys are heard for the whole page: tests/context/useUndoShortcuts.test.tsx
  it('undoes and redoes from its toolbar', () => {
    show('Simple Oscillator');
    expect(screen.getByLabelText('Undo')).toBeDisabled();
    fireEvent.click(toggle('SOUND'));
    fireEvent.click(screen.getByLabelText('Undo'));
    expect(partOf('switch').parameters.closed).toBe(1);
    fireEvent.click(screen.getByLabelText('Redo'));
    expect(partOf('switch').parameters.closed).toBe(0);
  });
});

describe('the level meter on the cover', () => {
  let frames: Array<() => void> = [];
  const runFrame = () => act(() => { const due = frames; frames = []; for (const frame of due) frame(); });

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
    const registry = ComponentRegistry.getInstance();
    registry.clear();
    for (const definition of ALL_PARTS) registry.register(definition);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows the output and falls back to dark, then rests', () => {
    let hear: (peak: number) => void = () => {};
    const stopped = vi.fn();
    const levels: LevelSource = (listener) => { hear = listener; return stopped; };
    const { unmount } = show('Simple Oscillator', { levels });
    const meter = screen.getByTestId('cover-meter');
    const lit = () => Number(meter.getAttribute('data-lit'));
    expect(lit()).toBe(0);
    expect(frames).toHaveLength(0); // nothing is animating in silence

    hear(0.5);
    runFrame();
    expect(lit()).toBe(8);
    expect([...meter.querySelectorAll('rect')].map((r) => r.getAttribute('fill'))).toEqual(
      ['#F5F5F5', '#F5F5F5', '#F5F5F5', '#F5F5F5', '#F5F5F5', '#F5F5F5', '#FF2D55', '#FF2D55']);

    // No more sound: it falls a little each frame until it is dark
    const seen = [lit()];
    for (let i = 0; i < 60 && frames.length > 0; i++) { runFrame(); seen.push(lit()); }
    expect(seen.at(-1)).toBe(0);
    expect([...seen].sort((a, b) => b - a)).toEqual(seen); // only ever downwards
    expect(new Set(seen).size).toBeGreaterThan(4);
    expect(frames).toHaveLength(0);

    hear(0.1);
    runFrame();
    expect(lit()).toBe(3);
    unmount();
    expect(stopped).toHaveBeenCalledTimes(1);
  });
});
