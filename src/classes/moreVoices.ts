import { measureBursts, risings } from '@/simulation/measure/signal';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Circuit } from '@/models/Circuit';
import type { Component, Connection } from '@/types/circuit';
import { formatHertz, formatVolts } from '@/utils/readings';
import type { Built, ClassDefinition, Step } from './types';
import type { PinOf, Work } from './Work';
import {
  capacitor, CD40106, connect, DIODE, ground, isNamed, keepSteps, namedSwitch, near, place, playStep, reading, resistor, switches,
} from './kit';
import { simplestOscillatorKept } from './simplestOscillator';

// --- What this class asks of the learner's circuit ---

/**
 * How long a circuit is listened to, and how finely. Slow things are timed
 * here: it has to hold two whole turns of an oscillator that goes round about
 * once a second, after the long first turn every oscillator starts with.
 */
const LISTEN = { seconds: 2.5, sampleRate: 8000 };
/** Slower than this is a rhythm, not a note. */
const AUDIBLE = 20;
/** A fifth: one and a half times the frequency, near enough. */
const isFifth = (ratio: number) => ratio >= 1.45 && ratio <= 1.55;

/** One inverter's output, as it was heard. */
interface Output {
  chip: Component;
  /** Its pin among the chip's pins. */
  pin: number;
  /** Times a second it goes round, while it runs. */
  hertz: number;
  /** The part of each cycle it is high. */
  high: number;
  /** For one that comes and goes: how many bursts a second. Null for one that never stops. */
  bursts: number | null;
  /** Each whole cycle of it: the sample it starts on and the sample it ends on. */
  cycles: Array<[number, number]>;
  trace: Float32Array;
  /** Half way between its low and its high. */
  middle: number;
}

/** Every switch closed, and every output of every CD40106 recorded: the one run everything here is read from. */
function listen(work: Work): BenchRun {
  const watch = work.parts('cd40106').flatMap((chip) => CD40106.Y.map((pin): PinOf => [chip, pin]));
  return work.bench({ ...LISTEN, set: switches(work, 1), watch });
}

/** Reads one output's trace: null for one that holds still. */
function readOutput(chip: Component, pin: number, trace: Float32Array, sampleRate: number): Output | null {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < trace.length; i++) {
    if (trace[i] < min) min = trace[i];
    if (trace[i] > max) max = trace[i];
  }
  const swing = max - min;
  if (!(swing >= 1)) return null; // an output that moves less than a volt is not switching
  const middle = (min + max) / 2, upper = middle + swing * 0.15, lower = middle - swing * 0.15;
  // Where it goes high, each time: the first sample that is up
  const rises = risings(trace, upper, lower).map(Math.ceil);
  if (rises.length < 2) return null;
  const gaps = rises.slice(1).map((at, i) => at - rises[i]);
  const usual = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  // A gap much longer than usual has a silence in it: only whole cycles are counted
  const cycles: Array<[number, number]> = [];
  let samples = 0, highs = 0;
  gaps.forEach((gap, i) => {
    if (gap > usual * 1.5) return;
    cycles.push([rises[i], rises[i + 1]]);
    samples += gap;
    for (let k = rises[i]; k < rises[i + 1]; k++) if (trace[k] > middle) highs++;
  });
  const hertz = (sampleRate * cycles.length) / samples;
  const bursts = hertz >= AUDIBLE ? measureBursts(trace, sampleRate)?.perSecond ?? null : null;
  return { chip, pin, hertz, high: highs / samples, bursts, cycles, trace, middle };
}

// A circuit never changes, so what was heard of it once is heard of it always
const heard = new WeakMap<Circuit, Output[]>();

/** Every output that is switching, on every CD40106. */
function outputs(work: Work): Output[] {
  let found = heard.get(work.circuit);
  if (!found) {
    const run = listen(work);
    found = [];
    for (const chip of work.parts('cd40106')) {
      for (const pin of CD40106.Y) {
        const trace = run.trace(chip.id, chip.pins[pin].id);
        const output = trace && readOutput(chip, pin, trace, run.sampleRate);
        if (output) found.push(output);
      }
    }
    heard.set(work.circuit, found);
  }
  return found;
}

