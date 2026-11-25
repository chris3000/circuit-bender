import { measureSignal } from '@/simulation/measure/signal';
import { formatAmps, formatHertz, formatVolts } from '@/utils/readings';
import type { Component, Connection } from '@/types/circuit';
import type { Built, ClassDefinition } from './types';
import { GROUND, type PinOf, type Work } from './Work';
import {
  all, capacitor, CD40106, CD4017, connect, ground, isNamed, keepSteps, LED, LIT, namedSwitch, NE555, place, plus, pot, POT,
  POWER, reading, resistor, spans, switches, valued,
} from './kit';

// --- Reading a sequence ---

/** One step of a sequence: the time between two rising edges of the counter's clock. */
export interface StepReading {
  /** Which of the counter's outputs is high, 0 for Q0. Seen where that output is wired to something, worked out from its neighbours where not, null where neither. */
  count: number | null;
  /** The pitch of what is heard during the step. Null for silence, for a run too slow to tell, and for a step too short to read. */
  hertz: number | null;
  /** The current through each LED during the step, in amps, by the LED's id. */
  amps: Map<string, number>;
}

/** What a counter and the things it drives do, step by step. */
export interface Sequence {
  /** Steps a second: the rising edges of the counter's clock. */
  rate: number;
  /** The steps seen, in order. The circuit does not start on Q0: the clock ticks while the app finds where to start. */
  steps: StepReading[];
  /** How many steps a loop has: the count that was reached when Q0 came round. Null if that was not seen. */
  loop: number | null;
  /** The highest voltage each output reached, Q0 first (0 for one with nothing wired to it). */
  tops: number[];
}

type Change = { componentId: string; parameter: string; value: number };

/** A pitch is only read from a run fast enough to hold it, and a step long enough to have some cycles in it. */
const SLOWEST_FOR_PITCH = 4000;
const SHORTEST_FOR_PITCH = 0.05;

/**
 * Runs the circuit and cuts the run into steps at the rising edges of the
 * first CD4017's clock. In each step it finds which output is high, the
 * pitch of the sound and the current through every LED. Null without a
 * counter, or without a clock that ticks at least twice in the time.
 */
export function readSequence(work: Work, options: { seconds: number; sampleRate: number; set?: Change[] }): Sequence | null {
  const counter = work.parts('cd4017')[0];
  if (!counter) return null;
  const leds = work.parts('led');
  const run = work.bench({
    seconds: options.seconds, sampleRate: options.sampleRate, set: options.set ?? [],
    watch: [[counter, CD4017.CLK], ...CD4017.Q.map((pin): PinOf => [counter, pin])],
    watchAmps: leds.map((led) => led.id),
  });
  const clock = run.trace(counter.id, counter.pins[CD4017.CLK].id);
  if (!clock || clock.length === 0) return null;

  // Where the clock rises through the middle of its swing
  const level = measureSignal(clock, run.sampleRate);
  if (level.max - level.min < 1) return null;
  const middle = (level.min + level.max) / 2;
  const edges: number[] = [];
  for (let i = 1; i < clock.length; i++) if (clock[i - 1] <= middle && clock[i] > middle) edges.push(i);
  if (edges.length < 2) return null;

  const outputs = CD4017.Q.map((pin) => run.trace(counter.id, counter.pins[pin].id));
  const tops = outputs.map((trace) => (trace ? measureSignal(trace, run.sampleRate).max : 0));
  const currents = leds.map((led) => ({ id: led.id, trace: run.ampsTrace(led.id) }));
  const mean = (trace: ArrayLike<number> | null, from: number, to: number) => {
    if (!trace || to <= from) return 0;
    let sum = 0;
    for (let i = from; i < to; i++) sum += trace[i];
    return sum / (to - from);
  };

  // A step is read a little way in from its ends, clear of the edges themselves
  const steps: StepReading[] = [];
  const bounds = [0, ...edges, clock.length];
  for (let s = 0; s + 1 < bounds.length; s++) {
    const length = bounds[s + 1] - bounds[s];
    // What is left after the last edge is a step if there is enough of it to see what is lit
    if (s + 2 === bounds.length && length < 0.02 * run.sampleRate) break;
    const margin = Math.max(2, Math.round(length * 0.03));
    const from = bounds[s] + margin, to = bounds[s + 1] - margin;
    let count: number | null = null, highest = 0;
    outputs.forEach((trace, q) => {
      const volts = mean(trace, from, to);
      if (tops[q] > 1 && volts > tops[q] / 2 && volts > highest) { count = q; highest = volts; }
    });
    const audible = run.sampleRate >= SLOWEST_FOR_PITCH && to - from >= SHORTEST_FOR_PITCH * run.sampleRate;
    steps.push({
      count,
      hertz: audible ? measureSignal(run.soundTrace.subarray(from, to), run.sampleRate).hertz : null,
      amps: new Map(currents.map(({ id, trace }) => [id, mean(trace, from, to)])),
    });
  }

  // Each edge moves the count on by one, so one sighting places its neighbours.
  // Q0 seen after a known count says how long the loop is.
  let loop: number | null = null;
  for (let s = 1; s < steps.length; s++) {
    const before = steps[s - 1].count;
    if (before === null) continue;
    if (steps[s].count === 0 && before > 0 && loop === null) loop = before + 1;
    if (steps[s].count === null) steps[s].count = (before + 1) % (loop ?? 10);
  }
  for (let s = steps.findIndex((step) => step.count !== null) - 1; s >= 0; s--) {
    const after = steps[s + 1].count!;
    if (after === 0 && loop === null) break;
    steps[s].count = after > 0 ? after - 1 : loop! - 1;
  }

  return {
    rate: ((edges.length - 1) / (edges[edges.length - 1] - edges[0])) * run.sampleRate,
    steps, loop, tops,
  };
}

