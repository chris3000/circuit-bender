import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { replacePart } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import { formatHertz, formatVolts } from '@/utils/readings';
import type { Component } from '@/types/circuit';
import type { Built, ClassDefinition } from './types';
import { simplestOscillatorKept } from './simplestOscillator';
import { GROUND, Work, type PinOf } from './Work';
import {
  all, CD40106, connect, ground, isNamed, keepSteps, near, place, POT, reading, resistor, spans, swing, switches, valued,
} from './kit';

// --- What this class asks of the learner's circuit ---

type Change = { componentId: string; parameter: string; value: number };

/** Long enough for two cycles of the lowest note the class plays, 27 Hz, from a standing start. */
const LISTEN = 0.12;

/** What the oscillator on the chip is doing. */
interface Voice {
  /** Its pitch, or null when it is still (or too slow to be called a note). */
  hertz: number | null;
  /** How far the chip's output swings, in volts. */
  swing: number;
  /** How far the wire into the Audio Out swings, in volts. */
  level: number;
}

const SILENT: Voice = { hertz: null, swing: 0, level: 0 };

/**
 * The circuit listened to with every switch closed and its controls put some
 * way: the first of the chip's outputs that is oscillating, and what reaches
 * the Audio Out. `fine` is a short run in small steps, for a note that may be
 * too high for the usual run to follow.
 */
function hear(work: Work, set: Change[] = [], fine = false): Voice {
  const outputs = work.parts('cd40106').flatMap((chip) => CD40106.Y.map((pin): PinOf => [chip, pin]));
  if (outputs.length === 0) return SILENT;
  const jacks = work.parts('audio-output').map((jack): PinOf => [jack, 0]);
  const run = work.bench({
    watch: [...outputs, ...jacks],
    set: [...switches(work, 1), ...set],
    ...(fine ? { seconds: 0.004, sampleRate: 384000 } : { seconds: LISTEN }),
  });
  const voice = outputs.map(([chip, pin]) => reading(run, chip, pin)).find((signal) => signal.hertz !== null);
  if (!voice) return SILENT;
  return { hertz: voice.hertz, swing: swing(voice), level: Math.max(0, ...jacks.map(([jack, pin]) => swing(reading(run, jack, pin)))) };
}

/** The circuit with every part of a kind put all the way one way, then all the way the other. Null without such a part. */
function ends(work: Work, type: string, parameter: string): [Voice, Voice] | null {
  if (work.parts(type).length === 0) return null;
  return [hear(work, all(work, type, parameter, 0)), hear(work, all(work, type, parameter, 1))];
}

/** Whether two notes are the same one, as near as makes no difference. */
const sameNote = (a: number | null, b: number | null) =>
  a === b || (a !== null && b !== null && Math.abs(a - b) <= 0.02 * Math.max(a, b));

/**
 * Whether a control of this kind plays the oscillator: it sounds with the
 * control at one end at least, and the note is another one (or is gone) at
 * the other end.
 */
function plays(work: Work, type: string, parameter: string): boolean {
  const notes = ends(work, type, parameter);
  if (!notes) return false;
  const [down, up] = notes.map((note) => note.hertz);
  return (down !== null || up !== null) && !sameNote(down, up);
}

const knobPlayed = (work: Work) => plays(work, 'potentiometer', 'position');
const skinPlayed = (work: Work) => plays(work, 'body-contact', 'touch');
const lightPlayed = (work: Work) => plays(work, 'ldr', 'light');

/** The highest note the control of a kind reaches, or null if it never sounds. */
function topNote(work: Work, type: string, parameter: string): number | null {
  const notes = (ends(work, type, parameter) ?? []).flatMap((note) => (note.hertz === null ? [] : [note.hertz]));
  return notes.length ? Math.max(...notes) : null;
}

/** A note with the light on every photocell put somewhere between dark (0) and bright (1). */
const lit = (work: Work, light: number) => hear(work, all(work, 'ldr', 'light', light));