/** The oscillators that play a note. */
const voices = (work: Work) => outputs(work).filter((output) => output.hertz >= AUDIBLE);
/** The oscillators too slow to hear. */
const slows = (work: Work) => outputs(work).filter((output) => output.hertz < AUDIBLE);

const isHigh = (output: Output, sample: number) => output.trace[sample] > output.middle;

/** A voice's pitch while a slow output is high, or while it is low: null if it does not run then. */
function pitchWhile(voice: Output, slow: Output, high: boolean): number | null {
  let count = 0, samples = 0;
  for (const [from, to] of voice.cycles) {
    if (isHigh(slow, from) !== high || isHigh(slow, to) !== high) continue;
    count++;
    samples += to - from;
  }
  return count > 0 ? (LISTEN.sampleRate * count) / samples : null;
}

/** A voice that a slow oscillator switches on and off. */
interface Gated {
  voice: Output;
  slow: Output;
  /** Whether it sounds while the slow output is high (or while it is low). */
  whileHigh: boolean;
}

function gated(work: Work): Gated[] {
  const found: Gated[] = [];
  for (const voice of voices(work)) {
    if (voice.bursts === null) continue;
    const slow = slows(work).find((s) => near(s.hertz, voice.bursts!, 0.05));
    if (!slow) continue;
    const during = voice.cycles.filter(([from]) => isHigh(slow, from)).length;
    found.push({ voice, slow, whileHigh: during > voice.cycles.length / 2 });
  }
  return found;
}

/** A voice that never stops, but whose pitch a slow oscillator moves: its pitch while that output is low and while it is high. */
function bent(work: Work): { voice: Output; low: number; high: number } | null {
  for (const voice of voices(work)) {
    if (voice.bursts !== null) continue;
    for (const slow of slows(work)) {
      const low = pitchWhile(voice, slow, false), high = pitchWhile(voice, slow, true);
      if (low !== null && high !== null && Math.abs(low - high) > 0.05 * Math.max(low, high)) return { voice, low, high };
    }
  }
  return null;
}

/** A voice whose output is high for much less, or much more, than half of each cycle. */
const lopsided = (work: Work) =>
  voices(work).find((voice) => (voice.high < 0.35 || voice.high > 0.65) && bent(work)?.voice !== voice);

/** Two voices almost at the same pitch, the lower first: close enough to beat, not so close as to be in step. */
function beating(work: Work): [Output, Output] | null {
  const all = [...voices(work)].sort((a, b) => a.hertz - b.hertz);
  for (let i = 1; i < all.length; i++) {
    const apart = all[i].hertz - all[i - 1].hertz;
    if (apart > 0.2 && apart < 0.04 * all[i].hertz) return [all[i - 1], all[i]];
  }
  return null;
}

/** Two outputs of one chip wired straight together: one of them. */
function tied(work: Work): PinOf | null {
  for (const chip of work.parts('cd40106')) {
    for (const a of CD40106.Y) {
      if (CD40106.Y.some((b) => b !== a && work.joined(chip, a, chip, b))) return [chip, a];
    }
  }
  return null;
}

/** The nets a net reaches through switches alone, itself among them. `open` is a switch taken to be open. */
function through(work: Work, net: string, open?: Component): Set<string> {
  const nets = new Set([net]);
  for (let grew = true; grew;) {
    grew = false;
    for (const part of work.parts('switch')) {
      if (part.id === open?.id) continue;
      const a = work.net(part, 0), b = work.net(part, 1);
      if (nets.has(a) !== nets.has(b)) {
        nets.add(a).add(b);
        grew = true;
      }
    }
  }
  return nets;
}