// Three ways of running a sequence. Lights can be read from a slow run, which
// costs little. Telling notes apart needs a faster one. A pitch that is
// quoted is read as the app plays it, once, when an experiment shows its result.
const SLOW = 1000, HEARD = 8000, PLAYED = 48000;

/** What is lit on each step, with every switch closed (or as `set` has them). */
const lights = (work: Work, set = switches(work, 1)) => readSequence(work, { seconds: 5, sampleRate: SLOW, set });
/** The notes, well enough to tell one from another. */
const notes = (work: Work) => readSequence(work, { seconds: 2.2, sampleRate: HEARD, set: switches(work, 1) });
/** The notes as the app plays them. */
const played = (work: Work, set = switches(work, 1)) => readSequence(work, { seconds: 2.2, sampleRate: PLAYED, set });

/** The pitch of the step on which output `count` is high. */
const noteAt = (sequence: Sequence | null, count: number): number | null =>
  sequence?.steps.find((step) => step.count === count && step.hertz !== null)?.hertz ?? null;

const hertz = (value: number | null) => (value === null ? 'no note' : formatHertz(value));

const isLit = (step: StepReading, led: Component) => (step.amps.get(led.id) ?? 0) > LIT;

// --- What this class asks of the learner's circuit ---

/** Whether anything else is wired to a pin. */
function wiredUp(work: Work, part: Component, pin: number): boolean {
  const net = work.net(part, pin);
  return work.circuit.getComponents().some((other) =>
    other.pins.some((_, i) => (other.id !== part.id || i !== pin) && work.net(other, i) === net));
}

/** The tone with the sequencer's parts: 47 kΩ from + to DISCH, 4.7 kΩ on to THRES and TRIG, 100 nF from there to ground. */
function retuned(work: Work): boolean {
  const supply = plus(work);
  return supply !== null && work.parts('ne555').some((voice) => {
    const disch = work.net(voice, NE555.DISCH), thres = work.net(voice, NE555.THRES);
    return work.joined(voice, NE555.THRES, voice, NE555.TRIG)
      && valued(work, 'resistor', 47e3).some((r) => spans(work, r, supply, disch))
      && valued(work, 'resistor', 4.7e3).some((r) => spans(work, r, disch, thres))
      && valued(work, 'capacitor', 100e-9).some((c) => spans(work, c, thres, GROUND));
  });
}

/** A clock: an inverter of a CD40106 whose output goes up and down a few times a second. */
function ticking(work: Work): boolean {
  const pins = work.parts('cd40106').flatMap((chip) => CD40106.Y.map((y): PinOf => [chip, y]));
  if (pins.length === 0) return false;
  const run = work.bench({ seconds: 2, sampleRate: SLOW, watch: pins });
  return pins.some(([chip, y]) => {
    const rate = reading(run, chip, y).hertz;
    return rate !== null && rate > 0.5 && rate < 40;
  });
}