/** Whether some part of a kind has a control moved well away from where it starts. */
const moved = (work: Work, type: string, parameter: string, from: number, by: number) =>
  work.parts(type).some((part) => Math.abs(Number(part.parameters[parameter]) - from) > by);

/**
 * A volume knob that works: a pot takes what reaches the Audio Out from next
 * to nothing to most of the output's swing, and the note stays the same.
 */
function volumeControl(work: Work): boolean {
  const notes = ends(work, 'potentiometer', 'position');
  if (!notes) return false;
  const [a, b] = notes;
  const loud = Math.max(a.level, b.level), quiet = Math.min(a.level, b.level);
  return a.hertz !== null && sameNote(a.hertz, b.hertz) && loud > 0.5 * a.swing && quiet < 0.05 * loud;
}

/** A pot in line with the Audio Out and nothing more: a leg on the Audio Out's wire, no leg on ground, and the sound gets through. */
function potInLine(work: Work): boolean {
  if (volumeControl(work)) return false;
  const pins = [POT.END1, POT.WIPER, POT.END3];
  const inLine = work.parts('potentiometer').some((knob) =>
    pins.every((pin) => !work.grounded(knob, pin))
    && work.parts('audio-output').some((jack) => pins.some((pin) => work.joined(knob, pin, jack, 0))));
  if (!inLine) return false;
  const half = hear(work, all(work, 'potentiometer', 'position', 0.5));
  return half.hertz !== null && half.level > 0.9 * half.swing;
}

/** A photocell with nothing in line: one leg on an inverter's input, the other on its output. */
const cellAlone = (work: Work) => work.parts('ldr').some((cell) => work.parts('cd40106').some((chip) =>
  CD40106.A.some((input, n) => spans(work, cell, work.net(chip, input), work.net(chip, CD40106.Y[n])))));

/** A resistor wired beside a photocell: its two ends on the photocell's two legs. */
const besideCell = (work: Work): Component | undefined => work.parts('resistor').find((r) =>
  work.parts('ldr').some((cell) => spans(work, r, work.net(cell, 0), work.net(cell, 1))));

/** A capacitor wired beside an earlier one: both from the same point to ground. */
function secondCapacitor(work: Work): Component | undefined {
  const point = (c: Component) => {
    const a = work.net(c, 0), b = work.net(c, 1);
    return a === b ? null : a === GROUND ? b : b === GROUND ? a : null;
  };
  const capacitors = work.parts('capacitor');
  return capacitors.find((c, i) => point(c) !== null && capacitors.slice(0, i).some((earlier) => point(earlier) === point(c)));
}

/** The same work with one part taken off the canvas: what the circuit did before the part was added. */
const without = (work: Work, part: Component) => new Work(work.circuit.removeComponent(part.id), work.situation);

/** A note as the meter writes it, or the lack of one. */
const note = (hertz: number | null) => (hertz === null ? 'no note at all' : formatHertz(hertz));

/** The light settings the check listens at, from dark to bright. */
const SHADES = [0, 0.25, 0.5, 0.75, 1];
const LOWEST = 80;
const HIGHEST = 2500;

/** The notes of a light-played oscillator from dark to bright, or null if there is none on the canvas. */
function lightNotes(work: Work): Array<number | null> | null {
  if (!lightPlayed(work)) return null;
  return SHADES.map((light) => lit(work, light).hertz);
}

// --- The circuits ---

const definitionOf = (type: string) => {
  const definition = ComponentRegistry.getInstance().get(type);
  if (!definition) throw new Error(`Component type "${type}" not found`);
  return definition;
};

interface Playing {
  /** What stands where class 4's 27 kΩ was. */
  by: 'knob' | 'skin' | 'light';
  /** The resistor in line with it, where class 4's 2.2 kΩ was. */
  inLine: number;
  capacitance: number;
  /** A resistor beside the photocell. */
  beside?: number;
  volume?: boolean;
  /** The photocell named PITCH and the volume pot VOLUME. */
  named?: boolean;
}

/**
 * Class 4's oscillator with the changes this class makes to it, made the way
 * the learner makes them: parts swapped where they stand, values typed in.
 */
