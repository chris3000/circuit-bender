import { measureBursts, risings } from '@/simulation/measure/signal';
import { formatHertz } from '@/utils/readings';
import type { Component } from '@/types/circuit';
import type { Built, ClassDefinition } from './types';
import { GROUND, type PinOf, type Work } from './Work';
import {
  all, capacitor, CD4093, connect, ground, isNamed, keepSteps, linked, namedSwitch, place, playStep, plus, rails, reading,
  resistor, spans, swing, switches,
} from './kit';

// --- What is on the canvas ---

/** A gate of a powered CD4093 wired as an oscillator: resistance from its output back to one input, a capacitor from that input to ground. */
interface Oscillator {
  chip: Component;
  /** Which of the chip's four gates, from 0. */
  gate: number;
  /** The net its output is on. */
  out: string;
  /** The net of its other input: held high it runs, held low it stops. */
  enable: string;
}

function oscillators(work: Work): Oscillator[] {
  const supply = plus(work);
  const found: Oscillator[] = [];
  for (const chip of work.parts('cd4093')) {
    if (supply === null || work.net(chip, CD4093.VDD) !== supply || !work.grounded(chip, CD4093.VSS)) continue;
    for (let gate = 0; gate < 4; gate++) {
      const out = work.net(chip, CD4093.Y[gate]);
      const inputs = [work.net(chip, CD4093.A[gate]), work.net(chip, CD4093.B[gate])];
      // Either input will do for the resistor and the capacitor: the two are alike
      const timed = inputs.findIndex((net) => linked(work, out, net, ['resistor', 'ldr'])
        && work.parts('capacitor').some((c) => spans(work, c, net, GROUND)));
      if (timed >= 0) found.push({ chip, gate, out, enable: inputs[1 - timed] });
    }
  }
  return found;
}

/** A push button with one side on an oscillator's enable: a key. `from` is the net its other side is on. */
function keys(work: Work): Array<{ button: Component; enable: string; from: string }> {
  const off = rails(work);
  const enables = oscillators(work).map((o) => o.enable).filter((net) => !off.includes(net));
  return work.parts('pushbutton').flatMap((button) => {
    const sides = [work.net(button, 0), work.net(button, 1)];
    const side = sides.findIndex((net) => enables.includes(net));
    return side < 0 ? [] : [{ button, enable: sides[side], from: sides[1 - side] }];
  });
}

/** The oscillator whose output works this one's enable: wired straight to it, or through a button or a switch. */
function enablerOf(work: Work, voice: Oscillator, among: Oscillator[]): Oscillator | undefined {
  const between = [...work.parts('pushbutton'), ...work.parts('switch')];
  return among.find((other) => other !== voice && other.out !== voice.out
    && (other.out === voice.enable || between.some((part) => spans(work, part, other.out, voice.enable))));
}

/** Three oscillators in a row, each working the next one's enable. The last of them, the slowest, or undefined. */
function thirdOscillator(work: Work): Oscillator | undefined {
  const found = oscillators(work);
  for (const voice of found) {
    const second = enablerOf(work, voice, found);
    const third = second && enablerOf(work, second, found);
    if (third && third !== voice) return third;
  }
  return undefined;
}

/** How long an oscillator too slow to hear takes to go round once, in seconds: watched for a while, or null if it does not get round in that time. */
function roundOf(work: Work, slow: Oscillator): number | null {
  const pin = CD4093.Y[slow.gate];
  const run = work.bench({ seconds: 10, sampleRate: LISTEN.sampleRate, set: worked(work, 1), watch: [[slow.chip, pin]] });
  const trace = run.trace(slow.chip.id, slow.chip.pins[pin].id);
  const output = reading(run, slow.chip, pin);
  if (!trace || swing(output) < 1) return null;
  // The first round after starting is not like the rest: from the second time it rises to the third
  const rises = risings(trace, (output.min + output.max) / 2, (output.min + output.max) / 2);
  return rises.length >= 3 ? (rises[2] - rises[1]) / run.sampleRate : rises.length === 2 ? (rises[1] - rises[0]) / run.sampleRate : null;
}