/** A voice in the mix: its resistor, and which of the resistor's legs is on the shared point. */
interface Mixed {
  voice: Output;
  resistor: Component;
  leg: number;
}

/**
 * The mix: the voices that reach an Audio Out each through a resistor of
 * its own (and any switches). A voice that goes straight there is not mixed.
 * `open` is a switch taken to be open.
 */
function mixed(work: Work, open?: Component): Mixed[] {
  const point = new Set(work.parts('audio-output').flatMap((out) => [...through(work, work.net(out, 0), open)]));
  const found: Mixed[] = [];
  for (const voice of voices(work)) {
    const from = through(work, work.net(voice.chip, voice.pin), open);
    if ([...from].some((net) => point.has(net))) continue;
    for (const r of work.parts('resistor')) {
      const a = work.net(r, 0), b = work.net(r, 1);
      const leg = from.has(a) && point.has(b) ? 1 : from.has(b) && point.has(a) ? 0 : -1;
      if (leg < 0) continue;
      found.push({ voice, resistor: r, leg });
      break;
    }
  }
  return found;
}

/** The chord as it is kept: three voices or more in the mix, none of them switched on and off, and nothing slow running. */
const chordAlone = (work: Work) =>
  mixed(work).length >= 3 && voices(work).every((voice) => voice.bursts === null) && slows(work).length === 0;

/** A switch that takes one voice out of the mix, and that voice the fifth above another. */
function fifthKey(work: Work): Component | undefined {
  const all = mixed(work);
  return work.parts('switch').find((key) => {
    const left = mixed(work, key);
    const gone = all.filter((m) => !left.some((l) => l.voice === m.voice));
    return gone.length === 1 && left.some((l) => isFifth(gone[0].voice.hertz / l.voice.hertz));
  });
}

/** The two switched voices nearest a fifth apart, the lower first; or the only one. */
function switchedPair(work: Work): Gated[] {
  const all = gated(work).sort((a, b) => a.voice.hertz - b.voice.hertz);
  let best: Gated[] = all.slice(0, 1);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const off = Math.abs(all[j].voice.hertz / all[i].voice.hertz - 1.5);
      if (best.length < 2 || off < Math.abs(best[1].voice.hertz / best[0].voice.hertz - 1.5)) best = [all[i], all[j]];
    }
  }
  return best;
}

/** "1.9 times": how often something happens in a second, to one place. */
const times = (perSecond: number) => perSecond.toFixed(1);

// --- The circuits ---

/** Class 4's oscillator, as that class kept it: the Simple Oscillator example. */
function oscillator() {
  const { components, connections } = simplestOscillatorKept();
  const one = (type: string) => components.find((c) => c.type === type)!;
  return { components, connections, chip: one('cd40106'), sound: one('switch'), output: one('audio-output') };
}

/** Where the mixing resistors go: a row for each voice, to the right of the chip. */
const MIX_X = 720;
const MIX_Y = [210, 270, 330];

/**
 * The chord: voices on inverters 1, 2 and 3, each through 10 kΩ to one
 * point, and that point through SOUND to the Audio Out. `voices` is how many
 * are built so far; `fifth` puts the switch named FIFTH in line with the
 * third voice's mixing resistor.
 */
