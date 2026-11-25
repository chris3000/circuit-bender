import { formatValue } from '@/utils/parameterParser';
import { formatVolts } from '@/utils/readings';
import { harmonics, measureSignal, type SignalReading } from '@/simulation/measure/signal';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Component } from '@/types/circuit';
import type { Built, ClassDefinition } from './types';
import { GROUND, type PinOf, type Work } from './Work';
import {
  capacitor, CD40106, connect, ground, isNamed, keepSteps, linked, LM386, LM741, namedSwitch, near, place, plus, POWER, rails,
  resistor, spans, swing, switches,
} from './kit';
import { moreVoicesKept } from './moreVoices';

// --- What this class asks of the learner's circuit ---

type Change = { componentId: string; parameter: string; value: number };

/**
 * How long the circuit is listened to, and from when it is read. The chord
 * starts with its coupling capacitors charged to the wrong voltage, and the
 * first quarter of a second is them finding the right one.
 */
const SECONDS = 0.5;
const RATE = 16000;
const SETTLED = 0.3;

/** Every switch where it is, said outright: when they are all closed it is the same run as `switches(work, 1)`. */
const asItStands = (work: Work): Change[] =>
  work.parts('switch').map((key) => ({ componentId: key.id, parameter: 'closed', value: Number(key.parameters.closed) >= 1 ? 1 : 0 }));

/**
 * The one run everything in this class is read from: every amplifier's
 * input and output, every speaker and every output of the oscillator chip,
 * with every switch closed unless told otherwise.
 */
function listen(work: Work, set: Change[] = switches(work, 1)): BenchRun {
  const watch: PinOf[] = [
    ...work.parts('lm741').flatMap((amp): PinOf[] => [[amp, LM741.IN_PLUS], [amp, LM741.OUT]]),
    ...work.parts('lm386').flatMap((amp): PinOf[] => [[amp, LM386.IN_PLUS], [amp, LM386.OUT]]),
    ...work.parts('speaker').flatMap((speaker): PinOf[] => [[speaker, 0], [speaker, 1]]),
    ...work.parts('cd40106').flatMap((chip) => CD40106.Y.map((pin): PinOf => [chip, pin])),
  ];
  return work.bench({ watch, set, seconds: SECONDS, sampleRate: RATE });
}

/** A watched pin's voltage, sample by sample, once the circuit has settled. */
function settled(run: BenchRun, part: Component, pin: number): Float32Array {
  const trace = run.trace(part.id, part.pins[pin]?.id ?? '');
  return trace ? trace.subarray(Math.round(SETTLED * run.sampleRate)) : new Float32Array(0);
}

/** A watched pin's reading, once the circuit has settled. */
const read = (run: BenchRun, part: Component, pin: number): SignalReading => measureSignal(settled(run, part, pin), run.sampleRate);

const ohms = (part: Component) => Number(part.parameters.resistance);

/** The supply's voltage: what a level of 1 would be. */
const supplyVolts = (work: Work) => Number(work.parts('power')[0]?.parameters.voltage) || 9;

/** An op-amp with its two power pins connected. */
function opamp(work: Work): Component | undefined {
  const supply = plus(work);
  return work.parts('lm741').find((amp) => supply !== null && work.net(amp, LM741.V_PLUS) === supply && work.grounded(amp, LM741.V_MINUS));
}

/** Whether the op-amp's + input is held at half the supply by a resistor from + and a resistor to ground. */
function halved(work: Work, amp: Component): boolean {
  const supply = plus(work);
  const point = work.net(amp, LM741.IN_PLUS);
  const resistors = work.parts('resistor');
  if (supply === null || !resistors.some((r) => spans(work, r, supply, point)) || !resistors.some((r) => spans(work, r, point, GROUND))) return false;
  const share = read(listen(work), amp, LM741.IN_PLUS).mean / supplyVolts(work);
  return share > 0.47 && share < 0.53;
}

/** The resistors that go straight from the op-amp's output back to its − input. */
const feedback = (work: Work, amp: Component) =>
  work.parts('resistor').filter((r) => spans(work, r, work.net(amp, LM741.OUT), work.net(amp, LM741.IN_MINUS)));

/** The op-amp as the build has it: powered, its + input at half the supply, a resistor from its output back to its − input. */
function amplifier(work: Work): Component | undefined {
  const amp = opamp(work);
  if (!amp || !linked(work, work.net(amp, LM741.OUT), work.net(amp, LM741.IN_MINUS), ['resistor'])) return undefined;
  return halved(work, amp) ? amp : undefined;
}

/** The op-amp's output, with every switch closed. */
const output = (work: Work, amp: Component, set?: Change[]) => read(listen(work, set), amp, LM741.OUT);