/** Whether a resistor holds a net to one end of the supply or the other. */
const pulled = (work: Work, net: string) =>
  rails(work).some((rail) => work.parts('resistor').some((r) => spans(work, r, net, rail)));

// --- Listening ---

/** Every button held (or let go) and every switch closed (or open): the controls put one way for a run. */
const worked = (work: Work, held: 0 | 1, closed: 0 | 1 = 1) => [...all(work, 'pushbutton', 'closed', held), ...switches(work, closed)];

/** A note is something that can be heard as one: slower than this it is a tick. */
const audible = (hertz: number | null): hertz is number => hertz !== null && hertz >= 20;

/** The note that sounds in a moment's listening, or null: a short run, for a circuit with nothing slow in it. */
const note = (work: Work, held: 0 | 1) => {
  const hertz = work.run(worked(work, held)).sound.hertz;
  return audible(hertz) ? hertz : null;
};

/** A beeper is listened to for this long, at this many readings a second: long enough for several beeps, fast enough to follow the note. */
const LISTEN = { seconds: 4, sampleRate: 8000 };

/** What comes out of the Audio Out over a few seconds. */
interface Heard {
  /** The pitch of the note, or null for silence. */
  hertz: number | null;
  /** Beeps a second, or null when the note does not come in beeps (or in too few to count). */
  perSecond: number | null;
  /** The part of the time it sounds, when it comes in beeps. */
  on: number | null;
}

const SILENCE: Heard = { hertz: null, perSecond: null, on: null };

/**
 * The pitch of a recorded wave that may come and go: its cycles counted over
 * the time they take, with the silences and the long first cycle of each
 * burst left out. The voltage at the jack jumps between two levels, so one
 * cycle is only known to the nearest sample; many of them say more.
 */
function pitchOf(samples: ArrayLike<number>, sampleRate: number): number | null {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] < min) min = samples[i];
    if (samples[i] > max) max = samples[i];
  }
  if (!(max - min >= 0.1)) return null;
  const middle = (min + max) / 2;
  const rises: number[] = [];
  for (let i = 1; i < samples.length; i++) if (samples[i - 1] <= middle && samples[i] > middle) rises.push(i);
  if (rises.length < 3) return null;
  const gaps = rises.slice(1).map((at, i) => at - rises[i]);
  const usual = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  let cycles = 0, time = 0;
  for (const gap of gaps) {
    if (Math.abs(gap - usual) > usual / 4 + 1) continue;
    cycles++;
    time += gap;
  }
  return cycles > 0 ? (cycles * sampleRate) / time : null;
}

/** The pins recorded while listening: every Audio Out, and every output of every CD4093. */
const watched = (work: Work): PinOf[] => [
  ...work.parts('audio-output').map((jack): PinOf => [jack, 0]),
  ...work.parts('cd4093').flatMap((chip) => CD4093.Y.map((pin): PinOf => [chip, pin])),
];

/** The circuit run for a few seconds with its controls put one way. */
const longRun = (work: Work, held: 0 | 1, closed: 0 | 1) => work.bench({ ...LISTEN, set: worked(work, held, closed), watch: watched(work) });

/**
 * What is heard over a few seconds with every button held (or let go) and
 * every switch closed (or open). It is read from the voltage at the Audio
 * Out, which is the sound before the app takes its steady part away.
 */
