import { harmonics, measureSignal, risings } from '@/simulation/measure/signal';
import { formatValue } from '@/utils/parameterParser';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Component } from '@/types/circuit';
import type { Built, ClassDefinition } from './types';
import type { PinOf, Work } from './Work';
import {
  CD40106, CD4040, connect, ground, isNamed, keepSteps, LED, linked, LIT, namedSwitch, near, place, playStep, plus, POWER,
  resistor, switches,
} from './kit';
import { simplestOscillatorKept } from './simplestOscillator';

// --- What this class asks of the learner's circuit ---

type Change = { componentId: string; parameter: string; value: number };

/** A look just long enough to hear a note in. */
const QUICK = { seconds: 0.05 };
/** A look long enough to see lights count in. Switching is timed between the samples, so a slow clock needs few of them. */
const SLOW = { seconds: 4, sampleRate: 2000 };
/** The same for lights on a clock fast enough to hear: it has to be run as finely as it is played, and that is dear. */
const LONG = { seconds: 2.25 };
/** What the clock of the build runs at with 10 nF, in hertz. The test measures it. */
const BUILD_CLOCK = 4408;

/** Where a counter is given its clock. */
const counterPins = (work: Work) => work.parts('cd4040').map((chip): PinOf => [chip, CD4040.CLK]);
/** Where an oscillator made of an inverter puts its output. */
const inverterPins = (work: Work) => work.parts('cd40106').flatMap((chip) => CD40106.Y.map((y): PinOf => [chip, y]));
/** The pins a clock would be found on. */
const clockPins = (work: Work) => [...counterPins(work), ...inverterPins(work)];

/** A run with every switch closed, the clock and every LED recorded. Always asked for the same way, so it is run once for a circuit. */
const look = (work: Work, timing: { seconds: number; sampleRate?: number }, set: Change[] = []) => work.bench({
  ...timing,
  set: [...switches(work, 1), ...set],
  watch: clockPins(work),
  watchAmps: work.parts('led').map((led) => led.id),
});
const quick = (work: Work) => look(work, QUICK);
const slow = (work: Work) => look(work, SLOW);

/**
 * The frequency of a recorded square wave, from a line drawn through all of
 * its rising edges. An edge is only known to the nearest sample, so the first
 * and the last alone give three figures; all of them together give five,
 * which is what it takes to write an octave down to the hertz. 0 for a trace
 * with fewer than two edges.
 */
function pitch(trace: Float32Array | null, sampleRate: number): number {
  if (!trace || trace.length === 0) return 0;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < trace.length; i++) {
    if (trace[i] < min) min = trace[i];
    if (trace[i] > max) max = trace[i];
  }
  const swing = max - min;
  if (!(swing >= 1)) return 0; // a clock swings by volts
  let edges = risings(trace, min + swing * 0.65, min + swing * 0.35);
  // The first cycle is the circuit starting up: with cycles to spare, it is left out
  if (edges.length > 2) edges = edges.slice(1);
  const n = edges.length;
  if (n < 2) return 0;
  const middle = (n - 1) / 2;
  const mean = edges.reduce((sum, at) => sum + at, 0) / n;
  let rise = 0, run = 0;
  for (let i = 0; i < n; i++) {
    rise += (i - middle) * (edges[i] - mean);
    run += (i - middle) ** 2;
  }
  return sampleRate / (rise / run);
}

/** The fastest thing on any of some pins in a run, in hertz. */
const rateOn = (pins: PinOf[], run: BenchRun) =>
  Math.max(0, ...pins.map(([part, pin]) => pitch(run.trace(part.id, part.pins[pin]?.id ?? ''), run.sampleRate)));

/** The clock in a run: what a counter is given to count or, with no counter being clocked, the fastest oscillator. */
const clockIn = (work: Work, run: BenchRun) => rateOn(counterPins(work), run) || rateOn(inverterPins(work), run);

/** Whether the clock is fast enough to be a note: the short look hears it. */
const audible = (work: Work) => clockPins(work).length > 0 && clockIn(work, quick(work)) > 0;

/** How fast a counter is being clocked, in hertz: 0 if none is. */
function counterClock(work: Work): number {
  if (work.parts('cd4040').length === 0) return 0;
  const heard = rateOn(counterPins(work), quick(work));
  return heard > 0 || audible(work) ? heard : rateOn(counterPins(work), slow(work));
}