/** Whether something is coming through the amplifier. */
function amplifies(work: Work): boolean {
  const amp = amplifier(work);
  return amp !== undefined && swing(output(work, amp)) > 0.5;
}

/** The nets that can be reached from one through parts of the given kinds, the supply's two ends aside. */
function reach(work: Work, from: string, types: string[]): Set<string> {
  const off = rails(work);
  const parts = types.flatMap((type) => work.parts(type));
  const nets = new Set([from]);
  for (let grew = true; grew;) {
    grew = false;
    for (const part of parts) {
      const a = work.net(part, 0), b = work.net(part, 1);
      for (const [here, there] of [[a, b], [b, a]]) {
        if (nets.has(here) && !nets.has(there) && !off.includes(there)) {
          nets.add(there);
          grew = true;
        }
      }
    }
  }
  return nets;
}

/** An output of the oscillator chip that is oscillating. */
interface Voice {
  chip: Component;
  pin: number;
  hertz: number;
}

function voices(work: Work, run: BenchRun): Voice[] {
  return work.parts('cd40106').flatMap((chip) => CD40106.Y.flatMap((pin) => {
    const signal = read(run, chip, pin);
    return signal.hertz !== null && swing(signal) > 4 ? [{ chip, pin, hertz: signal.hertz }] : [];
  }));
}

/**
 * The resistors that bring a voice to the op-amp as a mixer has them: from
 * the voice (or from behind a switch or a capacitor on it) to the − input
 * (or to a point that only a capacitor or a switch separates from it). A
 * voice that reaches the op-amp through a resistor shared with the others
 * has none: that is the chord mixed first and amplified after.
 */
function ownResistors(work: Work, amp: Component, voice: Voice): Component[] {
  const from = reach(work, work.net(voice.chip, voice.pin), ['capacitor', 'switch']);
  const to = reach(work, work.net(amp, LM741.IN_MINUS), ['capacitor', 'switch']);
  if ([...from].some((net) => to.has(net))) return [];
  return work.parts('resistor').filter((r) => {
    const a = work.net(r, 0), b = work.net(r, 1);
    return (from.has(a) && to.has(b)) || (from.has(b) && to.has(a));
  });
}

/** How large a voice is in the op-amp's output: the size of the pure tone at its frequency, in volts. */
const sizeIn = (run: BenchRun, amp: Component, voice: Voice) =>
  harmonics(settled(run, amp, LM741.OUT), run.sampleRate, voice.hertz, 1)[0];

/** A voice is in the output when it is a tenth of a volt or more of it. */
const HEARD = 0.1;

/** The voices the op-amp is mixing, with the switches as given: each through a resistor of its own, and there in the output. */
function mixed(work: Work, amp: Component, set?: Change[]): Voice[] {
  const run = listen(work, set);
  return voices(work, run).filter((voice) => ownResistors(work, amp, voice).length > 0 && sizeIn(run, amp, voice) >= HEARD);
}

/** The op-amp as a mixer: at least two voices, each through its own 100 kΩ. */
function mixer(work: Work): Component | undefined {
  const amp = amplifier(work);
  if (!amp) return undefined;
  const run = listen(work);
  const brought = voices(work, run).map((voice) => ownResistors(work, amp, voice)).filter((own) => own.length > 0);
  const each = brought.length >= 2 && brought.every((own) => own.every((r) => near(ohms(r), 100e3, 0.05)));
  return each && swing(read(run, amp, LM741.OUT)) > 1 ? amp : undefined;
}

/** An LM386 with its power pins connected and its − input on ground. */
function powerAmp(work: Work): Component | undefined {
  const supply = plus(work);
  return work.parts('lm386').find((amp) => supply !== null && work.net(amp, LM386.VS) === supply
    && work.grounded(amp, LM386.GND) && work.grounded(amp, LM386.IN_MINUS));
}

/** The speaker an LM386 drives: straight from its output, or through a capacitor. */
function drivenSpeaker(work: Work, power: Component): Component | undefined {
  const from = reach(work, work.net(power, LM386.OUT), ['capacitor']);
  return work.parts('speaker').find((speaker) => from.has(work.net(speaker, 0)) || from.has(work.net(speaker, 1)));
}

/** What a speaker is given: the steady voltage across it, and the most it is pushed either way from there. */
function across(run: BenchRun, speaker: Component): { steady: number; peak: number } {
  const a = settled(run, speaker, 0), b = settled(run, speaker, 1);
  if (a.length === 0) return { steady: 0, peak: 0 };
  let steady = 0;
  for (let i = 0; i < a.length; i++) steady += a[i] - b[i];
  steady /= a.length;
  let peak = 0;
  for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i] - b[i] - steady));
  return { steady, peak };
}