/** A counter with its supply, its two spare inputs dealt with, and the clock on CLK. */
function counterWired(work: Work): boolean {
  const supply = plus(work);
  return supply !== null && work.parts('cd4017').some((counter) =>
    work.net(counter, CD4017.VDD) === supply && work.grounded(counter, CD4017.VSS)
    && work.grounded(counter, CD4017.INH) && wiredUp(work, counter, CD4017.RST)
    && work.wired('cd4017', [CD4017.CLK], 'cd40106', CD40106.Y)) && ticking(work);
}

/** Lights that chase: at least four LEDs that each have a turn, and never two at once. */
function chases(work: Work): boolean {
  const leds = work.parts('led');
  if (leds.length < 4) return false;
  const sequence = lights(work);
  if (!sequence) return false;
  const lit = sequence.steps.map((step) => leds.filter((led) => isLit(step, led)));
  return lit.every((those) => those.length <= 1) && new Set(lit.flat()).size >= 4;
}

/** The LED that lights on just these counts of a loop of this length. */
function ledOn(work: Work, sequence: Sequence | null, counts: number[], loop: number): Component | undefined {
  if (!sequence || sequence.loop !== loop) return undefined;
  return work.parts('led').find((led) =>
    counts.every((count) => sequence.steps.some((step) => step.count === count))
    && sequence.steps.every((step) => isLit(step, led) === (step.count !== null && counts.includes(step.count))));
}

/** The outputs of the counter that have a resistor to the 555's CTRL. */
function noteOutputs(work: Work): number[] {
  const found = new Set<number>();
  for (const voice of work.parts('ne555')) {
    const ctrl = work.net(voice, NE555.CTRL);
    for (const counter of work.parts('cd4017')) {
      CD4017.Q.forEach((pin, q) => {
        const output = work.net(counter, pin);
        if (work.parts('resistor').some((r) => spans(work, r, output, ctrl))) found.add(q);
      });
    }
  }
  return [...found];
}

/** At least this many outputs reach CTRL through a resistor, and the pitch moves from step to step. */
function plays(work: Work, outputs: number): boolean {
  if (noteOutputs(work).length < outputs) return false;
  const pitches = (notes(work)?.steps ?? []).flatMap((step) => (step.hertz === null ? [] : [step.hertz]));
  return pitches.length >= 3 && Math.max(...pitches) > Math.min(...pitches) * 1.1;
}

/** A resistor of this value from output `q` to CTRL. */
function noteResistor(work: Work, q: number, ohms: number): boolean {
  return work.parts('ne555').some((voice) => work.parts('cd4017').some((counter) =>
    valued(work, 'resistor', ohms).some((r) => spans(work, r, work.net(counter, CD4017.Q[q]), work.net(voice, NE555.CTRL)))));
}

/** The first step with its light taken off: Q0 still plays its note, and the other three steps still have their lights. */
function firstLightOff(work: Work): boolean {
  if (!noteOutputs(work).includes(0) || work.parts('led').length < 3) return false;
  const sequence = lights(work);
  if (!sequence || sequence.loop !== 4) return false;
  const litOn = (count: number) => sequence.steps.filter((step) => step.count === count)
    .map((step) => work.parts('led').filter((led) => isLit(step, led)).length);
  return litOn(0).length > 0 && litOn(0).every((n) => n === 0)
    && [1, 2, 3].every((count) => litOn(count).length > 0 && litOn(count).every((n) => n === 1));
}

/** How many steps a second with every pot turned to `position`. */
const rateAt = (work: Work, position: number): number | null =>
  readSequence(work, { seconds: 2, sampleRate: SLOW, set: [...switches(work, 1), ...all(work, 'potentiometer', 'position', position)] })?.rate ?? null;

/** The slowest and fastest a pot makes the clock go, if it changes it at all. */
function tempoRange(work: Work): [number, number] | null {
  if (work.parts('potentiometer').length === 0) return null;
  const a = rateAt(work, 0), b = rateAt(work, 1);
  if (a === null || b === null) return null;
  const range: [number, number] = [Math.min(a, b), Math.max(a, b)];
  return range[1] > range[0] * 1.5 ? range : null;
}

/** A switch that makes the loop short: four steps with it closed, all ten with it open. */
function shortWorks(work: Work): boolean {
  return work.parts('switch').length > 0 && lights(work)?.loop === 4 && lights(work, switches(work, 0))?.loop === 10;
}

// --- The circuits ---

interface Parts {
  components: Component[];
  connections: Connection[];
}

