import { exampleCircuits } from '@/examples/circuits';
import { dutyCycle, measureSignal, type SignalReading } from '@/simulation/measure/signal';
import { formatHertz, formatVolts } from '@/utils/readings';
import type { Component } from '@/types/circuit';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Built, ClassDefinition } from './types';
import { GROUND, type Work } from './Work';
import {
  capacitor, CD40106, connect, ground, keepSteps, LED, linked, near, place, playStep, plus, reading, resistor, spans, switches,
} from './kit';

// --- What this class asks of the learner's circuit ---

/** One of the chip's six inverters, by its place on the chip. */
interface Inverter {
  chip: Component;
  a: number;
  y: number;
}

const inverters = (work: Work): Inverter[] =>
  work.parts('cd40106').flatMap((chip) => CD40106.A.map((a, k) => ({ chip, a, y: CD40106.Y[k] })));

/** A chip with its own two power pins wired: VDD to +, VSS to ground. */
const powered = (work: Work, chip: Component) =>
  work.net(chip, CD40106.VDD) === plus(work) && work.grounded(chip, CD40106.VSS);

/** An inverter with a resistor from its output back to its input. */
const hasFeedback = (work: Work, inv: Inverter) =>
  linked(work, work.net(inv.chip, inv.y), work.net(inv.chip, inv.a), ['resistor']);

/** The capacitors from an inverter's input to ground. */
const timing = (work: Work, inv: Inverter) =>
  work.parts('capacitor').filter((c) => spans(work, c, work.net(inv.chip, inv.a), GROUND));

/** The inverter wired as an oscillator: feedback through a resistor, and a capacitor on its input. */
const oscillator = (work: Work): Inverter | undefined =>
  inverters(work).find((inv) => hasFeedback(work, inv) && timing(work, inv).length > 0);

/** The inverter that passes the oscillator's output on: its input is on the oscillator's output. */
function buffer(work: Work): Inverter | undefined {
  const osc = oscillator(work);
  if (!osc) return undefined;
  const out = work.net(osc.chip, osc.y);
  return inverters(work).find((inv) => !(inv.chip === osc.chip && inv.a === osc.a) && work.net(inv.chip, inv.a) === out);
}

/** Whether an LED hangs, through its resistor, on this inverter's output. */
const lights = (work: Work, inv: Inverter) =>
  work.parts('led').some((led) => linked(work, work.net(inv.chip, inv.y), work.net(led, LED.A), ['resistor']));

/**
 * The oscillator watched for a while: its input, its output, the buffer's
 * output and the sound. Anything quick enough to be a note is read in a
 * quarter of a second; a blink is watched for five seconds, more coarsely.
 */
function watched(work: Work, slow: boolean): { run: BenchRun; osc: Inverter } | null {
  const osc = oscillator(work);
  if (!osc) return null;
  const run = work.bench({
    ...(slow ? { seconds: 5, sampleRate: 8000 } : { seconds: 0.25, sampleRate: 48000 }),
    set: switches(work, 1),
    watch: [[osc.chip, osc.a], [osc.chip, osc.y]],
    watchAmps: work.parts('led').map((led) => led.id),
  });
  return { run, osc };
}

/** What the oscillator does: its output's reading, its input's, and how much of the time the output is high. */
interface Beat {
  out: SignalReading;
  in: SignalReading;
  hertz: number;
  /** The part of the time the output is high. */
  high: number;
  sound: SignalReading;
  run: BenchRun;
}

function beat(work: Work): Beat | null {
  for (const slow of [false, true]) {
    const result = watched(work, slow);
    if (!result) return null;
    const { run, osc } = result;
    const out = reading(run, osc.chip, osc.y);
    if (out.hertz === null) continue;
    const trace = run.trace(osc.chip.id, osc.chip.pins[osc.y].id)!;
    return { out, in: reading(run, osc.chip, osc.a), hertz: out.hertz, high: dutyCycle(trace) ?? 0, sound: run.sound, run };
  }
  return null;
}