/**
 * The level of the speaker an LM386 drives, read at the speaker itself: how
 * far it is pushed either way, as a part of the supply. It is what the app
 * plays when the speaker is the only thing heard, and an Audio Out left on
 * the canvas does not add to it. 0 without such a speaker.
 */
function speakerLevel(work: Work, set?: Change[]): number {
  const power = powerAmp(work);
  const speaker = power && drivenSpeaker(work, power);
  return speaker ? across(listen(work, set), speaker).peak / supplyVolts(work) : 0;
}

/** A speaker that sounds, driven by an LM386, with no steady voltage left across it. */
function speakerSounds(work: Work): boolean {
  const power = powerAmp(work);
  const speaker = power && drivenSpeaker(work, power);
  if (!speaker) return false;
  const { steady, peak } = across(listen(work), speaker);
  return peak / supplyVolts(work) > 0.02 && Math.abs(steady) < 0.2;
}

/** Whether a part has a wire on it. */
const wiredIn = (work: Work, part: Component) =>
  work.circuit.getConnections().some((c) => c.from.componentId === part.id || c.to.componentId === part.id);

/** The part of the time a signal spends away from both of the levels it moves between. */
function between(samples: Float32Array): number {
  const { min, max } = measureSignal(samples, RATE);
  const margin = (max - min) * 0.05;
  let count = 0;
  for (let i = 0; i < samples.length; i++) if (samples[i] > min + margin && samples[i] < max - margin) count++;
  return samples.length > 0 ? count / samples.length : 1;
}

/** The limits the op-amp's output must stay inside to pass the check, and the level the speaker must reach. */
const LOW = 1.6;
const HIGH = 7.4;
const LOUD = 0.1;

/** The check, with the switches one way. */
function judge(work: Work, amp: Component, set: Change[]) {
  const run = listen(work, set);
  const all = voices(work, run);
  const there = mixed(work, amp, set);
  const out = read(run, amp, LM741.OUT);
  const power = powerAmp(work);
  const fed = power !== undefined && linked(work, work.net(amp, LM741.OUT), work.net(power, LM386.IN_PLUS), ['resistor', 'capacitor']);
  const level = fed ? speakerLevel(work, set) : 0;
  return {
    voices: there.length, of: all.length, out, level,
    passed: there.length >= 3 && out.min >= LOW && out.max <= HIGH && level > LOUD,
  };
}

/**
 * What the check reads: the circuit with every switch closed, or, if that
 * does not pass and the circuit as it stands does, as it stands (the kept
 * circuit is loud with SOFT open).
 */
function checked(work: Work) {
  const amp = amplifier(work);
  if (!amp) return null;
  const closed = judge(work, amp, switches(work, 1));
  if (closed.passed) return closed;
  const stands = judge(work, amp, asItStands(work));
  return stands.passed ? stands : closed;
}

/**
 * A switch that makes it softer: in a line with a resistor from the LM386's
 * + input to ground, and the speaker quieter with it closed than open.
 */
function softens(work: Work): boolean {
  const power = powerAmp(work);
  if (!power || !drivenSpeaker(work, power)) return false;
  const input = work.net(power, LM386.IN_PLUS);
  const off = rails(work);
  const resistors = work.parts('resistor');
  return work.parts('switch').some((key) => {
    const a = work.net(key, 0), b = work.net(key, 1);
    const inLine = [[a, b], [b, a]].some(([end, middle]) => !off.includes(middle) && middle !== input
      && ((end === input && resistors.some((r) => spans(work, r, middle, GROUND)))
        || (end === GROUND && resistors.some((r) => spans(work, r, middle, input)))));
    if (!inLine) return false;
    const open = switches(work, 1).map((change) => (change.componentId === key.id ? { ...change, value: 0 } : change));
    const loud = speakerLevel(work, open), soft = speakerLevel(work);
    return loud > 0.02 && soft < loud * 0.8 && soft > loud * 0.2;
  });
}

// --- The circuits ---

/** Class 6's chord as that class kept it, with the parts of it this class works on picked out. */
function chord() {
  const { components, connections } = moreVoicesKept();
  const one = (type: string) => components.find((c) => c.type === type)!;
  const out = one('audio-output');
  return {
    components,
    connections,
    supply: one('power'),
    // SOUND: the three mixing resistors meet on its near side, and the Audio Out is on its far side
    sound: components.find((c) => c.type === 'switch' && isNamed(c, 'SOUND'))!,
    mixers: components.filter((c) => c.type === 'resistor' && near(c.parameters.resistance, 10e3)),
    out,
    toOut: connections.find((c) => c.from.componentId === out.id || c.to.componentId === out.id)!,
  };
}

interface Options {
  /** How far the build has got: the amplifier, the mixer, or the speaker and its amplifier as well. */
  stage: 'amplifier' | 'mixer' | 'speaker';
  /** The op-amp's feedback resistor. */
  feedback?: number;
  /** The upper of the two resistors that cut the signal down for the LM386. */
  upper?: number;
  /** The switch named SOFT, and the 1 kΩ it puts beside the lower one. */
  soft?: boolean;
}