/**
 * How often the clock ticks, in hertz: 0 if nothing ticks. Only a clock too
 * slow to hear gets the long look, which costs more the faster the clock.
 */
function clock(work: Work): number {
  if (clockPins(work).length === 0) return 0;
  return clockIn(work, quick(work)) || clockIn(work, slow(work));
}

/** A clock slow enough to follow by eye: from one tick a second to twenty. */
const ticking = (work: Work) => !audible(work) && clock(work) >= 1 && clock(work) <= 20;

/** How many times a recorded LED went from dark to lit or back. */
function flips(trace: Float32Array | null): number {
  if (!trace || trace.length === 0) return 0;
  let lit = trace[0] > LIT, count = 0;
  for (let i = 1; i < trace.length; i++) {
    if (lit ? trace[i] < LIT / 10 : trace[i] > LIT) {
      lit = !lit;
      count++;
    }
  }
  return count;
}

/** An LED over the long look: how often it blinks (null if it did not blink twice) and how many times it changed. */
interface Light {
  led: Component;
  hertz: number | null;
  flips: number;
}

/**
 * The lights slow enough to watch. One that flickers in the short look is
 * too fast to see and is left out; the long look is only taken if some
 * light is left. With a clock fast enough to hear that look is dear (a
 * light on Q12 of a note blinks once a second), so only the check asks
 * for it then.
 */
function lights(work: Work): Light[] {
  const leds = work.parts('led');
  if (leds.length === 0) return [];
  const brief = quick(work);
  const steady = leds.filter((led) => flips(brief.ampsTrace(led.id)) < 2);
  if (steady.length === 0) return [];
  const run = audible(work) ? look(work, LONG) : slow(work);
  return steady.map((led) => {
    const trace = run.ampsTrace(led.id);
    const hertz = trace ? measureSignal(trace, run.sampleRate, LIT).hertz : null;
    return { led, hertz, flips: flips(trace) };
  });
}

/** Which output of a counter a light blinks like: 1 for half the clock's rate, 2 for a quarter, and so on. 0 if it is none of them. */
function dividedBy(light: Light, clockHertz: number): number {
  if (light.hertz === null || !(clockHertz > 0)) return 0;
  const down = Math.round(Math.log2(clockHertz / light.hertz));
  return down >= 1 && near(light.hertz * 2 ** down, clockHertz) ? down : 0;
}

/**
 * The lights that count: the fastest first, each changing half as often as
 * the one before, as the digits of a binary number do. A light as fast as
 * the clock itself is not one of them.
 */
function counted(work: Work): Light[] {
  if (audible(work)) return [];
  const rate = counterClock(work);
  if (!(rate > 0)) return [];
  const blinking = lights(work)
    .filter((light) => light.flips > 0 && !(light.hertz !== null && light.hertz > rate * 0.75))
    .sort((a, b) => b.flips - a.flips);
  const chain: Light[] = [];
  for (const light of blinking) {
    const last = chain[chain.length - 1];
    // Half as many changes, give or take the one that depends on where the count began
    if (!last || (light.flips < last.flips && Math.abs(light.flips * 2 - last.flips) <= 1)) chain.push(light);
  }
  return chain;
}

/** One of the counter's outputs as it is heard: how many octaves below the clock, and its frequency. */
interface Octave {
  down: number;
  hertz: number;
}

/** An output is in the sound when its tone is at least this large (a square wave by itself, rail to rail, is 0.64). */
const HEARD = 0.04;
/** How many octaves below the clock are listened for. */
const DEEPEST = 6;

const heardIn = new WeakMap<BenchRun, Octave[]>();

/**
 * The octaves of the clock that are in the sound of a run, the highest
 * first. A counter's output is a square wave at the clock's frequency
 * divided by 2, 4, 8…, and a square wave has nothing at the frequency of
 * any other, so each can be picked out of the mix by its frequency.
 */