/**
 * Class 9's tone: a 555 running free with an Audio Out on OUT. `low` gives
 * it the sequencer's values. It sits at the right, with room between it and
 * the supply for the clock and the counter.
 */
function tone(low: boolean) {
  const supply = place('power', 100, 200);
  const supplyGround = ground(100, 300);
  const voice = place('ne555', 1200, 300);
  const voiceGround = ground(1280, 180);
  const fill = resistor(low ? 47e3 : 10e3, 1100, 160);
  const empty = resistor(low ? 4.7e3 : 47e3, 1100, 520, 90);
  const cap = capacitor(low ? 100e-9 : 10e-9, 1200, 480, 90);
  const capGround = ground(1200, 580);
  const output = place('audio-output', 1320, 310);
  return {
    supply, voice,
    components: [supply, supplyGround, voice, voiceGround, fill, empty, cap, capGround, output],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, fill, 0),
      connect(fill, 0, voice, NE555.VCC),
      connect(voice, NE555.VCC, voice, NE555.RESET),
      connect(voice, NE555.GND, voiceGround, 0),
      connect(fill, 1, voice, NE555.DISCH),
      connect(empty, 0, voice, NE555.DISCH),
      connect(empty, 1, voice, NE555.THRES),
      connect(voice, NE555.THRES, voice, NE555.TRIG),
      connect(cap, 0, voice, NE555.TRIG),
      connect(cap, 1, capGround, 0),
      connect(voice, NE555.OUT, output, 0),
    ],
  };
}

/** How the count is sent back to the start: never (RST on ground), by Q4, or by Q4 through the switch SHORT. */
type Reset = 'never' | 'q4' | 'switch';