function oscillator(options: Playing): Built {
  const built = simplestOscillatorKept();
  let circuit = new Circuit('oscillator');
  for (const component of built.components) circuit = circuit.addComponent(component);
  for (const connection of built.connections) circuit = circuit.addConnection(connection);
  const one = (type: string, is: (part: Component) => boolean = () => true) =>
    circuit.getComponents().find((part) => part.type === type && is(part))!;
  const set = (part: Component, parameters: Component['parameters']) => {
    circuit = circuit.updateComponent(part.id, { parameters: { ...part.parameters, ...parameters } });
  };

  // What plays it goes where the 27 kΩ was
  const swap = options.by === 'knob'
    ? replacePart(circuit, one('resistor', (r) => near(r.parameters.resistance, 27000)).id, definitionOf('potentiometer'),
      { maxResistance: 100000, value: formatValue(100000, 'resistance'), position: 0.5 })
    : replacePart(circuit, one('resistor', (r) => near(r.parameters.resistance, 27000)).id, definitionOf(options.by === 'skin' ? 'body-contact' : 'ldr'));
  circuit = swap.circuit;
  if (options.named && options.by === 'light') circuit = circuit.updateComponent(swap.id, { label: 'PITCH' });
  set(one('resistor', (r) => near(r.parameters.resistance, 2200)), { resistance: options.inLine, value: formatValue(options.inLine, 'resistance') });
  set(one('capacitor'), { capacitance: options.capacitance, value: formatValue(options.capacitance, 'capacitance') });

  if (options.beside) {
    const played = circuit.getComponent(swap.id)!;
    const beside = resistor(options.beside, played.position.x, played.position.y + 100);
    circuit = circuit.addComponent(beside).addConnection(connect(beside, 0, played, 0)).addConnection(connect(beside, 1, played, 1));
  }

  if (options.volume) {
    // SOUND, then the pot, with the Audio Out below it on the middle leg. Turned
    // half way round, the pot has leg 3 towards the switch: up is louder
    const sound = one('switch'), jack = one('audio-output');
    const wire = circuit.getConnections().find((c) => c.from.componentId === sound.id && c.to.componentId === jack.id)!;
    const x = sound.position.x + 140, y = sound.position.y;
    const volume = place('potentiometer', x, y, {
      rotation: 180, label: options.named ? 'VOLUME' : undefined,
      parameters: { maxResistance: 10000, value: formatValue(10000, 'resistance'), position: 1 },
    });
    const volumeGround = ground(x + 100, y + 80);
    circuit = circuit.removeConnection(wire.id)
      .updateComponent(jack.id, { position: { x, y: y + 120 } })
      .addComponent(volume).addComponent(volumeGround)
      .addConnection(connect(sound, 1, volume, POT.END3))
      .addConnection(connect(volume, POT.WIPER, jack, 0))
      .addConnection(connect(volume, POT.END1, volumeGround, 0));
  }
  return { components: circuit.getComponents(), connections: circuit.getConnections() };
}

/** Played by a knob: a 100 kΩ pot and 10 kΩ in line, 100 nF. */
const knobCircuit = () => oscillator({ by: 'knob', inLine: 10000, capacitance: 100e-9 });
/** Played by a finger: body contacts and 10 kΩ in line, 10 nF. */
const skinCircuit = () => oscillator({ by: 'skin', inLine: 10000, capacitance: 10e-9 });
/** Played by light: a photocell and 4.7 kΩ in line, 47 nF. */
const lightCircuit = () => oscillator({ by: 'light', inLine: 4700, capacitance: 47e-9 });
/** The same with a volume knob: where the build ends. */
const withVolume = () => oscillator({ by: 'light', inLine: 4700, capacitance: 47e-9, volume: true });

/**
 * What the class keeps: the light-played oscillator as the check's hint tunes
 * it (12 kΩ in line, 390 kΩ beside the photocell), with its switch SOUND, its
 * photocell named PITCH and its pot VOLUME.
 */
export function playingItKept(): Built {
  return oscillator({ by: 'light', inLine: 12000, capacitance: 47e-9, beside: 390000, volume: true, named: true });
}