/** How often the brightest LED blinks, and the part of the time it is lit; null if none blinks. */
function blink(work: Work): { hertz: number; lit: number } | null {
  const result = beat(work);
  if (!result) return null;
  for (const led of work.parts('led')) {
    const trace = result.run.ampsTrace(led.id);
    if (!trace) continue;
    // A current of a few milliamps is a small number: say what counts as a swing
    const signal = measureSignal(trace, result.run.sampleRate, 1e-4);
    if (signal.hertz !== null) return { hertz: signal.hertz, lit: dutyCycle(trace, 1e-4) ?? 0 };
  }
  return null;
}

const between = (value: number | null | undefined, low: number, high: number) =>
  value !== null && value !== undefined && value >= low && value <= high;

/** The note that comes out of the Audio Out, or null when there is none to hear. */
function note(work: Work): number | null {
  if (work.parts('audio-output').length === 0) return null;
  const result = beat(work);
  if (!result || result.sound.hertz === null || result.sound.max - result.sound.min < 0.1) return null;
  return result.sound.hertz;
}

/** The resistors (one, or several in a line) from the oscillator's output back to its input, added up. */
function feedbackOhms(work: Work): number | null {
  const osc = oscillator(work);
  if (!osc) return null;
  const a = work.net(osc.chip, osc.a), y = work.net(osc.chip, osc.y);
  const direct = work.parts('resistor').filter((r) => spans(work, r, a, y));
  if (direct.length === 1) return Number(direct[0].parameters.resistance);
  // Two in a line: one on the input, one on the output, meeting at a point of their own
  for (const first of work.parts('resistor')) {
    for (const second of work.parts('resistor')) {
      if (first === second) continue;
      const mid = [work.net(first, 0), work.net(first, 1)].find((net) => net !== a);
      if (mid && mid !== y && spans(work, first, a, mid) && spans(work, second, mid, y)) {
        return Number(first.parameters.resistance) + Number(second.parameters.resistance);
      }
    }
  }
  return null;
}

/** Whether the sound can be switched off: with every switch open there is none. */
function switched(work: Work): boolean {
  if (work.parts('switch').length === 0 || note(work) === null) return false;
  const open = work.bench({ seconds: 0.25, sampleRate: 48000, set: switches(work, 0) });
  return open.sound.max - open.sound.min < 0.01;
}

// --- The circuits ---

interface Values {
  ohms: number;
  farads: number;
  /** The LED hangs on the buffer (the second inverter), not on the oscillator itself. */
  buffered: boolean;
  audio: boolean;
}

function build({ ohms, farads, buffered, audio }: Values): Built {
  const supply = place('power', 200, 100);
  const supplyGround = ground(200, 200);
  const chip = place('cd40106', 480, 280);
  const chipGround = ground(600, 140);
  const feedback = resistor(ohms, 440, 440);
  const cap = capacitor(farads, 280, 360, 90);
  const capGround = ground(280, 460);
  const limit = resistor(1000, 700, 200);
  const led = place('led', 800, 300, { rotation: 90 });
  const ledGround = ground(800, 400);
  const components = [supply, supplyGround, chip, chipGround, feedback, cap, capGround, limit, led, ledGround];
  const connections = [
    connect(supply, 1, supplyGround, 0),
    connect(supply, 0, chip, CD40106.VDD),
    connect(chip, CD40106.VSS, chipGround, 0),
    connect(chip, CD40106.Y[0], feedback, 1),
    connect(feedback, 0, chip, CD40106.A[0]),
    connect(cap, 0, chip, CD40106.A[0]),
    connect(cap, 1, capGround, 0),
    connect(limit, 1, led, LED.A),
    connect(led, LED.K, ledGround, 0),
  ];
  if (buffered) {
    connections.push(connect(chip, CD40106.Y[0], chip, CD40106.A[1]), connect(chip, CD40106.Y[1], limit, 0));
  } else {
    connections.push(connect(chip, CD40106.Y[0], limit, 0));
  }
  if (audio) {
    const out = place('audio-output', 700, 480);
    components.push(out);
    connections.push(connect(chip, CD40106.Y[buffered ? 1 : 0], out, 0));
  }
  return { components, connections };
}

/** The blinker: 100 kΩ, 10 µF, and the LED straight on the oscillator's output. */
const blinker = () => build({ ohms: 100000, farads: 10e-6, buffered: false, audio: false });
/** The same with the LED on an inverter of its own, and an Audio Out beside it. */
const bufferedBlinker = () => build({ ohms: 100000, farads: 10e-6, buffered: true, audio: true });
/** The note: nothing changed but the capacitor. */
const tone = () => build({ ohms: 100000, farads: 100e-9, buffered: true, audio: true });