/**
 * The chord with what this class adds to it. Nothing of the chord moves but
 * its Audio Out: everything new goes to the right of SOUND, in a row with it.
 */
function amplified(options: Options): Built {
  const { stage, feedback: fed = 22e3, upper = 100e3, soft = false } = options;
  const { supply, sound, mixers, out, toOut, components: chordParts, connections: chordWires } = chord();
  const components = chordParts.filter((c) => c !== out);
  const connections = chordWires.filter((c) => c !== toOut);

  // The op-amp, half the supply on its + input, and a resistor from its output back to its − input
  const amp = place('lm741', 1220, 221);
  const ampGround = ground(1160, 330);
  const top = resistor(100e3, 1060, 330, 90);
  const bottom = resistor(100e3, 1060, 450, 90);
  const halfGround = ground(1060, 550);
  const back = resistor(fed, 1220, 110);
  const couple = capacitor(1e-6, 960, 210);
  components.push(amp, ampGround, top, bottom, halfGround, back, couple);
  connections.push(
    connect(supply, POWER.PLUS, amp, LM741.V_PLUS),
    connect(amp, LM741.V_MINUS, ampGround, 0),
    connect(supply, POWER.PLUS, top, 0),
    connect(top, 1, bottom, 0),
    connect(bottom, 1, halfGround, 0),
    connect(top, 1, amp, LM741.IN_PLUS),
    connect(amp, LM741.OUT, back, 1),
    connect(back, 0, amp, LM741.IN_MINUS),
    connect(sound, 1, couple, 0),
  );
  if (stage === 'amplifier') {
    // The chord as class 6 mixed it, in through one resistor
    const input = resistor(100e3, 1080, 210);
    components.push(input);
    connections.push(connect(couple, 1, input, 0), connect(input, 1, amp, LM741.IN_MINUS));
  } else {
    // Each voice through its own 100 kΩ, and the capacitor straight to the − input
    for (const mixer of mixers) mixer.parameters = { ...mixer.parameters, resistance: 100e3, value: formatValue(100e3, 'resistance') };
    connections.push(connect(couple, 1, amp, LM741.IN_MINUS));
  }
  if (stage !== 'speaker') {
    // The Audio Out, moved from SOUND to the op-amp
    out.position = { x: 1340, y: 270 };
    components.push(out);
    connections.push(connect(amp, LM741.OUT, out, 0));
    return { components, connections };
  }

  // The speaker's amplifier: the op-amp's output cut down, an LM386, and a speaker through 220 µF
  const pass = capacitor(1e-6, 1340, 230);
  const cut = resistor(upper, 1440, 230);
  const shunt = resistor(1e3, 1520, 330, 90);
  const shuntGround = ground(1520, 430);
  const power = place('lm386', 1660, 221);
  const powerGround = ground(1620, 350);
  const big = capacitor(220e-6, 1780, 230);
  const speaker = place('speaker', 1900, 240);
  const speakerGround = ground(1860, 350);
  components.push(pass, cut, shunt, shuntGround, power, powerGround, big, speaker, speakerGround);
  connections.push(
    connect(amp, LM741.OUT, pass, 0),
    connect(pass, 1, cut, 0),
    connect(cut, 1, shunt, 0),
    connect(shunt, 1, shuntGround, 0),
    connect(cut, 1, power, LM386.IN_PLUS),
    connect(power, LM386.IN_MINUS, powerGround, 0),
    connect(power, LM386.GND, powerGround, 0),
    connect(supply, POWER.PLUS, power, LM386.VS),
    connect(power, LM386.OUT, big, 0),
    connect(big, 1, speaker, 0),
    connect(speaker, 1, speakerGround, 0),
  );
  if (soft) {
    // SOFT: a second 1 kΩ beside the lower resistor, on a switch
    const key = namedSwitch('SOFT', 1420, 350, false);
    key.rotation = 90;
    const second = resistor(1e3, 1420, 470, 90);
    const secondGround = ground(1420, 570);
    components.push(key, second, secondGround);
    connections.push(
      connect(cut, 1, key, 0),
      connect(key, 1, second, 0),
      connect(second, 1, secondGround, 0),
    );
  }
  return { components, connections };
}

/**
 * What the class keeps: class 6's chord through its mixer and the LM386 into
 * the speaker, with a gain and a divider that pass the check (18 kΩ, and
 * 33 kΩ over 1 kΩ), SOUND and FIFTH as they were and the switch named SOFT.
 */
export function amplifiersKept(): Built {
  return amplified({ stage: 'speaker', feedback: 18e3, upper: 33e3, soft: true });
}