function chord(options: { voices?: number; fifth?: boolean } = {}) {
  const { voices: count = 3, fifth = false } = options;
  const { components: base, connections: baseWires, chip, sound, output } = oscillator();
  // SOUND and the Audio Out move over to make room for the mixing resistors
  sound.position = { x: 840, y: 210 };
  output.position = { x: 920, y: 250 };
  const straight = baseWires.find((c) => c.from.componentId === chip.id && c.to.componentId === sound.id)!;
  const components: Component[] = [...base];
  const connections: Connection[] = baseWires.filter((c) => c !== straight);

  const mix = (voice: number) => {
    const r = resistor(10000, MIX_X, MIX_Y[voice]);
    components.push(r);
    connections.push(connect(r, 1, sound, 0));
    return r;
  };
  connections.push(connect(chip, CD40106.Y[0], mix(0), 0));

  if (count >= 2) {
    // The octave below: twice the resistance, 56 kΩ + 2.7 kΩ
    const long = resistor(56000, 360, 480);
    const short = resistor(2700, 540, 480);
    const tank = capacitor(100e-9, 160, 340, 90);
    const tankGround = ground(160, 440);
    components.push(long, short, tank, tankGround);
    connections.push(
      connect(long, 0, chip, CD40106.A[1]),
      connect(long, 1, short, 0),
      connect(short, 1, chip, CD40106.Y[1]),
      connect(tank, 0, chip, CD40106.A[1]),
      connect(tank, 1, tankGround, 0),
      connect(chip, CD40106.Y[1], mix(1), 0),
    );
  }
  if (count >= 3) {
    // The fifth above that: two thirds of the resistance, 39 kΩ
    const back = resistor(39000, 450, 560);
    const tank = capacitor(100e-9, 60, 340, 90);
    const tankGround = ground(60, 440);
    components.push(back, tank, tankGround);
    connections.push(
      connect(back, 0, chip, CD40106.A[2]),
      connect(back, 1, chip, CD40106.Y[2]),
      connect(tank, 0, chip, CD40106.A[2]),
      connect(tank, 1, tankGround, 0),
    );
    const mixer = mix(2);
    if (fifth) {
      const key = namedSwitch('FIFTH', 620, 330, true);
      components.push(key);
      connections.push(connect(chip, CD40106.Y[2], key, 0), connect(key, 1, mixer, 0));
    } else {
      connections.push(connect(chip, CD40106.Y[2], mixer, 0));
    }
  }
  return { components, connections, chip };
}

/** The chord, with a slow oscillator on inverter 4 and, unless told not to, a diode from the first voice's input to the slow output. */
function chopped(options: { diode?: boolean } = {}): Built {
  const { diode = true } = options;
  const { components, connections, chip } = chord();
  const back = resistor(1e6, 450, 640);
  const tank = capacitor(1e-6, 260, 600, 90);
  const tankGround = ground(260, 700);
  components.push(back, tank, tankGround);
  connections.push(
    connect(back, 0, chip, CD40106.A[3]),
    connect(back, 1, chip, CD40106.Y[3]),
    connect(tank, 0, chip, CD40106.A[3]),
    connect(tank, 1, tankGround, 0),
  );
  if (diode) {
    const gate = place('1n914', 360, 160);
    components.push(gate);
    connections.push(connect(gate, DIODE.A, chip, CD40106.A[0]), connect(gate, DIODE.K, chip, CD40106.Y[3]));
  }
  return { components, connections };
}

const built = ({ components, connections }: Built): Built => ({ components, connections });

/** What the class keeps: the chord by itself, with the switch named FIFTH on the voice that plays the fifth. Class 12 starts from it. */
export function moreVoicesKept(): Built {
  return built(chord({ fifth: true }));
}

/** Name it, look at the cover, save it: the name goes on the switch that takes the fifth out, and on no other. */
const KEPT: Step[] = keepSteps({
  type: 'switch', name: 'FIFTH', what: 'the new switch', has: 'cd40106',
  why: 'The cover now has two switches: SOUND for the whole chord and FIFTH for its middle note.',
}).map((step) => (step.id !== 'name' ? step : {
  ...step,
  done: (work: Work) => {
    const key = fifthKey(work);
    return key !== undefined && isNamed(key, 'FIFTH');
  },
}));