function listen(work: Work, held: 0 | 1 = 1, closed: 0 | 1 = 1): Heard {
  const jacks = work.parts('audio-output');
  if (jacks.length === 0) return SILENCE;
  const run = longRun(work, held, closed);
  // With more than one Audio Out, the one that swings furthest
  const jack = jacks.reduce((a, b) => (swing(reading(run, b, 0)) > swing(reading(run, a, 0)) ? b : a));
  const trace = run.trace(jack.id, jack.pins[0].id);
  const hertz = trace && pitchOf(trace, run.sampleRate);
  if (!trace || !audible(hertz)) return SILENCE;
  const bursts = measureBursts(trace, run.sampleRate);
  return { hertz, perSecond: bursts?.perSecond ?? null, on: bursts?.on ?? null };
}

/** A note that comes in beeps. */
const beeping = (sound: Heard): sound is Heard & { hertz: number; perSecond: number } => sound.hertz !== null && sound.perSecond !== null;
/** A note that does not stop. */
const steady = (sound: Heard) => sound.hertz !== null && sound.perSecond === null;

/** What two oscillators on the canvas sound like with every button held, or silence when there are not two. Looked for first because listening takes a moment. */
const pair = (work: Work, closed: 0 | 1 = 1): Heard => (oscillators(work).length >= 2 ? listen(work, 1, closed) : SILENCE);

/** A key that works: a note while its button is held, silence when it is let go. */
function keyed(work: Work): boolean {
  if (keys(work).length === 0) return false;
  if (note(work, 1) !== null && note(work, 0) === null) return true;
  // The same key on a beeper
  return beeping(pair(work)) && listen(work, 0).hertz === null;
}

/** A second oscillator too slow to hear: some output of the chip goes round a few times a second. */
function slowOscillator(work: Work): boolean {
  if (oscillators(work).length < 2) return false;
  const run = longRun(work, 1, 1);
  return work.parts('cd4093').some((chip) => CD4093.Y.some((pin) => {
    const output = reading(run, chip, pin);
    return output.hertz !== null && output.hertz < 20 && swing(output) > 1;
  }));
}

/** The beeper as it is kept: with a switch in it, beeps while the switch is closed and one steady note while it is open. */
const kept = (work: Work) => work.parts('switch').length > 0 && beeping(pair(work, 1)) && steady(pair(work, 0));

/** The Light Theremin, or a circuit like it: a button and a switch side by side from + to the enable of an oscillator that a photocell tunes. */
function drone(work: Work): { button: Component; toggle: Component } | null {
  const supply = plus(work);
  if (supply === null || work.parts('ldr').length === 0) return null;
  for (const key of keys(work)) {
    const toggle = work.parts('switch').find((part) => spans(work, part, supply, key.enable));
    if (toggle && key.from === supply) return { button: key.button, toggle };
  }
  return null;
}

/** A number of beeps a second, to three figures. */
const count = (perSecond: number) => String(Number(perSecond.toPrecision(3)));

// --- The circuits ---

/**
 * The supply, the chip, and gate 1 as an oscillator into the Audio Out. What
 * works its enable is added by each circuit. The resistor sits `below` the
 * chip: further down once gate 2's has to fit inside its loop.
 */
function voice(below = 520) {
  const supply = place('power', 100, 200);
  const supplyGround = ground(100, 300);
  const chip = place('cd4093', 480, 320);
  const chipGround = ground(560, 160);
  const feedback = resistor(100e3, 480, below);
  const timing = capacitor(10e-9, 240, 560, 90);
  const timingGround = ground(240, 640);
  const output = place('audio-output', 680, 300);
  return {
    supply, chip,
    components: [supply, supplyGround, chip, chipGround, feedback, timing, timingGround, output],
    connections: [
      connect(supply, 1, supplyGround, 0),
      connect(supply, 0, chip, CD4093.VDD),
      connect(chip, CD4093.VSS, chipGround, 0),
      // Oscillator: 1Y → 100k → 1B → 10nF → ground
      connect(chip, CD4093.Y[0], feedback, 1),
      connect(feedback, 0, chip, CD4093.B[0]),
      connect(timing, 0, chip, CD4093.B[0]),
      connect(timing, 1, timingGround, 0),
      connect(chip, CD4093.Y[0], output, 0),
    ],
  };
}