function octavesIn(work: Work, run: BenchRun): Octave[] {
  let found = heardIn.get(run);
  if (found) return found;
  found = [];
  const rate = rateOn(counterPins(work), run);
  // Read over whole cycles of the lowest octave, or the others spill into each other
  const depth = Math.min(DEEPEST, Math.floor(Math.log2(rate * run.seconds)));
  if (rate > 0 && depth >= 1) {
    const sizes = harmonics(run.soundTrace, run.sampleRate, rate / 2 ** depth, 2 ** depth);
    for (let down = 1; down <= depth; down++) {
      if (sizes[2 ** (depth - down) - 1] >= HEARD) found.push({ down, hertz: rate / 2 ** down });
    }
  }
  heardIn.set(run, found);
  return found;
}

/** The octaves heard with every switch closed. */
const heard = (work: Work) => octavesIn(work, quick(work));

/**
 * The switch that takes the lowest octave out of the mix and leaves the
 * rest: with what is heard while it is open and while it is closed.
 */
function bassSwitch(work: Work, named?: string): { part: Component; open: Octave[]; closed: Octave[] } | undefined {
  const closed = heard(work);
  if (closed.length < 2) return undefined;
  const lowest = closed[closed.length - 1].down;
  for (const part of work.parts('switch')) {
    if (named && !isNamed(part, named)) continue;
    const open = octavesIn(work, look(work, QUICK, [{ componentId: part.id, parameter: 'closed', value: 0 }]));
    if (open.length === closed.length - 1 && open.every((octave) => octave.down !== lowest)) return { part, open, closed };
  }
  return undefined;
}

/** How many of the counters' outputs reach an Audio Out through resistors and switches. */
function mixed(work: Work): number {
  const outs = work.parts('audio-output').map((out) => work.net(out, 0));
  return work.parts('cd4040')
    .flatMap((chip) => CD4040.Q.map((q) => work.net(chip, q)))
    .filter((net) => outs.some((out) => linked(work, net, out, ['resistor', 'switch'], 4))).length;
}

/** A counter whose RST is on one of its own outputs, and not on ground. */
const resetsItself = (work: Work) => work.parts('cd4040').some((chip) =>
  !work.grounded(chip, CD4040.RST) && CD4040.Q.some((q) => work.joined(chip, CD4040.RST, chip, q)));

/** A light that never came on in the long look. */
const neverLit = (work: Work) => {
  const run = slow(work);
  return work.parts('led').some((led) => flips(run.ampsTrace(led.id)) === 0 && run.amps(led.id) < LIT / 10);
};

/** A frequency as the class writes it: "4,408 Hz", "2.20 Hz". */
const hz = (hertz: number) => `${hertz >= 100 ? Math.round(hertz).toLocaleString('en-US') : hertz.toFixed(2)} Hz`;

/** "a, b and c". */
const listed = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** A blink of about once a second: 0.9 to 1.1 Hz, as it reads to two places. */
const onceASecond = (hertz: number) => Number(hertz.toFixed(2)) >= 0.9 && Number(hertz.toFixed(2)) <= 1.1;

/** What the check looks for: a light at about 1 Hz and one exactly four times as fast. */
function fourToOne(work: Work): { blinking: number[]; beat: number | null; four: number | null } {
  const blinking = lights(work).flatMap((light) => (light.hertz === null ? [] : [light.hertz])).sort((a, b) => b - a);
  const beats = blinking.filter(onceASecond);
  for (const beat of beats) {
    const four = blinking.find((hertz) => near(hertz, beat * 4));
    if (four !== undefined) return { blinking, beat, four };
  }
  return { blinking, beat: beats[0] ?? null, four: null };
}

// --- The circuits ---

/** Where the four lights stand: Q4's on the left, so the row reads as a number. */
const COLUMNS = [1460, 1320, 1180, 1040];

/** Class 4's kept oscillator: the Simple Oscillator example, with the capacitor asked for. */
function oscillator(farads = 100e-9) {
  const { components, connections } = simplestOscillatorKept();
  const one = (type: string) => components.find((part) => part.type === type)!;
  const timing = one('capacitor');
  timing.parameters = { ...timing.parameters, capacitance: farads, value: formatValue(farads, 'capacitance') };
  return { components, connections, chip: one('cd40106'), supply: one('power'), sound: one('switch'), out: one('audio-output') };
}

/**
 * The oscillator clocking a CD4040 with a light on each of Q1 to Q4. With
 * `stack`, Q2, Q3 and Q4 are also mixed through 100 kΩ each into the Audio
 * Out, in place of the oscillator; with `bass`, Q4's goes through a switch
 * of that name.
 */