/** Class 12: an op-amp as an amplifier and as a mixer, where it runs out of room, and an amplifier strong enough for a speaker. */
export const amplifiers: ClassDefinition = {
  id: 'amplifiers',
  number: 12,
  unit: 'Bigger sound',
  title: 'Amplifiers',
  promise: 'The chord through a mixer that does not distort, and out of a speaker.',
  startsFrom: 'The chord you kept in class 6: three voices, with its switches SOUND and FIFTH.',
  start: moreVoicesKept,

  build: [
    {
      id: 'opamp',
      text: 'Add an LM741 to the right of the chord. Wire its V+ pin to + and its V− pin to ground.',
      how: 'Search for "741". It is an op-amp: a chip with two inputs, marked − and +, and one output, OUT. Like every chip it does nothing until its two power pins are connected. Drop a new ground beside it for V−.',
      done: (work) => opamp(work) !== undefined,
    },
    {
      id: 'half',
      text: 'Add two 100 kΩ resistors in a line from + to ground. Wire the point between them to the op-amp\'s + input.',
      how: 'This is the divider of class 2. The two resistors are equal, so the point between them sits at half the supply: 4.5 V.',
      done: (work) => {
        const amp = opamp(work);
        return amp !== undefined && halved(work, amp);
      },
    },
    {
      id: 'feedback',
      text: 'Wire a 22 kΩ resistor from OUT back to the − input.',
      how: 'Put it above the chip, one end on OUT and the other on the pin marked −. A resistor from an output back to an input is feedback, as in class 4.',
      done: (work) => amplifier(work) !== undefined,
    },
    {
      id: 'rest',
      text: 'Press play and click the wire on OUT. The meter reads 4.5 V.',
      how: 'Nothing is coming in yet, and the output sits at the voltage of the + input. The chord still plays through its own three resistors, as before.',
      done: (work) => {
        const amp = amplifier(work);
        return work.situation.playing && amp !== undefined && work.metered(amp, LM741.OUT);
      },
    },
    {
      id: 'input',
      text: 'Give it the chord. The chord\'s three 10 kΩ meet at SOUND, and the Audio Out is on the other side of that switch. From that other side of SOUND wire a 1 µF capacitor, and from the capacitor a 100 kΩ resistor to the − input.',
      how: 'Start the wire on the pin of the switch, not on the Audio Out: the Audio Out is about to move. Three things are now on the − input: the 22 kΩ, the 100 kΩ and the op-amp itself. Leave SOUND closed. It still turns the whole chord on and off, and from now on it stands between the chord and the amplifier.',
      done: amplifies,
    },
    {
      id: 'hear',
      text: 'Move the Audio Out to the op-amp: delete the wire from SOUND to the Audio Out, then wire the Audio Out\'s pin to OUT.',
      how: 'Click the wire where it reaches the Audio Out and press Delete. Drag the Audio Out over to the right of the op-amp and wire it to OUT. Nothing else of the chord has to move. The chord is back, a good deal quieter.',
      done: (work) => {
        const amp = amplifier(work);
        const heard = amp !== undefined && work.parts('audio-output').some((out) => work.joined(out, 0, amp, LM741.OUT));
        return (heard && amplifies(work)) || speakerSounds(work);
      },
    },
    {
      id: 'look',
      text: 'Press play. Probe the wire on OUT, and the wire from SOUND to the capacitor. Compare the two on the scope.',
      how: 'Right-click a wire to probe it. Going in, the chord moves between 0.17 V and 8.82 V. From bottom to top that is 8.65 V: call it 8.65 V tall. Coming out it moves between 3.54 V and 5.44 V: the same steps, 1.9 V tall and upside down.',
      done: (work) => {
        const amp = amplifier(work);
        return work.situation.playing && amp !== undefined && amplifies(work) && work.probed(amp, LM741.OUT);
      },
    },
    {
      id: 'mix',
      text: 'Now let the op-amp do the mixing. Change each of the chord\'s three 10 kΩ to 100 kΩ. Then delete the single 100 kΩ you put after the capacitor.',
      how: 'Double-click a resistor and type 100k. When you delete the single 100 kΩ the app closes the wire behind it, so the capacitor goes straight to the − input. Each voice now comes in through a 100 kΩ of its own. OUT moves between 1.51 V and 7.45 V: just under 6 V tall, three times what it was.',
      done: (work) => mixer(work) !== undefined,
    },
    {
      id: 'power',
      text: 'Add an LM386 to the right of the op-amp. Wire its VS pin to +, and both its GND pin and its − input to ground.',
      how: 'Search for "386". It is an amplifier made to drive a speaker. VS is its supply pin. Its − input is not needed here, and goes to ground to keep it still.',
      done: (work) => powerAmp(work) !== undefined,
    },
    {
      id: 'cut',
      text: 'From the op-amp\'s OUT wire a 1 µF capacitor, then a 100 kΩ resistor to a meeting point, then a 1 kΩ resistor from the meeting point to ground. Wire the meeting point to the LM386\'s + input.',
      how: 'Take the capacitor from OUT itself, where the Audio Out is. The two resistors are a divider: 100 kΩ over 1 kΩ leaves about a hundredth. The LM386 makes what it is given 20 times as tall, so it must be given very little: 0.06 V here.',
      done: (work) => {
        const power = powerAmp(work), amp = amplifier(work);
        if (!power || !amp || !linked(work, work.net(amp, LM741.OUT), work.net(power, LM386.IN_PLUS), ['resistor', 'capacitor'])) return false;
        const input = read(listen(work), power, LM386.IN_PLUS);
        return swing(input) > 0.01 && swing(input) < 0.5 && Math.abs(input.mean) < 0.02;
      },
    },
    {
      id: 'speaker',
      text: 'From the LM386\'s OUT wire a 220 µF capacitor to the speaker\'s + pin. Wire the speaker\'s − pin to ground.',
      how: 'The speaker is on the shelf: search for "speaker". The LM386\'s output rests at 4.5 V. Without the capacitor that would push half an amp through the speaker all the time, sound or no sound. The app would let it. A real speaker would get hot.',
      done: speakerSounds,
    },
    {
      id: 'alone',
      text: 'Delete the Audio Out and press play. Now the speaker is all you hear.',
      how: 'The app plays every Audio Out and every speaker on the canvas, added together. With the Audio Out gone, what you hear is what the speaker is given.',
      done: (work) => work.situation.playing && speakerSounds(work) && !work.parts('audio-output').some((out) => wiredIn(work, out)),
    },
  ],

  why: [
    {
      title: 'One rule',
      text: 'An op-amp has two inputs and one output. Give it a resistor from its output back to its − input, and it moves its output to whatever keeps its two inputs at the same voltage. Everything in this class follows from that one sentence.',
    },
    {
      title: 'Half the supply',
      text: 'The sound is a voltage that goes up and down. Call it the signal. With one 9 V supply the op-amp\'s output can only be somewhere between ground and +, so a signal needs a resting place in the middle, with room both ways. The two 100 kΩ hold the + input at 4.5 V, half the supply. The rule keeps the − input at 4.5 V too, and with nothing coming in OUT rests there as well: the 4.5 V you read.',
    },
    {
      title: 'Gain',
      text: 'A circuit that gives out a copy of a signal, larger or smaller, is an amplifier. The − input does not move. So the current that the 100 kΩ brings from the chord cannot stay there: all of it goes on through the 22 kΩ, and OUT moves as far as it takes to pull it through. By Ohm\'s law the same current through a resistor 0.22 times the size takes 0.22 times the voltage. So OUT moves 22 ÷ 100 = 0.22 times as far as what comes in, and the other way: when the chord goes up, OUT goes down. Feedback resistor ÷ input resistor is the gain. You saw 8.65 V go in and 1.9 V come out.',
    },
    {
      title: 'A mixer',
      text: 'Now each voice has its own 100 kΩ, and the point where they meet hardly moves: the op-amp holds it. Each voice sends its current as if the others were not there, and all three currents go through the 22 kΩ. OUT is the three voices added: each 9 V × 0.22, just under 6 V in all. In class 6 the meeting point was free to move, and took the average of the voices. Here it is held, so no voice can disturb another.',
    },
    {
      title: 'Coupling capacitors',
      text: 'A capacitor passes changes and blocks what is steady (class 3). The op-amp\'s output rests at 4.5 V. The LM386\'s input must rest at 0 V, and a speaker wants no steady current at all. A capacitor in line between two parts of a circuit lets the signal through and lets each side keep its own resting voltage. Used like that it is a coupling capacitor. There are three here: 1 µF into the op-amp, 1 µF out of it, and 220 µF to the speaker. The last is large because the speaker is only 8 Ω.',
    },
    {
      title: 'The LM386',
      text: 'An amplifier with its resistors inside: a gain of 20, fixed, and the strength to drive a speaker, which the LM741 has not. Its output rests at half the supply by itself. Here 0.06 V goes in and about 1 V comes out: a little under 20 times, because the speaker pulls on it. On a real board an LM386 also wants a large capacitor from + to ground right beside it, or it howls. The app\'s supply never sags, so here it does not. You can now read two of the examples: Oscillator + Op-Amp and Octave Organ.',
    },
  ],

  tries: [
    {
      id: 'fifth',
      title: 'One voice less',
      question: 'In the chord as you kept it, opening FIFTH made the two voices that were left louder: the meeting point took the average of two instead of three. Open FIFTH now. The other two voices will…',
      options: ['Get louder', 'Stay exactly as they were', 'Get quieter'],
      answer: 1,
      change: 'Click the FIFTH switch to open it. Listen, and watch OUT on the scope.',
      made: (work) => {
        const amp = mixer(work);
        if (!amp) return false;
        const now = mixed(work, amp, asItStands(work)).length;
        return now >= 1 && now < mixed(work, amp).length;
      },
      result: (work) => {
        const amp = mixer(work)!;
        const before = swing(output(work, amp)), now = swing(output(work, amp, asItStands(work)));
        return `OUT was ${formatVolts(before)} tall and is now ${formatVolts(now)}: one voice less, and nothing else. The two voices that are left are each as large as they were, to within a hundredth. The op-amp holds the meeting point, so a voice that comes or goes is not felt by the others. Close FIFTH again.`;
      },
    },
    {
      id: 'gain',
      title: 'Less gain',
      question: 'Change the 22 kΩ feedback resistor to 10 kΩ. OUT will be…',
      options: ['About twice as tall', 'The same', 'About half as tall'],
      answer: 2,
      change: 'Double-click the 22 kΩ and type 10k. Read OUT on the scope, or click its wire.',
      made: (work) => {
        const amp = mixer(work);
        const back = amp ? feedback(work, amp) : [];
        return back.length === 1 && near(ohms(back[0]), 10e3);
      },
      result: (work) => {
        const out = output(work, mixer(work)!);
        return `${formatVolts(out.min)} to ${formatVolts(out.max)}: ${formatVolts(swing(out))} tall, where it was just under 6 V. The gain is now 10 ÷ 100 = 0.1, so each voice comes out 0.9 V tall and the three together 2.7 V. With a smaller feedback resistor, OUT has less far to move to pull the same current through. Leave it for the next one.`;
      },
    },
    {
      id: 'clip',
      title: 'Too much gain',
      question: 'Now make the feedback resistor 47 kΩ. Three voices, each 9 V × 0.47, add up to 12.7 V. OUT will be…',
      options: ['12.7 V tall', '9 V tall, the whole supply', 'About 6 V tall, with its tops and bottoms cut flat'],
      answer: 2,
      change: 'Type 47k into the feedback resistor. Listen, and look at OUT on the scope.',
      made: (work) => {
        const amp = mixer(work);
        const back = amp ? feedback(work, amp) : [];
        if (!amp || back.length !== 1 || ohms(back[0]) < 30e3) return false;
        const out = output(work, amp);
        return out.min < LOW && out.max > HIGH;
      },
      result: (work) => {
        const out = output(work, mixer(work)!);
        return `OUT stops at ${formatVolts(out.min)} and at ${formatVolts(out.max)}, and waits there until the chord comes back within reach. An LM741 cannot get closer than 1.5 V to either side of its supply, so on 9 V there is 6 V of room and no more. A signal with its tops and bottoms cut flat is clipping. You can hear it: the chord has a hard edge. Three voices need three times the room of one. Leave it for the next one.`;
      },
    },
    {
      id: 'compare',
      title: 'No feedback at all',
      question: 'Delete the feedback resistor altogether. OUT will…',
      options: ['Rest at 4.5 V', 'Copy the chord, 9 V tall', 'Jump between its two limits, with nothing in between'],
      answer: 2,
      change: 'Click the feedback resistor and press Delete. Look at OUT on the scope.',
      made: (work) => {
        const amp = opamp(work);
        if (!amp || !halved(work, amp) || linked(work, work.net(amp, LM741.OUT), work.net(amp, LM741.IN_MINUS), ['resistor'])) return false;
        if (work.joined(amp, LM741.OUT, amp, LM741.IN_MINUS)) return false;
        const run = listen(work);
        const out = read(run, amp, LM741.OUT);
        return out.min < LOW && out.max > HIGH && between(settled(run, amp, LM741.OUT)) < 0.05;
      },
      result: (work) => {
        const out = output(work, opamp(work)!);
        return `OUT is at ${formatVolts(out.min)} or at ${formatVolts(out.max)}, and spends almost no time between the two. Without feedback nothing holds the two inputs together, and the op-amp does the one thing it does by itself: if the + input is the higher, OUT goes as high as it can, and if the − input is the higher, as low as it can. The smallest difference is enough. Used like this it is a comparator: it says which of two voltages is the higher. Feed some of OUT back to the + input and it is a Schmitt trigger, which is what each inverter of the CD40106 is. Now put a 22 kΩ back, from OUT to the − input.`;
      },
    },
    {
      id: 'loud',
      title: 'Too much for the LM386',
      question: 'The LM386 has limits too. Change the divider\'s 100 kΩ to 10 kΩ, so that the LM386 is given ten times as much. The speaker will be…',
      options: ['Ten times as loud', 'Louder, but not ten times, and harsher', 'Silent'],
      answer: 1,
      change: 'Double-click the 100 kΩ between the op-amp and the LM386 and type 10k.',
      made: (work) => {
        const power = powerAmp(work);
        return power !== undefined && speakerSounds(work) && swing(read(listen(work), power, LM386.OUT)) > 5.5;
      },
      result: (work) => {
        const power = powerAmp(work)!;
        const run = listen(work);
        const given = swing(read(run, power, LM386.IN_PLUS)), out = read(run, power, LM386.OUT);
        return `The LM386 is given ${formatVolts(given)} and would have to put out ${formatVolts(given * 20)}, more than the whole supply. Its OUT stops at ${formatVolts(out.min)} and at ${formatVolts(out.max)}: with a speaker to push it has about 6.5 V of room. The speaker's level is ${speakerLevel(work).toFixed(2)}. That is louder, but nothing like ten times, and the flat tops give it a rasp. Put 100 kΩ back.`;
      },
    },
  ],

  check: {
    goal: 'Play the whole chord through the mixer and the LM386 into the speaker, clean and loud. The op-amp\'s OUT must stay between 1.6 V and 7.4 V, clear of its limits. The speaker\'s level must be above 0.1: that is the speaker pushed more than 0.9 V each way, a tenth of the supply.',
    reading: (work) => {
      if (work.parts('lm741').length === 0) return null;
      const now = checked(work);
      if (!now) return 'Your op-amp is not an amplifier yet: it needs its power, half the supply on its + input and a feedback resistor.';
      const mix = `Your mixer: ${now.voices} of ${now.of} voices, OUT ${formatVolts(now.out.min)} to ${formatVolts(now.out.max)}`;
      const speaker = now.level > 0
        ? `Your speaker: level ${now.level.toFixed(2)} (${formatVolts(now.level * supplyVolts(work))} each way)`
        : 'No speaker on an LM386 that the op-amp feeds';
      return `${mix}. ${speaker}`;
    },
    passed: (work) => checked(work)?.passed ?? false,
    hint: 'Calculated, not measured. The mixer: three voices, each 9 V × gain, must fit in the 5.8 V between 1.6 V and 7.4 V. So the gain must be under 5.8 ÷ 27 = 0.21, and the feedback resistor under 21 kΩ. The next value down is 18 kΩ. The speaker: its level follows the divider. Halve the upper resistor and the level doubles, near enough. With 18 kΩ in the mixer, 47 kΩ over 1 kΩ should be just enough, and 33 kΩ over 1 kΩ leaves room to spare.',
  },

  keep: [
    {
      id: 'soft',
      text: 'Add a switch and a second 1 kΩ resistor in a line, from the divider\'s meeting point to ground: beside the lower resistor that is there.',
      how: 'With the switch closed the two resistors are in parallel (class 2). The lower half of the divider is then smaller, and less of the signal reaches the LM386. Leave the switch open: that is the loud position.',
      done: softens,
    },
    ...keepSteps({
      type: 'switch', name: 'SOFT', what: 'the new switch', has: 'speaker',
      why: 'The cover now has three switches: SOUND for the whole chord, FIFTH for one note of it, and SOFT for how loud it is.',
    }),
  ],

  words: [
    { word: 'Signal', meaning: 'A voltage that carries something by the way it changes. Here it carries the sound.' },
    { word: 'Amplifier', meaning: 'A circuit that gives out a copy of the signal it is given, larger or smaller.' },
    { word: 'Gain', meaning: 'How many times as tall the copy is. For an op-amp with feedback: feedback resistor ÷ input resistor.' },
    { word: 'Op-amp', meaning: 'A chip with a − input, a + input and an output. With feedback to its − input it keeps its two inputs at the same voltage.' },
    { word: 'Half supply', meaning: 'A point held at half the supply\'s voltage by two equal resistors: where a signal rests when there is only one supply.' },
    { word: 'Mixer', meaning: 'An amplifier with several inputs, each through a resistor of its own. Its output is the inputs added together.' },
    { word: 'Coupling capacitor', meaning: 'A capacitor in line between two parts of a circuit. The signal passes, and each side keeps its own resting voltage.' },
    { word: 'Clipping', meaning: 'What happens to a signal that needs more room than an amplifier has: its tops and bottoms are cut flat.' },
    { word: 'Comparator', meaning: 'An op-amp with no feedback. Its output goes to one limit or the other, by which input is the higher.' },
  ],

  circuit: () => amplified({ stage: 'speaker' }),
  stages: [
    { upTo: 'look', circuit: () => amplified({ stage: 'amplifier' }) },
    { upTo: 'mix', circuit: () => amplified({ stage: 'mixer' }) },
  ],
};