/**
 * What later classes start from when they say "class 4's oscillator": the
 * Simple Oscillator example. It is this class's oscillator tuned to 440 Hz
 * (27 kΩ and 2.2 kΩ in a line, 100 nF) with its switch named SOUND.
 */
export const simplestOscillatorKept = (): Built => exampleCircuits.find((example) => example.name === 'Simple Oscillator')!.build();

/** Class 4: an inverter, a resistor and a capacitor that never settle. */
export const simplestOscillator: ClassDefinition = {
  id: 'simplest-oscillator',
  number: 4,
  unit: 'Sound',
  title: 'The simplest oscillator',
  promise: 'One chip, one resistor and one capacitor that blink a light. Then, with nothing changed but a value, they play a note.',
  startsFrom: 'An empty canvas.',

  build: [
    {
      id: 'chip',
      text: 'Put down a supply, a ground and a CD40106. Wire the supply\'s − to ground, the chip\'s VDD pin to + and its VSS pin to ground.',
      how: 'Search for "40106". A chip is many small parts in one package, with a row of pins. Hold the pointer over a pin to see its name. VDD and VSS are the chip\'s own power pins. It does nothing until both are wired.',
      done: (work) => work.parts('power').some((supply) => work.grounded(supply, 1)) && work.parts('cd40106').some((chip) => powered(work, chip)),
    },
    {
      id: 'feedback',
      text: 'Wire a 100 kΩ resistor from the pin named 1Y back to the pin named 1A.',
      how: '1A is an input and 1Y is the output that goes with it. The resistor joins the output back to its own input.',
      done: (work) => inverters(work).some((inv) => hasFeedback(work, inv)),
    },
    {
      id: 'timing',
      text: 'Wire a 10 µF capacitor from 1A to ground.',
      how: 'Search for "10u". One leg goes to 1A, where the resistor already is. The other goes to a ground.',
      done: (work) => oscillator(work) !== undefined,
    },
    {
      id: 'lamp',
      text: 'From 1Y wire a 1 kΩ resistor, then an LED, then ground.',
      how: 'The LED shows what the output is doing. Its A leg goes to the resistor and its K leg to ground.',
      done: (work) => inverters(work).some((inv) => lights(work, inv)),
    },
    playStep('This one needs no switch. It starts by itself.'),
    {
      id: 'blink',
      text: 'Watch the LED: it blinks about once a second.',
      how: 'If it stays dark, check the chip\'s VDD and VSS, and that the resistor and the capacitor both go to 1A.',
      done: (work) => work.situation.playing && between(blink(work)?.hertz, 0.5, 2),
    },
    {
      id: 'probes',
      text: 'Put a probe on 1A and another on 1Y: right-click the wire on each. Set the scope\'s Time/div to 200 ms.',
      how: 'The output jumps between 0 V and 9 V. The input climbs and falls in a slope between two levels, and never gets past either.',
      done: (work) => {
        const osc = oscillator(work);
        return work.situation.playing && osc !== undefined && work.probed(osc.chip, osc.a) && work.probed(osc.chip, osc.y);
      },
    },
    {
      id: 'buffer',
      text: 'Give the LED an inverter of its own. Wire 1Y to 2A as well, and move the LED\'s resistor from 1Y to 2Y.',
      how: 'Click the wire from 1Y to the 1 kΩ and press Delete, then wire the 1 kΩ to 2Y. The first inverter now only has to drive the second one\'s input, which takes no current. The blink is even now, and a little faster.',
      done: (work) => {
        const stage = buffer(work);
        const osc = oscillator(work);
        return stage !== undefined && osc !== undefined && lights(work, stage) && !lights(work, osc) && beat(work) !== null;
      },
    },
    {
      id: 'audio',
      text: 'Add an Audio Out and wire it to 2Y. Each time the LED changes there is a click.',
      how: 'Audio Out is how a circuit is heard: search for "audio". Turn the computer\'s sound up a little.',
      done: (work) => {
        const sound = beat(work)?.sound;
        return work.parts('audio-output').length > 0 && sound !== undefined && sound.max - sound.min > 0.1;
      },
    },
    {
      id: 'purr',
      text: 'Change the capacitor from 10 µF to 1 µF. The blink becomes a flicker and the clicks become a purr.',
      how: 'Click the capacitor and type 1u into Capacitance. A tenth of the capacitance fills ten times as fast: 13 times a second.',
      done: (work) => {
        const osc = oscillator(work);
        return (osc !== undefined && timing(work, osc).some((c) => near(c.parameters.capacitance, 1e-6)) && between(beat(work)?.hertz, 6, 25))
          || between(note(work), 60, 300);
      },
    },
    {
      id: 'note',
      text: 'Now 100 nF. The purr has become a low note, and the LED looks steadily lit.',
      how: 'Type 100n. It is the same circuit doing the same thing 130 times a second. The LED still blinks, too fast to see.',
      done: (work) => work.situation.playing && between(note(work), 60, 300),
    },
  ],

  why: [
    {
      title: 'A chip',
      text: 'A chip is a whole circuit made small and put in one package. This one holds six inverters, each on its own: 1A and 1Y are the first, 2A and 2Y the second. An inverter puts out the opposite of what it is given. Input low, near 0 V: output high, 9 V. Input high: output low, 0 V.',
    },
    {
      title: 'Two thresholds',
      text: 'The level where an input counts as high is a threshold. These inverters have two. The output flips low when the input climbs past 5.3 V, and does not flip back until the input has fallen below 3.6 V. An inverter like this is called a Schmitt trigger.',
    },
    {
      title: 'An argument with itself',
      text: 'Wiring an output back to its own input is feedback. While the output is high it fills the capacitor through the resistor, as in class 3. The input climbs to 5.3 V and the output flips low. Now the capacitor empties through the same resistor, the input falls to 3.6 V, and the output flips high again. It can never settle. A circuit that keeps going round like this is an oscillator.',
    },
    {
      title: 'How fast',
      text: 'How often it goes round is its frequency, in hertz (Hz): times a second. For this circuit it is about 1.3 ÷ (R × C). With 100 kΩ and 10 µF that is 1.3 ÷ (100,000 × 0.00001) = 1.3 Hz. A smaller resistor or a smaller capacitor fills faster, so the frequency goes up.',
    },
    {
      title: 'Rhythm and pitch',
      text: 'The output only ever jumps between two levels. Drawn on the scope that is a square wave. At 1.3 Hz it is a blink and a click. At 130 Hz the same square wave is a note. Rhythm and pitch are one thing at different speeds.',
    },
    {
      title: 'A load, and a buffer',
      text: 'Whatever an output has to supply current to is its load. With the LED straight on 1Y the blink ran at 1.03 Hz, not 1.30, and the LED was lit 60% of the time. The LED\'s current pulled the output\'s high level down to 7.48 V, so the capacitor filled more slowly than it emptied. The second inverter is a buffer: it takes the load, and leaves the oscillator alone.',
    },
  ],

  tries: [
    {
      id: 'smaller',
      title: 'A tenth of the resistance',
      question: 'With 100 nF in place, change the 100 kΩ for 10 kΩ. The note will be…',
      options: ['About ten times lower', 'The same', 'About ten times higher'],
      answer: 2,
      change: 'Click the 100 kΩ and type 10k.',
      made: (work) => near(feedbackOhms(work), 10000) && between(note(work), 600, 3000),
      result: (work) => `${formatHertz(note(work)!)}, up from 130 Hz. The capacitor fills and empties ten times as fast through a tenth of the resistance. Resistor or capacitor: either one sets the pitch.`,
    },
    {
      id: 'tuned',
      title: 'Working out a note',
      question: 'Use 1.3 ÷ (R × C). With 27 kΩ and 2.2 kΩ in a line, 29.2 kΩ in all, and 100 nF, the note will be about…',
      options: ['45 Hz', '440 Hz', '4.4 kHz'],
      answer: 1,
      change: 'Take the resistor out. Wire a 27 kΩ and a 2.2 kΩ in a line from 1Y to 1A in its place.',
      made: (work) => near(feedbackOhms(work), 29200) && between(note(work), 300, 600),
      result: (work) => `${formatHertz(note(work)!)}. That is the A that orchestras tune to. Resistors in a line add, as in class 2, so two values from the shelf can make one that is not on it.`,
    },
    {
      id: 'load',
      title: 'The LED back on the oscillator',
      question: 'Move the LED\'s resistor back from 2Y to 1Y, where it began. The note will…',
      options: ['Go up', 'Stay the same', 'Go down'],
      answer: 2,
      change: 'Delete the wire from 2Y to the 1 kΩ and wire the 1 kΩ to 1Y.',
      made: (work) => {
        const osc = oscillator(work);
        return osc !== undefined && lights(work, osc) && beat(work) !== null && beat(work)!.hertz > 20;
      },
      result: (work) => {
        const result = beat(work)!;
        return `${formatHertz(result.hertz)}, and the output is high ${Math.round(result.high * 100)}% of the time, not half. The LED is a load again: it pulls the high level down to ${formatVolts(result.out.max)}, and the capacitor fills more slowly. Move it back to 2Y.`;
      },
    },
    {
      id: 'no-feedback',
      title: 'No way back',
      question: 'Take the resistor out, so nothing joins the output to the input. The oscillator will…',
      options: ['Carry on as before', 'Run faster', 'Stop'],
      answer: 2,
      change: 'Delete the resistor, or the resistors, between 1Y and 1A. Leave the capacitor.',
      made: (work) => inverters(work).some((inv) => powered(work, inv.chip) && timing(work, inv).length > 0 && !hasFeedback(work, inv)
        && !work.circuit.getComponents().some((part) => part.type !== 'capacitor' && part.id !== inv.chip.id
          && part.pins.some((_, pin) => work.net(part, pin) === work.net(inv.chip, inv.a)))),
      result: () => 'It stops, and stays stopped. With no way for the output to fill or empty the capacitor, the input never moves and never reaches a threshold. No feedback, no oscillator. Put the resistors back.',
    },
  ],

  check: {
    goal: 'Play middle C: 262 Hz. Anywhere from 254 to 270 Hz will do.',
    reading: (work) => {
      if (!oscillator(work)) return null;
      const hertz = note(work);
      return hertz === null ? 'Your note: nothing to hear yet' : `Your note: ${formatHertz(hertz)}`;
    },
    passed: (work) => between(note(work), 254, 270),
    hint: 'Calculated, not measured: 1.3 ÷ (R × C) = 262, so R × C = 1.3 ÷ 262 = 0.005. With 100 nF that is 50 kΩ. There is no 50 kΩ on the shelf, but 47 kΩ and 2.2 kΩ in a line come close.',
  },

  keep: [
    {
      id: 'switch',
      text: 'Put a switch into the wire to the Audio Out.',
      how: 'Drag a switch onto that wire and let go when the wire lights up. Open, it is silent. Closed, it plays.',
      done: switched,
    },
    ...keepSteps({
      type: 'switch', name: 'SOUND', what: 'the switch', has: 'cd40106',
      why: 'An instrument needs a way to be quiet. On the cover there is now a switch, a lamp and a speaker.',
    }),
  ],

  words: [
    { word: 'Chip', meaning: 'A whole circuit in one package. Also called an IC, an integrated circuit.' },
    { word: 'VDD, VSS', meaning: 'A chip\'s own power pins: VDD to +, VSS to ground.' },
    { word: 'Inverter', meaning: 'Its output is the opposite of its input: low in, high out.' },
    { word: 'High, low', meaning: 'The two levels a chip like this works with: near the supply\'s voltage, and near 0 V.' },
    { word: 'Threshold', meaning: 'The level at which an input counts as high or low.' },
    { word: 'Schmitt trigger', meaning: 'An input with two thresholds: one for going up, a lower one for coming back down.' },
    { word: 'Feedback', meaning: 'An output wired back to its own input.' },
    { word: 'Oscillator', meaning: 'A circuit that keeps going round by itself.' },
    { word: 'Frequency', meaning: 'How often something repeats, in hertz (Hz): times a second. A kilohertz (kHz) is a thousand.' },
    { word: 'Square wave', meaning: 'A signal that jumps between two levels and back.' },
    { word: 'Load', meaning: 'Whatever an output has to supply current to.' },
    { word: 'Buffer', meaning: 'A stage that takes the load, so that what comes before it is left alone.' },
  ],

  circuit: tone,
  stages: [
    { upTo: 'probes', circuit: blinker },
    { upTo: 'audio', circuit: bufferedBlinker },
  ],
};