/** Class 6: several oscillators on one chip, mixed through resistors, and one of them switched on and off by another through a diode. */
export const moreVoices: ClassDefinition = {
  id: 'more-voices',
  number: 6,
  unit: 'Sound',
  title: 'More voices',
  promise: 'A three-note chord from one chip, then a slow oscillator that switches one of the notes on and off.',
  startsFrom: 'Class 4\'s oscillator: the Simple Oscillator example.',
  start: () => built(oscillator()),

  build: [
    playStep('This is the oscillator of class 4: one inverter of the chip, 27 kΩ and 2.2 kΩ in a line, and 100 nF. It plays 441 Hz. The other five inverters are doing nothing.'),
    {
      id: 'second',
      text: 'Build a second oscillator on the next inverter. Wire a 56 kΩ and a 2.7 kΩ resistor in a line from 2Y back to 2A, and a 100 nF capacitor from 2A to ground.',
      how: 'It is the first oscillator over again, one row down, with about twice the resistance. The chip has its power already. You cannot hear the new one yet: nothing joins its output to the Audio Out.',
      done: (work) => voices(work).length >= 2,
    },
    {
      id: 'mixer',
      text: 'Move the SOUND switch and the Audio Out to the right, to make room. Then drop a 10 kΩ resistor onto the wire from 1Y to SOUND.',
      how: 'Drag the resistor onto that wire and let go when the wire lights up. It goes into the wire. Nothing changes in the sound yet.',
      done: (work) => mixed(work).length >= 1,
    },
    {
      id: 'mix',
      text: 'Wire a second 10 kΩ resistor from 2Y to the far end of the first one: the end that goes to SOUND.',
      how: 'Both outputs now reach the Audio Out, each through a resistor of its own. You hear two notes that sound almost like one. Click the wire on 1Y, then the wire on 2Y: 435 Hz and 217 Hz.',
      done: (work) => mixed(work).length >= 2,
    },
    {
      id: 'third',
      text: 'A third oscillator, on inverter 3: one 39 kΩ resistor from 3Y back to 3A, and a 100 nF capacitor from 3A to ground.',
      how: 'Each oscillator is a voice. This one will sit between the other two.',
      done: (work) => voices(work).length >= 3,
    },
    {
      id: 'chord',
      text: 'Give it a 10 kΩ resistor too, from 3Y to the point where the other two 10 kΩ resistors meet.',
      how: 'Three notes at once are a chord. Each voice has its own 10 kΩ, and all three resistors end on the same point.',
      done: (work) => mixed(work).length >= 3,
    },
    {
      id: 'look',
      text: 'Right-click the wire from that point to SOUND to probe it. The scope shows steps: 0, 3, 6 and 9 V.',
      how: 'Each output is at 0 V or at 9 V. The point where they meet sits at the average of the three, so it moves in steps of 3 V.',
      done: (work) => work.situation.playing
        && (mixed(work).filter((m) => work.probed(m.resistor, m.leg)).length >= 3
          || (mixed(work).length >= 3 && work.parts('audio-output').some((out) => work.probed(out, 0)))),
    },
    {
      id: 'slow',
      text: 'Now a slow oscillator, on inverter 4: a 1 MΩ resistor from 4Y back to 4A, and a 1 µF capacitor from 4A to ground.',
      how: 'The same circuit a fourth time, with far bigger values. Its output goes nowhere yet, so the chord does not change.',
      done: (work) => slows(work).length >= 1,
    },
    {
      id: 'rate',
      text: 'Click the wire on 4Y. The meter reads 1.3 Hz: far too slow to hear.',
      how: 'It goes from 0 V to 9 V and back a little more than once a second.',
      done: (work) => work.situation.playing && slows(work).some((slow) => work.metered(slow.chip, slow.pin)),
    },
    {
      id: 'gate',
      text: 'Add a 1N914 diode. Wire its A leg to 1A, the input of the first voice, and its K leg to 4Y, the slow output.',
      how: 'Search for "diode". It has two legs, A and K, like an LED. Hold the pointer over a pin to see which it is. The top note of the chord now comes and goes.',
      done: (work) => gated(work).length >= 1,
    },
    {
      id: 'bursts',
      text: 'Probe the wire on 1Y as well, and set the scope\'s Time/div to 200 ms. The first voice comes in bursts.',
      how: 'Each burst is a block of 433 Hz, too fine to see the cycles of. Between bursts the output stays high.',
      done: (work) => work.situation.playing && gated(work).some((g) => work.probed(g.voice.chip, g.voice.pin)),
    },
  ],

  why: [
    {
      title: 'Voices',
      text: 'The chip has six inverters, and each can be an oscillator with its own resistor and capacitor. They share the chip\'s power and nothing else. Each oscillator is a voice. With the same 100 nF everywhere, the resistance sets the pitch: 58.7 kΩ is about twice the first voice\'s 29.2 kΩ, so the second voice runs at half the frequency.',
    },
    {
      title: 'Intervals',
      text: 'The distance between two notes is an interval, and what counts is the ratio of their frequencies. Two notes sound related when the ratio is simple. Twice the frequency is an octave. One and a half times is a fifth. Your chord is 216 Hz, 325 Hz and 433 Hz: a note, the fifth above it (1.50 times) and the octave above it (2.00 times).',
    },
    {
      title: 'Mixing',
      text: 'Each output pushes the shared point towards its own voltage through its resistor, and the point settles at the average. Adding signals into one like this is mixing. Equal resistors give each voice an equal share. The resistors also keep the outputs apart: outputs are never wired straight together, as Try will show.',
    },
    {
      title: 'A load',
      text: 'Each output now has the other voices as a load, through the resistors. Alone, the first voice ran at 441 Hz. With a second voice in the mix it ran at 435 Hz, and in the chord it runs at 433 Hz. Voices mixed this way lean on each other a little. Class 12 builds a mixer that stops that.',
    },
    {
      title: 'The diode',
      text: 'A diode passes current one way only: in at A and out at K. An LED is a diode that lights. While the slow output is low, the diode drains the first voice\'s capacitor into the slow output and holds the voice\'s input at 0.6 V. The input can never climb to 5.3 V, so the voice stops, its output high. While the slow output is high, the diode points the wrong way and passes nothing, and the voice runs as if the diode were not there.',
    },
    {
      title: 'An LFO and a gate',
      text: 'The result is 1.3 bursts a second of 433 Hz. A slow oscillator used to control something, and not to be heard, is an LFO: a low-frequency oscillator. Switching a sound on and off is gating it. The Weird Sound Generator among the examples gates one of its oscillators with another through a diode in just this way.',
    },
  ],

  tries: [
    {
      id: 'together',
      title: 'Two outputs straight together',
      question: 'Wire one output straight to another with no resistor between them: 2Y to 3Y. Those two voices will…',
      options: ['Play louder', 'Both stop', 'Carry on as before'],
      answer: 1,
      change: 'Drag a wire from 2Y to 3Y. Then click it to read it.',
      made: (work) => tied(work) !== null,
      result: (work) => {
        const [chip, pin] = tied(work)!;
        const point = reading(listen(work), chip, pin);
        const stopped = !outputs(work).some((output) => work.joined(output.chip, output.pin, chip, pin));
        return `${stopped ? 'Both stop. The' : 'The'} joined outputs sit at ${formatVolts(point.mean)}. While the two agree nothing is wrong. The moment one is high and the other low, each pulls against the other and they meet half way, between the two thresholds. Neither capacitor can reach a threshold from there, so neither voice ever flips again. The app lets this pass without a mark. On a real board a current runs through the chip for as long as two joined outputs disagree, and the chip gets hot. Outputs are only ever joined through resistors or diodes. Take the wire off again.`;
      },
    },
    {
      id: 'beat',
      title: 'Two voices almost alike',
      question: 'Bring the middle voice down until it is almost at the pitch of the lowest: change its 39 kΩ to 58 kΩ. You will hear…',
      options: ['One steady note', 'A slow throb', 'Two clearly separate notes'],
      answer: 1,
      change: 'Click the 39 kΩ resistor and type 58k into Resistance.',
      made: (work) => beating(work) !== null,
      result: (work) => {
        const [lower, upper] = beating(work)!;
        return `${formatHertz(lower.hertz)} and ${formatHertz(upper.hertz)}: a throb ${times(upper.hertz - lower.hertz)} times a second. The two voices drift in and out of step. In step they add up, out of step they cancel. This is beating, and it comes as often as the two frequencies differ: the closer the pitches, the slower the beat. Try 59 kΩ: about one beat a second. Type 58.7k and it all but stops, because in the app a part is exactly the value it says. Real parts are a few percent out, so on a real board two "equal" voices always beat. Put 39 kΩ back.`;
      },
    },
    {
      id: 'round',
      title: 'Turn the diode round',
      question: 'Turn the diode round: its K leg on the voice\'s input, its A leg on the slow output. The voice will…',
      options: ['Sound all the time', 'Sound only while the slow output is low', 'Never sound'],
      answer: 1,
      change: 'Take both wires off the diode. Wire its K leg to 1A and its A leg to 4Y.',
      made: (work) => gated(work).some((g) => !g.whileHigh),
      result: (work) => {
        const turned = gated(work).find((g) => !g.whileHigh)!;
        return `It still comes ${times(turned.voice.bursts!)} times a second, but now it sounds while the slow output is low. Current can only pass from the slow output into the capacitor. While the slow output is high it fills the capacitor to 8.4 V and holds it there, above both thresholds, so the voice stops with its output low. While the slow output is low the diode passes nothing. Which way a diode points decides which way the control works. Turn it back: A to 1A, K to 4Y.`;
      },
    },
    {
      id: 'resistor',
      title: 'A resistor where the diode was',
      question: 'Take the diode out and put a 47 kΩ resistor in its place. A resistor passes current both ways. The voice will…',
      options: ['Switch on and off as before', 'Never stop, and change pitch with the slow output', 'Stop for good'],
      answer: 1,
      change: 'Delete the diode. Wire a 47 kΩ resistor from 1A to 4Y.',
      made: (work) => bent(work) !== null,
      result: (work) => {
        const { low, high } = bent(work)!;
        return `No silence now. The voice plays ${formatHertz(low)} while the slow output is low and ${formatHertz(high)} while it is high. Through a resistor the slow output pulls on the capacitor all the time, up or down, but never hard enough to hold it still. Each way it helps one half of the voice's cycle and holds back the other, so both pitches are lower than before. The diode switched the voice. The resistor bends its pitch. Delete the resistor and put the diode back: A to 1A, K to 4Y.`;
      },
    },
    {
      id: 'pulse',
      title: 'A lopsided wave',
      question: 'Give the lowest voice\'s capacitor a quicker way to fill than to empty: a diode and a 10 kΩ resistor in a line from 2Y to 2A, the diode\'s A leg towards 2Y. The output will be high for…',
      options: ['Half of each cycle, as before', 'A small part of each cycle', 'Most of each cycle'],
      answer: 1,
      change: 'Add a second 1N914 and a 10 kΩ resistor. Wire 2Y to the diode\'s A leg, its K leg to the resistor, and the resistor to 2A. Probe 2Y.',
      made: (work) => lopsided(work) !== undefined,
      result: (work) => {
        const voice = lopsided(work)!;
        return `High for ${Math.round(voice.high * 100)}% of each cycle, at ${formatHertz(voice.hertz)}. While the output is high the diode lets the capacitor fill through the 10 kΩ, the quick way. While it is low the diode passes nothing, and the capacitor empties the slow way through the two resistors it always had. The high part is short, so the whole cycle is shorter and the pitch is up from 216 Hz. A wave that is high for only a small part of each cycle is a pulse. It sounds thinner than a square wave. With the diode the other way round the output is high for 85% of each cycle. Take the diode and the 10 kΩ out again.`;
      },
    },
  ],

  check: {
    goal: 'Two voices a fifth apart, both switched on and off together about twice a second by a slow oscillator. A fifth is 1.5 times the frequency: anywhere from 1.45 to 1.55 will do, and from 1.7 to 2.3 times a second.',
    reading: (work) => {
      if (voices(work).length === 0) return null;
      const pair = switchedPair(work);
      if (pair.length === 0) return 'No voice is switched on and off';
      const [lower, upper] = pair;
      if (!upper) return `Only one voice is switched on and off: ${formatHertz(lower.voice.hertz)}, ${times(lower.voice.bursts!)} times a second`;
      const together = lower.slow === upper.slow && lower.whileHigh === upper.whileHigh;
      return `Switched on and off: ${formatHertz(lower.voice.hertz)} and ${formatHertz(upper.voice.hertz)}, a ratio of ${(upper.voice.hertz / lower.voice.hertz).toFixed(2)}, ${times(lower.voice.bursts!)} times a second${together ? '' : ', but not together'}`;
    },
    passed: (work) => {
      const [lower, upper] = switchedPair(work);
      return lower !== undefined && upper !== undefined
        && isFifth(upper.voice.hertz / lower.voice.hertz)
        && lower.slow === upper.slow && lower.whileHigh === upper.whileHigh
        && [lower, upper].every((g) => g.voice.bursts! >= 1.7 && g.voice.bursts! <= 2.3);
    },
    hint: 'Calculated, not measured: the two voices a fifth apart are the lowest and the middle one, on inverters 2 and 3. Each needs a diode of its own, A leg on its input (2A, 3A) and K leg on the slow output, 4Y. An oscillator like this runs at about 1.3 ÷ (R × C). For 2 Hz with the 1 µF, R = 1.3 ÷ (2 × 0.000001) = 650 kΩ. The nearest on the shelf is 680 kΩ.',
  },

  keep: [
    {
      id: 'key',
      text: 'Drop a switch onto the wire from 3Y to its 10 kΩ resistor.',
      how: 'Move the resistor away from the chip first if the wire is short. Open, the switch takes the fifth out of the chord. The two voices left are an octave apart, and each is louder: two share the point now, not three.',
      done: (work) => fifthKey(work) !== undefined,
    },
    ...KEPT.slice(0, 1),
    {
      id: 'tidy',
      text: 'Take the diodes away, and the slow oscillator with them: its resistor and its capacitor.',
      how: 'Click each one and press Delete. What is left is the chord, all three voices playing without a break.',
      done: (work) => fifthKey(work) !== undefined && chordAlone(work) && work.parts('1n914').length === 0,
    },
    ...KEPT.slice(1),
  ],

  words: [
    { word: 'Voice', meaning: 'One oscillator among several that sound together.' },
    { word: 'Chord', meaning: 'Several notes at once.' },
    { word: 'Mix', meaning: 'To add several signals into one. Here, through a resistor each to a shared point.' },
    { word: 'Interval', meaning: 'The distance between two notes: the ratio of their frequencies.' },
    { word: 'Fifth', meaning: 'The interval of one and a half times the frequency, 3 to 2.' },
    { word: 'Beating', meaning: 'The throb of two pitches that are almost the same. It comes as often as their frequencies differ.' },
    { word: 'Diode', meaning: 'A part that passes current one way only, from its A leg to its K leg. The 1N914 is a small one.' },
    { word: 'LFO', meaning: 'Low-frequency oscillator: one too slow to hear, used to control something.' },
    { word: 'Gate', meaning: 'To switch a sound on and off. Also the part that does it: here, the diode.' },
    { word: 'Pulse', meaning: 'A wave that is high for only a small part of each cycle.' },
  ],

  circuit: () => chopped(),
  stages: [
    { upTo: 'mix', circuit: () => built(chord({ voices: 2 })) },
    { upTo: 'look', circuit: () => built(chord()) },
    { upTo: 'rate', circuit: () => chopped({ diode: false }) },
  ],
};