/** Gate 2 as a slow oscillator, added to the voice: 2A on +, 470k from 2Y back to 2B, 1µF from 2B to ground. */
function withSlow() {
  // Gate 2's loop goes inside gate 1's, as its pins are inside gate 1's on the chip: the wires then cross least
  const { supply, chip, components, connections } = voice(700);
  const feedback = resistor(470e3, 480, 500);
  const timing = capacitor(1e-6, 400, 560, 90);
  const timingGround = ground(400, 640);
  return {
    supply, chip,
    components: [...components, feedback, timing, timingGround],
    connections: [
      ...connections,
      connect(chip, CD4093.VDD, chip, CD4093.A[1]),
      connect(chip, CD4093.Y[1], feedback, 1),
      connect(feedback, 0, chip, CD4093.B[1]),
      connect(timing, 0, chip, CD4093.B[1]),
      connect(timing, 1, timingGround, 0),
    ],
  };
}

/** The first part of the build: the oscillator with a key. PLAY from + to 1A, 100k from 1A to ground. */
function keyedOscillator(): Built {
  const { supply, chip, components, connections } = voice();
  const play = place('pushbutton', 260, 180, { label: 'PLAY' });
  const down = resistor(100e3, 360, 340, 90);
  const downGround = ground(360, 440);
  return {
    components: [...components, play, down, downGround],
    connections: [
      ...connections,
      connect(supply, 0, play, 0),
      connect(play, 1, chip, CD4093.A[0]),
      connect(down, 0, chip, CD4093.A[0]),
      connect(down, 1, downGround, 0),
    ],
  };
}

/** The build when it is done: the beeper. PLAY now goes from 2Y to 1A, so gate 2 works gate 1's enable while it is held. */
function beeper(): Built {
  const { chip, components, connections } = withSlow();
  const play = place('pushbutton', 260, 180, { label: 'PLAY' });
  const down = resistor(100e3, 360, 340, 90);
  const downGround = ground(360, 440);
  return {
    components: [...components, play, down, downGround],
    connections: [
      ...connections,
      connect(chip, CD4093.Y[1], play, 0),
      connect(play, 1, chip, CD4093.A[0]),
      connect(down, 0, chip, CD4093.A[0]),
      connect(down, 1, downGround, 0),
    ],
  };
}

/**
 * What the class keeps: the beeper with a switch named BEEP in the wire from
 * 2Y to 1A, and the 100k from 1A to + as a pull-up. Closed, it beeps; open,
 * it is one steady note.
 */
export function gatesKept(): Built {
  const { supply, chip, components, connections } = withSlow();
  const beep = namedSwitch('BEEP', 260, 180, true);
  const up = resistor(100e3, 360, 100);
  return {
    components: [...components, beep, up],
    connections: [
      ...connections,
      connect(chip, CD4093.Y[1], beep, 0),
      connect(beep, 1, chip, CD4093.A[0]),
      connect(supply, 0, up, 0),
      connect(up, 1, chip, CD4093.A[0]),
    ],
  };
}