function counter(farads: number, stack = false, bass = false): Built {
  const { components, connections, chip, supply, sound, out } = oscillator(farads);
  const count = place('cd4040', 900, 420);
  const supplyGround = ground(980, 230);
  const resetGround = ground(800, 420);
  components.push(count, supplyGround, resetGround);
  connections.push(
    connect(supply, POWER.PLUS, count, CD4040.VDD),
    connect(count, CD4040.VSS, supplyGround, 0),
    connect(count, CD4040.RST, resetGround, 0),
    connect(chip, CD40106.Y[0], count, CD4040.CLK),
  );
  COLUMNS.forEach((x, q) => {
    const limit = resistor(1000, x, 470, 90);
    const led = place('led', x, 570, { rotation: 90 });
    const ledGround = ground(x, 650);
    components.push(limit, led, ledGround);
    connections.push(connect(count, CD4040.Q[q], limit, 0), connect(limit, 1, led, LED.A), connect(led, LED.K, ledGround, 0));
  });
  if (!stack) return { components, connections };

  // The Audio Out moves from the oscillator to the mix, at the bottom right
  const toSound = connections.findIndex((wire) => wire.from.componentId === chip.id && wire.to.componentId === sound.id);
  connections.splice(toSound, 1);
  sound.position = { x: 1480, y: 740 };
  out.position = { x: 1570, y: 780 };
  for (const q of [1, 2, 3]) {
    const share = resistor(100e3, COLUMNS[q] + 60, 470, 90);
    components.push(share);
    connections.push(connect(count, CD4040.Q[q], share, 0));
    if (bass && q === 3) {
      const low = namedSwitch('BASS', COLUMNS[q] + 60, 610, true);
      low.rotation = 90;
      components.push(low);
      connections.push(connect(share, 1, low, 0), connect(low, 1, sound, 0));
    } else {
      connections.push(connect(share, 1, sound, 0));
    }
  }
  return { components, connections };
}

/** What the class keeps: the octave stack on a clock of 4,408 Hz, Q4's octave on a switch named BASS. */
export const countingKept = (): Built => counter(10e-9, true, true);