/** The clock, the counter and its four lights, on the tone's supply. `tempo` makes the clock's resistor 47 kΩ and a pot. */
function chaser(base: ReturnType<typeof tone>, reset: Reset, tempo = false) {
  const { supply } = base;
  const clock = place('cd40106', 360, 300);
  const clockGround = ground(440, 180);
  const clockCap = capacitor(1e-6, 200, 360, 90);
  const clockCapGround = ground(200, 460);
  const counter = place('cd4017', 680, 340);
  const counterGround = ground(760, 180);
  const holdGround = ground(580, 380);
  const components = [...base.components, clock, clockGround, clockCap, clockCapGround, counter, counterGround, holdGround];
  const connections = [
    ...base.connections,
    connect(supply, POWER.PLUS, clock, CD40106.VDD),
    connect(clock, CD40106.VDD, counter, CD4017.VDD),
    connect(clock, CD40106.VSS, clockGround, 0),
    connect(counter, CD4017.VSS, counterGround, 0),
    connect(clockCap, 0, clock, CD40106.A[0]),
    connect(clockCap, 1, clockCapGround, 0),
    connect(clock, CD40106.Y[0], counter, CD4017.CLK),
    connect(counter, CD4017.INH, holdGround, 0),
  ];

  if (tempo) {
    // The middle leg and leg 3: turning the knob up takes resistance out, and the steps come faster
    const knob = pot('TEMPO', 500e3, 0.5, 300, 480);
    const least = resistor(47e3, 420, 480);
    components.push(knob, least);
    connections.push(
      connect(knob, POT.WIPER, clock, CD40106.A[0]),
      connect(knob, POT.END3, least, 0),
      connect(least, 1, clock, CD40106.Y[0]),
    );
  } else {
    const feedback = resistor(470e3, 360, 480);
    components.push(feedback);
    connections.push(connect(feedback, 0, clock, CD40106.A[0]), connect(feedback, 1, clock, CD40106.Y[0]));
  }

  if (reset === 'never') {
    connections.push(connect(counter, CD4017.RST, holdGround, 0));
  } else if (reset === 'q4') {
    connections.push(connect(counter, CD4017.Q[4], counter, CD4017.RST));
  } else {
    const short = namedSwitch('SHORT', 840, 540, true);
    const pullDown = resistor(100e3, 580, 500, 90);
    const pullDownGround = ground(580, 600);
    components.push(short, pullDown, pullDownGround);
    connections.push(
      connect(counter, CD4017.Q[4], short, 1),
      connect(short, 0, counter, CD4017.RST),
      connect(pullDown, 0, counter, CD4017.RST),
      connect(pullDown, 1, pullDownGround, 0),
    );
  }

  // A light on each of the first four steps, in a row along the bottom
  for (let i = 0; i < 4; i++) {
    const x = 760 + i * 100;
    const limit = resistor(1000, x, 660, 90);
    const led = place('led', x, 760, { rotation: 90 });
    const ledGround = ground(x, 860);
    components.push(limit, led, ledGround);
    connections.push(
      connect(counter, CD4017.Q[i], limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    );
  }
  return { ...base, counter, components, connections };
}

/** The four notes: the resistor from each of the first four outputs to the 555's CTRL. */
const NOTE_OHMS = [4.7e3, 10e3, 6.8e3, 15e3];

function withNotes(base: ReturnType<typeof chaser>): Parts {
  const { counter, voice } = base;
  const resistors = NOTE_OHMS.map((ohms, i) => resistor(ohms, 900, 120 + i * 100));
  return {
    components: [...base.components, ...resistors],
    connections: [
      ...base.connections,
      ...resistors.flatMap((note, i) => [connect(counter, CD4017.Q[i], note, 0), connect(note, 1, voice, NE555.CTRL)]),
    ],
  };
}

const built = ({ components, connections }: Parts): Built => ({ components, connections });

/**
 * What the class keeps: the sequencer, with the switch SHORT (four steps, or
 * all ten with it open) and the knob TEMPO on the clock. It is the Step
 * Sequencer example with a light on each of its four steps.
 */
export function stepsKept(): Built {
  return built(withNotes(chaser(tone(true), 'switch', true)));
}

/** The kit's look at the cover. Its other two steps are this class's own: here a name is only worth having on a control that works. */
const coverStep = keepSteps({ type: 'switch', name: 'SHORT', what: 'the switch', why: '', has: 'cd4017' })[1];

/** The switch that makes the loop short has its name. */
const shortNamed = (work: Work) => work.parts('switch').some((part) => isNamed(part, 'SHORT')) && shortWorks(work);
/** The pot that sets the tempo has its name. */
const tempoNamed = (work: Work) => work.parts('potentiometer').some((knob) => isNamed(knob, 'TEMPO')) && tempoRange(work) !== null;

/** Class 10: a counter that hands a turn round its outputs, and four of them playing a 555. */
export const steps: ClassDefinition = {
  id: 'steps',
  number: 10,
  unit: 'Logic and rhythm',
  title: 'Steps',
  promise: 'Four lights that chase, then four notes that play themselves.',
  startsFrom: 'Class 9\'s tone: a 555 running free into an Audio Out. The room between the supply and the 555 is for what you build.',
  start: () => built(tone(false)),

  build: [
    {
      id: 'retune',
      text: 'Retune the tone. Change the 10 kΩ to 47 kΩ, the 47 kΩ to 4.7 kΩ and the 10 nF to 100 nF.',
      how: 'Click a part and type its new value at the top right. Play it: the tone is now a low 255 Hz. Class 9\'s formula agrees: 1.44 ÷ ((47 kΩ + 2 × 4.7 kΩ) × 100 nF) = 255 Hz. Stop it again while you build, if you like.',
      done: retuned,
    },
    {
      id: 'clock',
      text: 'Build a slow clock in the room beside the supply. Add a CD40106, with VDD to + and VSS to ground. Wire 470 kΩ from 1Y back to 1A, and 1 µF from 1A to ground.',
      how: 'This is the oscillator of class 4, running at 2.8 Hz. A clock is an oscillator that tells another chip when to move on (class 8).',
      done: ticking,
    },
    {
      id: 'counter',
      text: 'Add a CD4017 to the right of the clock. Wire VDD to + and VSS to ground. Wire INH and RST to ground as well. Then wire the clock\'s 1Y to CLK.',
      how: 'Search the shelf for "4017". INH and RST are inputs, and an input is always wired to something (class 7). In the app one left open reads low and the chip still counts. On a real board it would pick up hum and the count would jump about.',
      done: (work) => counterWired(work) || chases(work),
    },
    {
      id: 'lights',
      text: 'From each of Q0, Q1, Q2 and Q3 wire a 1 kΩ resistor, then an LED, then ground.',
      how: 'Four times the light of class 1: the resistor to the LED\'s A leg, the K leg to ground. Put the four LEDs in a row, in order, so you can watch the light move along.',
      done: chases,
    },
    {
      id: 'chase',
      text: 'Press play. One light at a time, 2.8 steps a second. After the fourth come six steps of darkness, then the first again.',
      how: 'The chip has ten outputs, Q0 to Q9, and each has its turn. Only four have a light. The tone hums on underneath: nothing connects it to the counter yet.',
      done: (work) => work.situation.playing && chases(work),
    },
    {
      id: 'loop',
      text: 'Take RST off ground and wire it to Q4. Now there are four steps, round and round.',
      how: 'Click the wire from RST to ground and press Delete. Then drag from RST to Q4, the fifth output. INH stays on ground.',
      done: (work) => chases(work) && lights(work)?.loop === 4,
    },
    {
      id: 'first-note',
      text: 'Wire a 4.7 kΩ resistor from Q0 to the 555\'s CTRL pin. On one step in four the tone drops.',
      how: 'CTRL is the pin that bent the pitch in class 9. While Q0 is high it pushes CTRL up, and the tone is 208 Hz. While Q0 is low it pulls CTRL down, and the tone is 552 Hz.',
      done: (work) => plays(work, 1),
    },
    {
      id: 'notes',
      text: 'Three more resistors to CTRL: 10 kΩ from Q1, 6.8 kΩ from Q2 and 15 kΩ from Q3. Four notes that play themselves.',
      how: 'All four resistors meet at CTRL. The notes are 466, 642, 559 and 712 Hz, each in step with its light.',
      done: (work) => plays(work, 4),
    },
    {
      id: 'stair',
      text: 'Right-click a wire on CTRL and add a probe. The scope draws a stair of four levels, one for each step.',
      how: 'Turn the scope\'s Time/div up until a whole loop fits across it. The four levels are 4.11, 3.14, 3.56 and 2.85 V. Each voltage is a note.',
      done: (work) => work.situation.playing && plays(work, 4) && work.parts('ne555').some((voice) => work.probed(voice, NE555.CTRL)),
    },
  ],

  why: [
    {
      title: 'One of ten',
      text: 'The CD4017 is a decade counter: it counts to ten, and it has an output for each count, Q0 to Q9. Exactly one of them is high at a time. At each rising edge of the clock (class 8), the turn passes to the next output. Each turn is a step. The CD4040 of class 8 moved on the falling edge and showed its count in binary. This one shows it as a place in a row.',
    },
    {
      title: 'Reset',
      text: 'RST is a reset, as in class 8. When it goes high the count jumps back to Q0 at once. With RST on Q4, the fifth step sends the counter back the moment it begins. Q4 is high for too short a time to see, and the loop is four steps long. Put RST on another output and the loop is as long as you choose, up to ten.',
    },
    {
      title: 'A voltage for every step',
      text: 'Each of the four outputs reaches CTRL through its own resistor. The one that is high pulls CTRL up. The three that are low pull it down. A smaller resistor pulls harder, so its step leaves CTRL higher: 4.11 V through the 4.7 kΩ, 2.85 V through the 15 kΩ. A higher CTRL gives the capacitor further to fill (class 9), so each cycle takes longer and the note is lower: 466 Hz against 712 Hz.',
    },
    {
      title: 'Why the tone was retuned',
      text: 'With 47 kΩ and 4.7 kΩ the capacitor fills slowly and empties fast, so nearly all of each cycle is filling. Filling is the part that CTRL stretches and shrinks, so CTRL has a large say in the pitch. By itself CTRL sits at 6 V. The four resistors together hold it well below that, which is why every note is higher than the 255 Hz the tone had alone.',
    },
    {
      title: 'A sequence',
      text: 'Notes played in a fixed order, over and over, are a sequence, and a circuit that plays one is a sequencer. How fast the steps come is the tempo: here 2.8 steps a second, set by the clock\'s resistor and capacitor. Nothing in this circuit is new. The clock is the oscillator of class 4, the counter is clocked like the one in class 8, and the pitch is set through CTRL as in class 9.',
    },
    {
      title: 'Where it starts',
      text: 'The loop does not begin on the first light. The clock ticks a few times while the app finds where the circuit starts, and the counter counts them. A real CD4017 is no better: when the power comes on it may be at any count. A circuit that has to begin at the beginning resets its counter first.',
    },
  ],

  tries: [
    {
      id: 'compose',
      title: 'Change a note',
      question: 'Change the second step\'s resistor, the 10 kΩ on Q1, to 22 kΩ. The second note will…',
      options: ['Go down', 'Stay the same', 'Go up'],
      answer: 2,
      change: 'Click the 10 kΩ that runs from Q1 to CTRL and type 22k into Resistance. Play, and listen to the second step.',
      made: (work) => noteResistor(work, 1, 22e3) && plays(work, 4),
      result: (work) => {
        const sequence = played(work);
        const others = [0, 2, 3].map((count) => hertz(noteAt(sequence, count)));
        return `${hertz(noteAt(sequence, 1))}, up from 642 Hz. A larger resistor pulls CTRL up less on its own step. The other three notes moved too, to ${others[0]}, ${others[1]} and ${others[2]}: on their steps Q1 is low and pulls CTRL down, and through 22 kΩ it pulls less than it did. Every resistor has a say in every note. Change them until you like the tune: that is composing. Then put 10 kΩ back.`;
      },
    },
    {
      id: 'light-off',
      title: 'A light is not free',
      question: 'Take the first light off Q0, leaving its 4.7 kΩ to CTRL. The first note will…',
      options: ['Go up', 'Stay the same', 'Go down'],
      answer: 2,
      change: 'Click the wire that runs from Q0 to the first LED\'s 1 kΩ and press Delete. Leave the resistor and the LED where they are. Play, and listen to the first step.',
      made: firstLightOff,
      result: (work) => {
        const sequence = played(work);
        return `${hertz(noteAt(sequence, 0))}, down from 466 Hz. An output is not a perfect switch. The LED drew its current through Q0, and that held Q0 down at 7.33 V while it was high. With the LED gone Q0 reaches ${formatVolts(sequence?.tops[0] ?? 0)}, so it pushes CTRL higher and the note is lower. Whatever hangs on an output changes the note of its step. The Step Sequencer example is tuned with its LED in place. Wire your light back: Q0 to the 1 kΩ.`;
      },
    },
    {
      id: 'both',
      title: 'One light, two steps',
      question: 'A fifth LED with its own 1 kΩ, fed from Q0 through a diode and from Q2 through another. On step one Q0 is high and Q2 is low. The new LED will light on…',
      options: ['No step: the low output holds it down', 'Steps one and three', 'Every step'],
      answer: 1,
      change: 'Add two 1N914 diodes, a 1 kΩ and an LED. Wire Q0 to the A leg of one diode and Q2 to the A leg of the other. Wire both K legs to the 1 kΩ, the 1 kΩ to the LED\'s A leg, and its K leg to ground.',
      made: (work) => work.parts('led').length >= 2 && ledOn(work, lights(work), [0, 2], 4) !== undefined,
      result: (work) => {
        const sequence = lights(work)!;
        const led = ledOn(work, sequence, [0, 2], 4)!;
        const amps = sequence.steps.find((step) => step.count === 0)!.amps.get(led.id)!;
        return `Steps one and three, at ${formatAmps(amps)}. A diode passes current one way only (class 6). The output that is high feeds the LED through its diode. The output that is low cannot take that current away, because its diode points the wrong way. Never wire two outputs straight together: one pushes up while the other pulls down. The app lets that pass. On a real board both outputs strain and the chip runs hot. Listen to steps one and three as well: both notes went up, because Q0 and Q2 each feed two LEDs now.`;
      },
    },
    {
      id: 'tempo',
      title: 'A knob for the tempo',
      question: 'Change the clock\'s 470 kΩ to 47 kΩ and put a 500 kΩ pot in line with it. With the pot turned to no resistance at all, the four notes will…',
      options: ['Stop', 'Come too fast to hear one by one', 'Slow to a crawl'],
      answer: 1,
      change: 'Click the 470 kΩ and type 47k. Drag a potentiometer from the shelf onto the wire between that resistor and 1A: it goes into the wire. Click the pot and type 500k into Resistance. Play, and turn it all the way both ways.',
      made: (work) => tempoRange(work) !== null,
      result: (work) => {
        const [slow, fast] = tempoRange(work)!;
        return `${fast.toFixed(0)} steps a second at one end and ${slow.toFixed(1)} at the other. At the fast end the four notes run together into one rough sound. Rhythm and pitch are the same thing at different speeds, as class 7 found. The 47 kΩ is there so the clock\'s resistance can never be nothing. This pot is the TEMPO knob of the Step Sequencer example.`;
      },
    },
    {
      id: 'short',
      title: 'Four steps or ten',
      question: 'Put a switch in the wire from Q4 to RST, and 100 kΩ from RST to ground. With the switch open the loop will be…',
      options: ['Four steps, as before', 'Ten steps', 'Stopped on the fourth step'],
      answer: 1,
      change: 'Drag a switch onto the wire between Q4 and RST: it goes into the wire. Add a 100 kΩ resistor from RST to a ground. Play, and click the switch open and closed.',
      made: shortWorks,
      result: (work) => {
        const open = played(work, switches(work, 0));
        const top = open?.steps.find((step) => step.count !== null && step.count > 3 && step.hertz !== null)?.hertz ?? null;
        return `Ten steps: the four notes, then six steps of ${hertz(top)}. On those six no output with a resistor is high, so all four pull CTRL down and the tone sits at its top note. The 100 kΩ is a pull-down (class 7): it holds RST low while the switch is open. Without it the loop stays at four steps in the app, because an open switch still leaks enough to carry Q4 to an input with nothing else on it. On a real board a floating RST would reset the count at random.`;
      },
    },
  ],

  check: {
    goal: 'Make an eight-step loop that runs at about four steps a second (3.5 to 4.5), with one LED that lights on the first and fifth steps and on no others.',
    reading: (work) => {
      const sequence = lights(work);
      if (!sequence) return null;
      const rate = `${sequence.rate.toFixed(1)} steps a second`;
      if (sequence.loop === null) return `Your clock: ${rate}. The app could not find where the loop starts: it looks for Q0 coming round`;
      const led = ledOn(work, sequence, [0, 4], sequence.loop);
      return `Your loop: ${sequence.loop} steps, at ${rate}. ${led ? 'One LED lights on steps 1 and 5 only' : 'No LED lights on steps 1 and 5 only'}`;
    },
    passed: (work) => {
      const sequence = lights(work);
      return sequence !== null && sequence.loop === 8 && sequence.rate >= 3.5 && sequence.rate <= 4.5
        && ledOn(work, sequence, [0, 4], 8) !== undefined;
    },
    hint: 'Calculated, not measured: the loop is as long as the number of the output that RST is on, so RST goes to Q8, through the switch if you have one. The clock runs at about 1.3 ÷ (R × C) (class 4). For 4 steps a second with 1 µF that is 1.3 ÷ 4 = 325 kΩ: use 330 kΩ, or turn the pot. The fifth step is Q4. Feed one LED\'s 1 kΩ from Q0 and from Q4, each through its own diode.',
  },

  keep: [
    {
      id: 'name',
      text: 'Put the loop back to four steps: Q4, through the switch, to RST. Then name the switch SHORT.',
      how: 'If the switch is on Q8, move that wire back to Q4. If there is no switch yet, drag one onto the wire between Q4 and RST and add 100 kΩ from RST to ground. Click the switch and type SHORT into Name, at the top right. Closed is four steps, open is ten. The light on steps one and five can stay.',
      done: shortNamed,
    },
    {
      id: 'tempo',
      text: 'Name the clock\'s pot TEMPO.',
      how: 'If the clock has no pot yet, change its resistor to 47 kΩ and drag a 500 kΩ pot onto the wire from it to 1A. If turning the knob up slows the steps down, move the wire on the pot\'s leg 1 to its leg 3.',
      done: tempoNamed,
    },
    coverStep,
    {
      id: 'save',
      text: 'Save it: the Save button at the top.',
      how: 'Saved circuits stay in this browser. Load brings them back. Then load the Step Sequencer from the examples: it is this circuit with one light, and you can read all of it.',
      done: (work) => work.situation.saved && shortNamed(work) && tempoNamed(work),
    },
  ],

  words: [
    { word: 'Decade counter', meaning: 'A counter with ten outputs, one for each count. Exactly one is high at a time. The CD4017 is one.' },
    { word: 'Step', meaning: 'One turn of the counter: the time from one rising edge of the clock to the next.' },
    { word: 'Sequence', meaning: 'Notes or lights in a fixed order, round and round.' },
    { word: 'Sequencer', meaning: 'A circuit that plays a sequence: a clock, a counter, and something for each step to set.' },
    { word: 'Tempo', meaning: 'How fast the steps come.' },
  ],

  circuit: () => built(withNotes(chaser(tone(true), 'q4'))),
  stages: [
    { upTo: 'chase', circuit: () => built(chaser(tone(true), 'never')) },
    { upTo: 'loop', circuit: () => built(chaser(tone(true), 'q4')) },
  ],
};