/** Class 7: a gate is an oscillator with a say in the matter, and one oscillator can have the say over another. */
export const gates: ClassDefinition = {
  id: 'gates',
  number: 7,
  unit: 'Logic and rhythm',
  title: 'Gates',
  promise: 'An oscillator with a key, then one that beeps by itself.',
  startsFrom: 'An empty canvas.',

  build: [
    {
      id: 'supply',
      text: 'Put down a power supply and a ground, and wire the supply\'s − pin to the ground.',
      how: 'As every circuit in the course starts.',
      done: (work) => work.parts('power').some((supply) => work.grounded(supply, 1)),
    },
    {
      id: 'chip',
      text: 'Add a CD4093. Wire its VDD pin to + and its VSS pin to ground.',
      how: 'Search for 4093. VDD and VSS are at the top of the chip. Inside are four of the same thing, called gates, numbered 1 to 4. Each has two inputs, A and B, and one output, Y: 1A, 1B and 1Y belong to the first.',
      done: (work) => work.parts('cd4093').some((chip) => work.net(chip, CD4093.VDD) === plus(work) && work.grounded(chip, CD4093.VSS)),
    },
    {
      id: 'oscillator',
      text: 'Wire a 100 kΩ resistor from 1Y back to 1B, and a 10 nF capacitor from 1B to ground.',
      how: 'It is the oscillator of class 4, built on 1B and 1Y. Leave 1A alone for now.',
      done: (work) => oscillators(work).length > 0,
    },
    {
      id: 'out',
      text: 'Add an Audio Out and wire it to 1Y.',
      how: 'Search for "audio". 1Y now has two wires on it: one to the resistor and one to the Audio Out.',
      done: (work) => oscillators(work).some((o) => work.parts('audio-output').some((jack) => work.net(jack, 0) === o.out)),
    },
    {
      id: 'key',
      text: 'Add a push button. Wire one side of it to + and the other side to 1A.',
      how: 'Search for "button". It is the push button of class 3: closed only while it is held.',
      done: (work) => {
        const outputs = oscillators(work).map((o) => o.out);
        return keys(work).some((key) => key.from === plus(work) || outputs.includes(key.from));
      },
    },
    {
      id: 'down',
      text: 'Wire a 100 kΩ resistor from 1A to ground.',
      how: 'It goes on the same pin as the button. What it is for comes out in the experiments.',
      done: keyed,
    },
    {
      id: 'key-name',
      text: 'Name the button PLAY.',
      how: 'Click it and type PLAY into Name, at the top right.',
      done: (work) => keys(work).some((key) => isNamed(key.button, 'PLAY')),
    },
    playStep('There is nothing to hear yet. That is as it should be.'),
    {
      id: 'press',
      text: 'Press PLAY and hold it. A note sounds for as long as you hold, and stops when you let go.',
      how: 'Press on the button itself, on the canvas. If there is no note, look up the list for a step without its tick.',
      done: (work) => work.situation.playing && work.parts('pushbutton').some((b) => Number(b.parameters.closed) >= 1)
        && audible(work.run().sound.hertz),
    },
    {
      id: 'slow',
      text: 'Now a second oscillator, a slow one, on gate 2. Wire 2A to +. Wire a 470 kΩ resistor from 2Y back to 2B, and a 1 µF capacitor from 2B to ground.',
      how: 'The same shape as the first, on the next three pins down. Nothing is listening to it yet, so the sound does not change.',
      done: slowOscillator,
    },
    {
      id: 'gate',
      text: 'Move one wire. Take the button\'s wire off + and put that side of the button on 2Y.',
      how: 'Click the wire from + to the button and press Delete. Then wire the button\'s free side to 2Y. The other side stays on 1A, with the 100 kΩ.',
      done: (work) => beeping(pair(work)),
    },
    {
      id: 'beep',
      text: 'Hold PLAY again. Now it beeps: 2.8 times a second.',
      how: 'The note is the same one. Something is switching it on and off.',
      done: (work) => work.situation.playing && beeping(pair(work))
        && (work.parts('pushbutton').length === 0 || work.parts('pushbutton').some((b) => Number(b.parameters.closed) >= 1)),
    },
    {
      id: 'watch',
      text: 'Put a scope probe on the wire at 2Y and another on the wire at 1Y. Hold PLAY and watch the two together.',
      how: 'Right-click a wire to put a probe on it. 2Y is a slow square wave. The note on 1Y is there only while 2Y is high.',
      done: (work) => {
        if (!work.situation.playing) return false;
        const found = oscillators(work);
        return found.some((o) => {
          const slow = enablerOf(work, o, found);
          return slow !== undefined && work.probed(o.chip, CD4093.Y[o.gate]) && work.probed(slow.chip, CD4093.Y[slow.gate]);
        });
      },
    },
  ],

  why: [
    {
      title: 'A gate',
      text: 'Each quarter of this chip is a gate: a part whose output is decided by its inputs. Only high and low count, nothing in between. Working with highs and lows like this is called logic. These four are NAND gates. A NAND gate\'s output is low only when both of its inputs are high. Any other way, it is high.',
    },
    {
      title: 'An inverter, if you let it',
      text: 'Hold input A high. Now the output is low when B is high, and high when B is low: for B, the gate is an inverter. Its inputs are Schmitt triggers, like the CD40106\'s, so the resistor and the capacitor make the oscillator of class 4. 100 kΩ and 10 nF give about 1.3 ÷ (R × C) = 1,300 Hz, and the app reads 1.30 kHz. Hold A low, and the output is stuck high whatever B does. The capacitor fills, nothing flips, and there is silence.',
    },
    {
      title: 'Enable',
      text: 'An input used like this is an enable: a signal that says whether something else may run. PLAY is a key because it works the enable of gate 1.',
    },
    {
      title: 'The pull-down',
      text: 'While PLAY is open, nothing else is wired to 1A. The 100 kΩ to ground gives it a definite level, low. A resistor doing this job is a pull-down. Press PLAY and the button joins 1A straight to a high. The resistor still passes 9 V ÷ 100 kΩ = 0.09 mA, far too little to drag it down again. A chip\'s input takes almost no current, so a large resistor is enough to hold it.',
    },
    {
      title: 'One oscillator enables another',
      text: 'Gate 2 never stops, because its own enable, 2A, is wired to +. It goes round 1.3 ÷ (470 kΩ × 1 µF) = 2.8 times a second, and its output is high for half of each round. Through PLAY, that output is the enable of gate 1: 2.8 beeps a second. This is the gating of class 6 without the diode, and gate 2 is an LFO.',
    },
  ],

  tries: [
    {
      id: 'floating',
      title: 'No pull-down',
      question: 'Take away the 100 kΩ from 1A to ground, and do not touch PLAY. You will hear…',
      options: ['Silence, as before', 'The beeps, though nobody is pressing', 'One long note'],
      answer: 1,
      change: 'Click the 100 kΩ that goes from 1A to ground and press Delete. Play, and keep your hands off PLAY.',
      made: (work) => keys(work).some((key) => !pulled(work, key.enable)) && listen(work, 0).hertz !== null,
      result: (work) => {
        const sound = listen(work, 0);
        const what = beeping(sound) ? `${count(sound.perSecond)} beeps a second` : `A steady ${formatHertz(sound.hertz ?? 0)} note`;
        return `${what}, and nobody is holding PLAY. In the app an open button is not perfectly open. The faintest trace of current leaks through it, and with nothing else on 1A that is enough for 1A to follow whatever is on the far side of the button. (A pin with no wire on it at all reads low in the app.) Either way the app gives a definite answer. A real board does not. An input that nothing drives is a floating input: it drifts, it picks up hum from the room and from your hand, and the chip may do anything. So an input is always connected to something. On a real board that goes for the gates you are not using too: wire their inputs to ground. Put the 100 kΩ back before going on.`;
      },
    },
    {
      id: 'slower',
      title: 'A bigger resistor',
      question: 'Change gate 2\'s 470 kΩ for 1 MΩ. Holding PLAY, you will hear…',
      options: ['Slower beeps', 'Faster beeps', 'Beeps of a lower note, as often as before'],
      answer: 0,
      change: 'Click the 470 kΩ and type 1M into Resistance. Hold PLAY.',
      made: (work) => {
        const sound = pair(work);
        return beeping(sound) && sound.perSecond >= 1 && sound.perSecond <= 1.6;
      },
      result: (work) => `${count(pair(work).perSecond ?? 0)} beeps a second, down from 2.8. It is still 1.3 ÷ (R × C): about twice the resistance, about half as often. Each beep is the same note as before, because gate 1 has its own resistor and capacitor and they have not changed.`,
    },
    {
      id: 'faster',
      title: 'Too fast to count',
      question: 'Now make gate 2\'s resistor 10 kΩ, a hundredth of 1 MΩ. Holding PLAY, you will hear…',
      options: ['Very fast beeps', 'A second, lower note', 'Silence'],
      answer: 1,
      change: 'Click gate 2\'s resistor and type 10k into Resistance. Hold PLAY.',
      made: (work) => {
        const sound = pair(work);
        return beeping(sound) && sound.perSecond > 40;
      },
      result: (work) => `${count(pair(work).perSecond ?? 0)} beeps a second. Nobody hears that many as beeps. They have run together into a second, lower note, with a rough edge to it because it is made of pieces of the first. Rhythm and pitch are the same thing at different speeds. Put 470 kΩ back.`,
    },
    {
      id: 'stuck',
      title: 'Hold the slow one off',
      question: 'Gate 2 has an enable of its own: 2A, which you wired to +. Take it off + and wire it to ground. Holding PLAY, you will hear…',
      options: ['Silence', 'One steady note', 'The same beeps'],
      answer: 1,
      change: 'Delete the wire from + to 2A. Add a ground and wire 2A to it. Hold PLAY.',
      made: (work) => oscillators(work).some((o) => o.enable === GROUND) && steady(pair(work)),
      result: (work) => `One steady note, ${formatHertz(pair(work).hertz ?? 0)}. Gate 2 has stopped, as it should. But a NAND gate that is held off has its output stuck high, and a high is just what lets gate 1 run. To silence gate 1 its own enable has to go low, which is what letting go of PLAY does.`,
    },
    {
      id: 'third',
      title: 'A third oscillator',
      question: 'Let a third oscillator, slower still, do what your wire to ground just did: its output will work 2A. While that output is low, you will hear…',
      options: ['Silence', 'One long note', 'Faster beeps'],
      answer: 1,
      change: 'Take 2A off ground. Build a third oscillator on gate 3: 3A to +, a 470 kΩ resistor from 3Y back to 3B, a 10 µF capacitor from 3B to ground. Wire 3Y to 2A. Hold PLAY for a good while.',
      made: (work) => thirdOscillator(work) !== undefined && pair(work).hertz !== null,
      result: (work) => {
        const third = thirdOscillator(work)!;
        const seconds = roundOf(work, third);
        const round = seconds ? `every ${Number(seconds.toPrecision(2))} seconds` : 'for as long as you hold PLAY';
        return `A few beeps, then one long note, round and round ${round}. While 3Y is high, gate 2 runs and gate 1 beeps. While 3Y is low, gate 2 is held off with its output high, and gate 1 plays without a break. Three quarters of one chip are making a pattern. Before the check, take the wire from 3Y to 2A away and put 2A back on +.`;
      },
    },
    {
      id: 'theremin',
      title: 'Read someone else\'s circuit',
      question: 'The Light Theremin example is built on the same gate. It has a button named PLAY, and beside it a switch named DRONE: both go from + to 1A. With DRONE closed, letting go of PLAY will…',
      options: ['Stop the note', 'Change nothing', 'Make the note lower'],
      answer: 1,
      change: 'Loading an example takes your beeper off the canvas, so save it first: the Save button at the top. Then open Examples and pick Light Theremin. When you have read the answer here, Load brings your beeper back for the check.',
      made: (work) => drone(work) !== null,
      result: (work) => {
        const { button, toggle } = drone(work)!;
        const set = (closed: number) => [
          { componentId: button.id, parameter: 'closed', value: 0 },
          { componentId: toggle.id, parameter: 'closed', value: closed },
        ];
        const hertz = work.run(set(1)).sound.hertz;
        const alone = audible(work.run(set(0)).sound.hertz) ? 'the note still sounds' : 'there is silence';
        return `Nothing changes: with DRONE closed the note carries on${hertz ? ` at ${formatHertz(hertz)}` : ''}, because DRONE holds 1A high by itself. With both open ${alone}. Now find this class in the circuit. The gate is gate 1 of a CD4093. 1A is its enable. The 100 kΩ from 1A to ground is the pull-down. PLAY and DRONE are two ways of holding the enable high: they are in parallel, so either is enough. The rest is class 5: a photocell in the feedback sets the pitch. Now use Load to get your beeper back.`;
      },
    },
  ],

  check: {
    goal: 'Make a metronome, a steady tick to keep time by: beeps of a note above 800 Hz, 2 of them a second. Anywhere from 1.8 to 2.2 a second will do. The app listens with PLAY held.',
    reading: (work) => {
      if (work.parts('cd4093').length === 0 || work.parts('audio-output').length === 0) return null;
      const sound = listen(work);
      if (beeping(sound)) return `Your beeper: ${count(sound.perSecond)} beeps a second, of a ${formatHertz(sound.hertz)} note`;
      if (sound.hertz !== null) return `Your circuit: a steady ${formatHertz(sound.hertz)} note, with no beeps to count`;
      return 'Your circuit: silence';
    },
    passed: (work) => {
      const sound = listen(work);
      return beeping(sound) && sound.perSecond >= 1.8 && sound.perSecond <= 2.2 && sound.hertz > 800;
    },
    hint: 'Calculated, not measured: the beeps come 1.3 ÷ (R × C) times a second, and the R and C are gate 2\'s. With the 1 µF, 2 a second needs R = 1.3 ÷ (2 × 0.000001 F) = 650,000 Ω. The nearest value on the shelf is 680 kΩ.',
  },

  keep: [
    {
      id: 'switch',
      text: 'Swap the PLAY button for a switch, and close it.',
      how: 'Double-click the button and pick Switch from the list. It takes the button\'s place and its wires. A switch stays as it is put, so the beeper can run by itself. Click the switch to close it.',
      done: (work) => work.parts('switch').length > 0 && beeping(pair(work, 1)) && !beeping(pair(work, 0)),
    },
    {
      id: 'pull-up',
      text: 'Take the 100 kΩ off ground and wire that end of it to +.',
      how: 'A resistor that holds an input high is a pull-up. Now an open switch leaves 1A high, and gate 1 plays one steady note. Closed, it is 2.8 beeps a second again: gate 2\'s output is far stronger than 100 kΩ, and takes 1A low whenever it goes low.',
      done: kept,
    },
    ...keepSteps({
      type: 'switch', name: 'BEEP', what: 'the switch', has: 'cd4093',
      why: 'On the cover it then says what it does: beeps when it is on, one long note when it is off.',
    }).map((step) => (step.id === 'save' ? { ...step, done: (work: Work) => work.situation.saved && kept(work) } : step)),
  ],

  words: [
    { word: 'Logic', meaning: 'Working with signals that are only ever high or low.' },
    { word: 'Gate', meaning: 'A part whose output is high or low depending on its inputs. Also, as in class 6, to switch a sound on and off: which is what this one is used for.' },
    { word: 'NAND', meaning: 'A gate whose output is low only when both inputs are high. Short for "not and".' },
    { word: 'Enable', meaning: 'An input that says whether something may run.' },
    { word: 'Pull-down', meaning: 'A large resistor from an input to ground. It holds the input low when nothing else is driving it.' },
    { word: 'Pull-up', meaning: 'The same to +. It holds the input high.' },
    { word: 'Floating input', meaning: 'An input with nothing driving it. On a real board it drifts and picks up hum, so no input is ever left that way.' },
  ],

  circuit: beeper,
  stages: [
    { upTo: 'press', circuit: keyedOscillator },
  ],
};