/** Class 8: a chip that counts, slowly on four lights and fast as a stack of octaves. */
export const counting: ClassDefinition = {
  id: 'counting',
  number: 8,
  unit: 'Logic and rhythm',
  title: 'Counting',
  promise: 'A chip that counts in binary on four lights, then turns one note into a stack of octaves.',
  startsFrom: 'The oscillator you kept in class 4: 441 Hz, with its SOUND switch.',
  start: () => {
    const { components, connections } = oscillator();
    return { components, connections };
  },

  build: [
    {
      id: 'slow',
      text: 'Change the oscillator\'s 100 nF capacitor for 10 µF.',
      how: 'Click the capacitor and type 10u into Capacitance, at the top right. A hundred times the capacitance is a hundred times slower: the 441 Hz note becomes a tick, 4.4 times a second.',
      done: ticking,
    },
    {
      id: 'counter',
      text: 'Put a CD4040 to the right of the oscillator. Wire its VDD pin to + and its VSS pin to ground.',
      how: 'Search for "4040". Like every chip it does nothing until its own two power pins are connected. Drop a new ground symbol beside it: every ground is the same point.',
      done: (work) => work.parts('cd4040').some((chip) => work.net(chip, CD4040.VDD) === plus(work) && work.grounded(chip, CD4040.VSS)),
    },
    {
      id: 'reset',
      text: 'Wire its RST pin to ground.',
      how: 'RST is on the left of the chip, below CLK. What it is for comes later. It needs to be low, and ground is always low.',
      done: (work) => work.parts('cd4040').some((chip) => work.grounded(chip, CD4040.RST)),
    },
    {
      id: 'clock',
      text: 'Wire the oscillator\'s output, 1Y, to the CD4040\'s CLK pin.',
      how: 'Leave the wire from 1Y to the SOUND switch where it is: a pin can have more than one wire. Press on 1Y and drag to CLK.',
      done: (work) => counterClock(work) > 0,
    },
    {
      id: 'first',
      text: 'From the CD4040\'s Q1 pin wire a 1 kΩ resistor, then an LED, then ground.',
      how: 'Q1 is the top one of the twelve pins on the right. The resistor goes to the LED\'s A leg and the K leg goes to ground, as in class 1.',
      done: (work) => ticking(work) && lights(work).some((light) => dividedBy(light, counterClock(work)) > 0),
    },
    playStep('The Audio Out ticks 4.4 times a second. The light blinks at half that: 2.20 Hz.'),
    {
      id: 'four',
      text: 'Do the same on Q2, Q3 and Q4: a 1 kΩ and an LED from each to ground. Stand the four lights in a row with Q4\'s on the left and Q1\'s on the right.',
      how: 'Now read the row as a number. Q1\'s light is worth 1, Q2\'s 2, Q3\'s 4 and Q4\'s 8. Add up the ones that are lit: it goes from 0 to 15 and starts again.',
      done: (work) => counted(work).length >= 4,
    },
    {
      id: 'edge',
      text: 'Put a probe on CLK and another on Q1: right-click the wire on each. Set the scope\'s Time/div to 200 ms and look at where Q1 changes.',
      how: 'Q1 changes only at the moment CLK falls from high to low, and never when it rises. So Q1 goes up and down once while CLK does it twice.',
      done: (work) => work.situation.playing
        && work.parts('cd4040').some((chip) => work.probed(chip, CD4040.CLK) && work.probed(chip, CD4040.Q[0])),
    },
    {
      id: 'fast',
      text: 'Now change the 10 µF for 10 nF: a thousand times smaller.',
      how: 'Click the capacitor and type 10n. It is shrill: the oscillator now runs at about 4,400 Hz. Open SOUND if you would rather not hear it. The four lights seem to stop and glow.',
      done: (work) => counterClock(work) > 1000,
    },
    {
      id: 'listen',
      text: 'Move the SOUND switch\'s wire from the oscillator\'s output to Q1, and listen. Then move it to Q2, Q3 and Q4 in turn.',
      how: 'Click the wire from 1Y to the switch and press Delete, then draw one from Q1 to the switch. Leave the wire from 1Y to CLK alone. Close SOUND again if you opened it. It is the same note each time, lower and lower.',
      done: (work) => work.situation.playing && heard(work).length >= 1,
    },
    {
      id: 'mix',
      text: 'Take that wire off. Wire a 100 kΩ resistor from each of Q2, Q3 and Q4 to one shared point, and wire that point to the SOUND switch.',
      how: 'Leave the lights where they are: each of those outputs now has two things on it. Three resistors into one point is the mix of class 6.',
      done: (work) => heard(work).length >= 3,
    },
  ],

  why: [
    {
      title: 'Half, and half again',
      text: 'Inside the CD4040 is a chain of twelve stages. Each one changes over, high to low or low to high, every time the one before it falls. Two changes make one full cycle, so each stage runs at half the frequency of the one before. Q1 is CLK divided by 2, Q2 by 4, Q3 by 8, Q4 by 16, and so on down to Q12: CLK divided by 4,096. With the 10 µF, CLK ran at 4.4 Hz and the lights blinked at 2.20, 1.10, 0.55 and 0.28 Hz.',
    },
    {
      title: 'Counting',
      text: 'A chip like this is a counter. Each output can only be high or low, lit or dark, so it counts in binary: with digits that are 0 or 1. The first is worth 1, the next 2, then 4, then 8. Four lights count from 0 to 15 and start again: that took 3.6 seconds. All twelve outputs would count to 4,095.',
    },
    {
      title: 'The clock and its edge',
      text: 'A steady tick that other parts keep time to is a clock, which is why the pin is called CLK. The moment a signal changes is an edge: a rising edge from low to high, a falling edge from high to low. The CD4040 counts falling edges. That is what the scope showed: Q1 changed each time CLK fell.',
    },
    {
      title: 'Reset',
      text: 'RST is reset. While it is high every output is low and the count is held at 0. On ground it is low, and the chip is free to count. The app is kind here: a RST pin with no wire on it reads low and the chip counts anyway. On a real board it would be a floating input (class 7), and the count would start again whenever it liked.',
    },
    {
      title: 'Octaves',
      text: 'Half the frequency is one octave down (class 5). So with CLK at 4,408 Hz the same four outputs are one note in four octaves: 2,204 Hz, 1,102 Hz, 551 Hz and 276 Hz. A counter used this way is a frequency divider. The lights have not stopped. Each is lit exactly half of the time, too fast to see, so all four glow.',
    },
    {
      title: 'One job at two speeds',
      text: 'A slow clock gives a count, and a beat with its subdivisions: halves, quarters, eighths. A fast one gives a note and the octaves below it. The chip does not know the difference. The Octave Organ example is this circuit with a knob for the pitch and one more chip, to drive a speaker (class 12). Load it once you have saved yours.',
    },
  ],

  tries: [
    {
      id: 'fourth',
      title: 'A fourth octave',
      question: 'Add Q1 to the mix through a fourth 100 kΩ. Q1 is an octave above Q2. You will hear…',
      options: ['A new note on top, as in a chord', 'The same note, brighter', 'The whole sound move up an octave'],
      answer: 1,
      change: 'Wire a 100 kΩ resistor from Q1 to the shared point. Play, and listen.',
      made: (work) => heard(work).length >= 4,
      result: (work) => `Your mix now holds ${listed(heard(work).map((octave) => hz(octave.hertz)))}. It is not a chord. Notes an octave apart fuse: the ear hears one note, at the pitch of the lowest, and takes the octaves above it for its colour. Leave the fourth resistor in or take it out, as you like.`,
    },
    {
      id: 'bass',
      title: 'A switch for the bass',
      question: 'Put a switch in line with Q4\'s 100 kΩ and open it. Q4 is the lowest octave in the mix. The note you hear will…',
      options: ['Stop', 'Stay where it is, only quieter', 'Jump up an octave'],
      answer: 2,
      change: 'Put a switch between Q4\'s 100 kΩ resistor and the shared point. Dropped onto the wire between them, it goes into the wire. Play, and click the switch.',
      made: (work) => bassSwitch(work) !== undefined,
      result: (work) => {
        const { open, closed } = bassSwitch(work)!;
        return `Open, the lowest octave in the mix is ${hz(open[open.length - 1].hertz)}. Closed, it is ${hz(closed[closed.length - 1].hertz)}. The pitch you hear is the lowest octave there is, so one switch moves the whole note. The Octave Organ example has the same switch, named BASS.`;
      },
    },
    {
      id: 'tune',
      title: 'Retune the oscillator',
      question: 'Change the oscillator\'s 27 kΩ for 47 kΩ. The octaves in the mix will…',
      options: ['Move down together, still exactly an octave apart', 'Move down by different amounts, and go out of tune', 'Stay where they are: the counter sets the pitch'],
      answer: 0,
      change: 'Click the 27 kΩ resistor and type 47k into Resistance. Close every switch and listen.',
      made: (work) => counterClock(work) > 1000 && !near(counterClock(work), BUILD_CLOCK, 0.05) && heard(work).length >= 3,
      result: (work) => `The clock now runs at ${hz(counterClock(work))} and the mix holds ${listed(heard(work).map((octave) => hz(octave.hertz)))}: each still exactly half of the one above. The three oscillators of class 6 drifted against each other and beat. These cannot: they are one oscillator, counted. Put the 27 kΩ back.`,
    },
    {
      id: 'rhythm',
      title: 'The same mix, slowly',
      question: 'Leave the mix wired and put the 10 µF back in the oscillator. From the Audio Out you will hear…',
      options: ['Nothing: it is too slow to hear', 'A very low hum', 'A pattern of clicks, in time with the lights'],
      answer: 2,
      change: 'Click the capacitor and type 10u. Close every switch, play, and watch the lights while you listen.',
      made: (work) => ticking(work) && counted(work).length >= 3 && mixed(work) >= 2,
      result: (work) => {
        const rates = counted(work).flatMap((light) => (light.hertz === null ? [] : [hz(light.hertz)]));
        return `The clock ticks at ${hz(clock(work))} and the lights blink at ${listed(rates)}. Each click is one of the outputs in the mix changing over. Take Q4's light as the bar: Q3 cuts it in two, Q2 in four. A counter makes the subdivisions of a beat just as it makes the octaves of a note. Leave the 10 µF in for the next one.`;
      },
    },
    {
      id: 'seven',
      title: 'A counter that resets itself',
      question: 'With the 10 µF still in, take RST off ground and wire it to Q4 instead. The lights will…',
      options: ['Stop at 15, all lit', 'Never get past 7', 'Count twice as fast'],
      answer: 1,
      change: 'Click the wire from RST to ground and press Delete. Draw a wire from RST to Q4. Play and watch Q4\'s light.',
      made: (work) => ticking(work) && resetsItself(work) && counted(work).length >= 1 && neverLit(work),
      result: (work) => {
        const chain = counted(work);
        const slowest = chain[chain.length - 1].hertz;
        const round = slowest === null ? '' : `, once every ${(1 / slowest).toFixed(1)} seconds`;
        return `The count now runs from 0 to ${2 ** chain.length - 1} and starts again${round}. One light never comes on. The moment its output goes high, RST goes high with it and the chip is back at 0, before the light can show. A counter that resets itself can be made to count to other numbers than 15. Put RST back on ground.`;
      },
    },
  ],

  check: {
    goal: 'Two lights from one oscillator: one that blinks once a second (anywhere from 0.9 to 1.1 Hz will do) and one that blinks exactly four times as fast.',
    reading: (work) => {
      if (work.parts('led').length === 0) return null;
      const { blinking, beat, four } = fourToOne(work);
      if (blinking.length === 0) return 'No light is blinking slowly enough to see.';
      const rates = `Your lights: ${listed(blinking.map((hertz) => hz(hertz)))}.`;
      if (beat !== null && four !== null) return `${rates} The ${hz(four)} one is four times the ${hz(beat)} one.`;
      if (beat !== null) return `${rates} None is four times as fast as the ${hz(beat)} one.`;
      return `${rates} None is between 0.9 and 1.1 Hz.`;
    },
    passed: (work) => fourToOne(work).four !== null,
    hint: 'Calculated, not measured: each output blinks exactly half as fast as the one before, so two outputs that are two apart are exactly four times apart. The slow way: with the 10 µF in, a light on Q3 blinks at an eighth of the clock\'s rate, so the clock must tick about 8 times a second. It ticks 4.4 times now, so it needs about half the resistance: 15 kΩ in place of the 27 kΩ. Q1\'s light is then four times as fast as Q3\'s. The fast way: leave the 10 nF in. 4,408 Hz divided by 4,096 is 1.08 Hz, and that is Q12. Move two of the lights to Q12 and Q10.',
  },

  keep: [
    {
      id: 'stack',
      text: 'Make it the octave stack again: 10 nF in the oscillator, RST on ground, and Q2, Q3 and Q4 mixed into the Audio Out.',
      how: 'Whatever you changed for the check, change it back. The lights can stay on any outputs you like. Play it: you should hear the note of the build.',
      done: (work) => heard(work).length >= 3,
    },
    ...keepSteps({
      type: 'switch', name: 'BASS', what: 'the switch in line with Q4\'s 100 kΩ', has: 'cd4040',
      why: 'It puts the lowest octave in and takes it out. If you took the switch away, put one back first.',
    }).map((step) => (step.id === 'name' ? { ...step, done: (work: Work) => bassSwitch(work, 'BASS') !== undefined } : step)),
  ],

  words: [
    { word: 'Clock', meaning: 'A steady tick that other parts keep time to. CLK is the pin it goes in by.' },
    { word: 'Edge', meaning: 'The moment a signal changes: rising, from low to high, or falling, from high to low.' },
    { word: 'Counter', meaning: 'A chip that counts the edges of its clock. The CD4040 counts falling edges, up to 4,095.' },
    { word: 'Binary', meaning: 'Counting with digits that are only 0 or 1. The digits are worth 1, 2, 4, 8 and so on.' },
    { word: 'Reset', meaning: 'Putting a counter back to 0. The CD4040\'s RST pin does it for as long as it is high.' },
    { word: 'Frequency divider', meaning: 'A counter seen another way: each output is the clock at half the frequency of the one before, an octave lower.' },
    { word: 'Subdivision', meaning: 'A beat cut into equal parts: halves, quarters, eighths.' },
  ],

  circuit: () => counter(10e-9, true),
  stages: [
    { upTo: 'edge', circuit: () => counter(10e-6) },
  ],
};