const [namePitch, lookAtCover, save] = keepSteps({
  type: 'ldr', name: 'PITCH', what: 'the photocell', has: 'ldr',
  why: 'On the cover a photocell is a knob that stands for the light. Now it says what it plays.',
});

/** Class 5: anything that changes the resistance plays the oscillator, and a divider on the output sets how loud. */
export const playingIt: ClassDefinition = {
  id: 'playing-it',
  number: 5,
  unit: 'Sound',
  title: 'Playing it',
  promise: 'The oscillator of class 4 played three ways: by a knob, by a finger and by the light in the room. Then a volume knob for it.',
  startsFrom: 'Class 4\'s oscillator: 27 kΩ and 2.2 kΩ, 100 nF, and a switch named SOUND.',
  start: simplestOscillatorKept,

  build: [
    {
      id: 'play',
      text: 'Press play. This is the oscillator class 4 kept: 441 Hz.',
      how: 'If it is silent, close the switch named SOUND: click it. Nothing in this class changes how the oscillator works. What changes is the thing that sets its pitch: how high the note is.',
      done: (work) => work.situation.playing,
    },
    {
      id: 'knob',
      text: 'Put a 100 kΩ pot where the 27 kΩ resistor is.',
      how: 'Double-click the 27 kΩ resistor and pick the potentiometer from the list beside it. Then click the pot and type 100k into Resistance, at the top right. The two wires have moved to the pot\'s leg 1 and its middle leg. Leg 3 has nothing on it.',
      done: (work) => (knobPlayed(work) && valued(work, 'potentiometer', 100000).length > 0) || skinPlayed(work) || lightPlayed(work),
    },
    {
      id: 'turn',
      text: 'Play, and turn the pot all the way down, then all the way up. The note runs from 5.03 kHz down to 127 Hz.',
      how: 'Drag the small knob beside the pot up and down. A kilohertz (kHz) is a thousand hertz. To read the note, click a wire on the chip\'s output, 1Y: the meter shows its frequency.',
      done: (work) => (work.situation.playing && knobPlayed(work) && moved(work, 'potentiometer', 'position', 0.5, 0.3))
        || skinPlayed(work) || lightPlayed(work),
    },
    {
      id: 'top',
      text: 'Change the 2.2 kΩ resistor to 10 kΩ. The top note comes down to 1.25 kHz. The bottom note hardly moves: 118 Hz.',
      how: 'Click the resistor and type 10k into Resistance. With the pot all the way down, this resistor is nearly all that is left between the output and the input.',
      done: (work) => (knobPlayed(work) && (topNote(work, 'potentiometer', 'position') ?? Infinity) < 2000) || skinPlayed(work) || lightPlayed(work),
    },
    {
      id: 'skin',
      text: 'Now play it with a finger. Put body contacts where the pot is.',
      how: 'Double-click the pot and pick Body contacts from the list. They are the two plates of class 2: a finger across them is a resistor. Until they are touched, nothing joins the output to the input and the oscillator is silent.',
      done: (work) => skinPlayed(work) || lightPlayed(work),
    },
    {
      id: 'touch',
      text: 'Play, then press on the contacts and hold. Drag upwards to press harder. It growls: 57 Hz for a press, 216 Hz pressed as hard as it goes.',
      how: 'The harder the press, the less the resistance of the skin. But a finger is a far bigger resistor than the pot was, so every note is far lower.',
      done: (work) => (work.situation.playing && skinPlayed(work) && moved(work, 'body-contact', 'touch', 0, 0)) || lightPlayed(work),
    },
    {
      id: 'small',
      text: 'Change the capacitor from 100 nF to 10 nF. Every note is ten times higher: 570 Hz for a press, 2.16 kHz pressed hard.',
      how: 'Click the capacitor and type 10n into Capacitance.',
      done: (work) => (skinPlayed(work) && (topNote(work, 'body-contact', 'touch') ?? 0) > 1000) || lightPlayed(work),
    },
    {
      id: 'cell',
      text: 'Now play it with light. Put a photocell where the body contacts are.',
      how: 'Double-click the contacts and pick LDR from the list: the photocell of class 2. Its small dial stands for the light falling on it.',
      done: lightPlayed,
    },
    {
      id: 'range',
      text: 'Change the capacitor to 47 nF and the 10 kΩ resistor to 4.7 kΩ.',
      how: 'Type 47n into the capacitor and 4.7k into the resistor. The photocell goes much further than a finger does, from 1 MΩ in the dark to 1 kΩ in bright light, so it wants values of its own.',
      done: (work) => {
        if (!lightPlayed(work)) return false;
        const dark = lit(work, 0).hertz, bright = lit(work, 1).hertz;
        return dark !== null && dark < 40 && bright !== null && bright > 3000 && bright < 8000;
      },
    },
    {
      id: 'shade',
      text: 'Play, and drag the photocell\'s dial from the bottom to the top: 27.5 Hz in the dark, 755 Hz at half light, 4.62 kHz in bright light.',
      how: 'Down is dark, up is bright. On a real board you would move a hand over the photocell, and its shadow would play the note.',
      done: (work) => work.situation.playing && lightPlayed(work) && moved(work, 'ldr', 'light', 0.5, 0.2),
    },
    {
      id: 'volume',
      text: 'Add a volume knob. Take away the wire from SOUND to the Audio Out. Add a 10 kΩ pot, and wire SOUND to its leg 3, its leg 1 to ground and its middle leg to the Audio Out.',
      how: 'Click the wire and press Delete. Search for "pot 10k". This time all three legs are used, as in class 2: the pot is a divider between the output and ground. With legs 1 and 3 the other way round it works too, but backwards.',
      done: volumeControl,
    },
    {
      id: 'loud',
      text: 'Play, and turn the new pot all the way down, then all the way up: from silence to full.',
      how: 'Click the wire into the Audio Out and watch the meter as you turn. The frequency stays where it is. Only the size of the swing changes.',
      done: (work) => work.situation.playing && volumeControl(work) && moved(work, 'potentiometer', 'position', 0.5, 0.3),
    },
  ],

  why: [
    {
      title: 'Anything that changes R',
      text: 'Class 4 gave the rule: frequency is about 1.3 ÷ (R × C). So anything that changes R plays the oscillator. You have used three: a knob, a finger and the light. A resistance that can be changed while the circuit runs is a variable resistor.',
    },
    {
      title: 'A pot on two legs',
      text: 'In class 2 the pot was a divider, with all three legs wired. Here only leg 1 and the wiper were used, so the pot was just the part of its strip between those two: a resistor of anything from almost nothing to 100 kΩ. Turning it up put more strip in the way, so up was lower.',
    },
    {
      title: 'Range',
      text: 'The range of an instrument runs from its lowest note to its highest. With the pot all the way down, the fixed resistor was nearly all the resistance there was, so it set the top note: 5.03 kHz with 2.2 kΩ, 1.25 kHz with 10 kΩ. The bottom note was set by the pot and the resistor together. A resistor in line with a variable one is how the top of a range is chosen.',
    },
    {
      title: 'Which range',
      text: 'The capacitor moves the whole range. A finger is about 2 MΩ for a light touch and 50 kΩ pressed hard, far more than the pot, so with 100 nF it only growled. A tenth of the capacitance takes a tenth of the time to fill and to empty, and every note came out ten times higher. The resistance says where in the range you are. The capacitor says which range.',
    },
    {
      title: 'Volume',
      text: 'The volume knob is the divider of class 2, with the oscillator\'s output where the supply was. The wiper takes a share of the swing: all of it at the top, half of it half way, none at the bottom. How big a signal is, is called its level. The pot comes after the oscillator, so it changes the level and leaves the pitch alone. Wiring it in did cost something, once: 755 Hz at half light became 734 Hz. The pot takes current from the output, as the LED did in class 4, and the output\'s high level sags from 8.97 V to 8.73 V. A buffer would cure it.',
    },
    {
      title: 'Kinder than a real board',
      text: 'In the app a press is the same every time, and the light holds still until you move the dial. Real skin is damp one day and dry the next, so the same press gives another note. Real light flickers, and a hand never comes back to quite the same place. Instruments played this way do not repeat themselves. That is what people like about them.',
    },
  ],

  tries: [
    {
      id: 'no-top',
      title: 'Nothing in line',
      question: 'Take the 4.7 kΩ out, so the photocell is the only thing between the output and the input. Which end of the range moves?',
      options: ['The dark end', 'The bright end', 'Both, by the same amount'],
      answer: 1,
      change: 'Click the 4.7 kΩ resistor and press Delete. The app closes the wire up behind it. Play, and drag the photocell\'s dial from the bottom to the top.',
      made: (work) => cellAlone(work) && lightPlayed(work),
      result: (work) => `In bright light it now runs at ${note(hear(work, all(work, 'ldr', 'light', 1), true).hertz)}, where it was 4.50 kHz. That is higher than most people can hear: on the way up the note thins out and is gone. In the dark it is still ${note(lit(work, 0).hertz)}. In bright light the photocell is only 1 kΩ, so the 4.7 kΩ was most of the resistance. In the dark the photocell is 1 MΩ and the 4.7 kΩ is nothing to it. A resistor in line sets the top of the range and leaves the bottom alone. Put a 4.7 kΩ back: drag one onto the wire between the photocell and the chip's output.`,
    },
    {
      id: 'beside',
      title: 'A resistor beside the photocell',
      question: 'Wire a 100 kΩ resistor beside the photocell: one end on each of its legs. Which end of the range moves?',
      options: ['The dark end', 'The bright end', 'Both, by the same amount'],
      answer: 0,
      change: 'Add a 100 kΩ resistor. Wire one of its ends to one leg of the photocell and the other end to the other leg. Play, and drag the dial from the bottom to the top.',
      made: (work) => besideCell(work) !== undefined && lightPlayed(work),
      result: (work) => {
        const before = without(work, besideCell(work)!);
        return `${note(lit(work, 0).hertz)} in the dark, where it was ${note(lit(before, 0).hertz)}. In bright light it is ${note(lit(work, 1).hertz)}, where it was ${note(lit(before, 1).hertz)}: no change to speak of. The two are in parallel (class 2), so the current takes the easier way. In the dark that is the resistor, and the pair can never be more than it. In bright light it is the photocell, and the resistor might as well not be there. A resistor beside the photocell sets the bottom of the range and leaves the top alone. Leave it in: you may want one for the check.`;
      },
    },
    {
      id: 'octave',
      title: 'Twice the capacitance',
      question: 'Add a second 47 nF capacitor beside the first: from the chip\'s input, 1A, to ground. Every note will be…',
      options: ['Twice as high', 'The same', 'Half as high'],
      answer: 2,
      change: 'Add a 47 nF capacitor and a ground. Wire one leg to the chip\'s 1A pin and the other to the ground. Leave the photocell\'s dial in the middle and read the note.',
      made: (work) => secondCapacitor(work) !== undefined && lit(work, 0.5).hertz !== null,
      result: (work) => `${note(lit(work, 0.5).hertz)} at half light, where one capacitor gave ${note(lit(without(work, secondCapacitor(work)!), 0.5).hertz)}: half. Two capacitors side by side hold twice the charge, so they take twice as long to fill and to empty. Half the frequency is the same note, lower: musicians call that step an octave. Twice the frequency is an octave up. Take the second capacitor away again.`,
    },
    {
      id: 'quarter',
      title: 'Turn it down',
      question: 'Turn the volume pot down to about a quarter. The note will…',
      options: ['Get lower', 'Stay the same', 'Get higher'],
      answer: 1,
      change: 'Play, click the wire into the Audio Out, and drag the volume pot\'s knob down until the meter shows about a quarter of the swing it had.',
      made: (work) => {
        if (!volumeControl(work)) return false;
        const now = hear(work);
        return now.level > 0.1 * now.swing && now.level < 0.4 * now.swing;
      },
      result: (work) => {
        const now = hear(work);
        const full = ends(work, 'potentiometer', 'position')!.reduce((a, b) => (a.level > b.level ? a : b));
        return `${note(now.hertz)}, and ${note(full.hertz)} with the knob at the top: the same note. The chip's output swings ${formatVolts(now.swing)}, and ${formatVolts(now.level)} of it reaches the Audio Out. The pot's strip is always there, from the output to ground, wherever the wiper sits. So the oscillator cannot tell that the knob has moved.`;
      },
    },
    {
      id: 'no-ground',
      title: 'A volume knob with no ground',
      question: 'Take away the wire from the volume pot to ground. The pot is now a variable resistor in line with the Audio Out. Turned half way, it will…',
      options: ['Halve the sound, as before', 'Make almost no difference', 'Cut the sound off'],
      answer: 1,
      change: 'Click the wire from the pot to ground and press Delete. Play, and turn the pot from one end to the other.',
      made: potInLine,
      result: (work) => {
        const half = hear(work, all(work, 'potentiometer', 'position', 0.5));
        return `${formatVolts(half.level)} of the output's ${formatVolts(half.swing)} gets through with the knob half way: nearly all of it. A divider needs both halves. The Audio Out is 1 MΩ to ground and hardly any current flows into it, so by Ohm's law hardly any voltage is lost across the pot, wherever it is set. A variable resistor changes a current. To change a voltage it takes a divider. Put the wire to ground back.`;
      },
    },
  ],

  check: {
    goal: 'Give the light-played oscillator a range you can use: from dark to bright, never below 80 Hz and never above 2.5 kHz.',
    reading: (work) => {
      const notes = lightNotes(work);
      if (!notes) return null;
      const heard = notes.flatMap((hertz) => (hertz === null ? [] : [hertz]));
      if (heard.length === 0) return 'Your oscillator: no note at all';
      const range = `Your oscillator: ${formatHertz(Math.min(...heard))} to ${formatHertz(Math.max(...heard))} between dark and bright`;
      return heard.length < notes.length ? `${range}, and no note at all in places` : range;
    },
    passed: (work) => {
      const notes = lightNotes(work);
      return notes !== null && notes.every((hertz) => hertz !== null && hertz >= LOWEST && hertz <= HIGHEST);
    },
    hint: 'Calculated, not measured: frequency is about 1.3 ÷ (R × C), and C is 47 nF. The top first. For 2.5 kHz, R must be at least 11 kΩ. In bright light the photocell is 1 kΩ, so the resistor in line must be more than 10 kΩ: try 12 kΩ. Then the bottom. For 80 Hz, R must be at most 346 kΩ. In the dark the photocell is 1 MΩ, which is too much, so it needs a resistor beside it: 390 kΩ beside 1 MΩ acts as 281 kΩ.',
  },

  keep: [
    namePitch,
    {
      id: 'name-volume',
      text: 'Name the 10 kΩ pot VOLUME.',
      how: 'Click it and type VOLUME into Name. With SOUND from class 4, the cover now has three controls.',
      done: (work) => work.parts('potentiometer').some((part) => isNamed(part, 'VOLUME')),
    },
    lookAtCover,
    save,
  ],

  words: [
    { word: 'Pitch', meaning: 'How high or low a note is. A higher frequency is a higher pitch.' },
    { word: 'Kilohertz', meaning: 'A thousand hertz (kHz).' },
    { word: 'Variable resistor', meaning: 'A resistance that can be changed while the circuit runs: a pot on two legs, a photocell, a finger.' },
    { word: 'Range', meaning: 'From the lowest note an instrument plays to the highest.' },
    { word: 'Octave', meaning: 'Twice the frequency, or half of it: the same note, higher or lower.' },
    { word: 'Level', meaning: 'How big a signal is: how far it swings.' },
    { word: 'Volume', meaning: 'How loud. A volume knob is a divider on the output that sets the level.' },
  ],

  circuit: withVolume,
  stages: [
    { upTo: 'top', circuit: knobCircuit },
    { upTo: 'small', circuit: skinCircuit },
    { upTo: 'shade', circuit: lightCircuit },
  ],
};
