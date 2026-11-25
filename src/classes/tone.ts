import { exampleCircuits } from '@/examples/circuits';
import { harmonics } from '@/simulation/measure/signal';
import { formatValue } from '@/utils/parameterParser';
import type { Component } from '@/types/circuit';
import type { Built, ClassDefinition } from './types';
import { GROUND, type PinOf, type Work } from './Work';
import {
  capacitor, CD40106, connect, ground, isNamed, keepSteps, linked, LM741, place, playStep, plus, pot, POT, POWER,
  rails, reading, resistor, spans,
} from './kit';

// --- Hearing a circuit ---

/** The parts a signal goes through on its way to an Audio Out, and the legs it goes by (an op-amp's supply legs are not among them). */
const WAYS: Record<string, number[]> = {
  resistor: [0, 1], capacitor: [0, 1], switch: [0, 1], pushbutton: [0, 1], potentiometer: [POT.END1, POT.WIPER, POT.END3],
  lm741: [LM741.IN_MINUS, LM741.IN_PLUS, LM741.OUT],
};

/** One Audio Out and what plays through it. */
export interface Voice {
  out: Component;
  /** The chip output its signal starts from: an oscillator's own output, or a buffer's. */
  source: PinOf | null;
  /** The parts between the two. */
  parts: Component[];
}

/**
 * What each Audio Out plays. Its signal is followed back from the Audio Out
 * through resistors, capacitors, switches, pots and op-amps to the first
 * output of a CD40106 it comes to, never by way of the supply or ground.
 */
export function voices(work: Work): Voice[] {
  const off = rails(work);
  const outputs = new Map<string, PinOf>();
  for (const chip of work.parts('cd40106')) {
    for (const pin of CD40106.Y) {
      const net = work.net(chip, pin);
      if (!outputs.has(net)) outputs.set(net, [chip, pin]);
    }
  }
  const between = work.circuit.getComponents().filter((part) => WAYS[part.type]);
  return work.parts('audio-output').map((out) => {
    const seen = new Set([work.net(out, 0)]);
    const parts = new Set<Component>();
    let source: PinOf | null = null;
    let edge = [...seen];
    while (edge.length > 0) {
      const next: string[] = [];
      for (const net of edge) {
        // A chip's output is where a signal starts: nothing comes through it from further back
        if (outputs.has(net)) { source = source ?? outputs.get(net)!; continue; }
        for (const part of between) {
          const nets = WAYS[part.type].map((pin) => work.net(part, pin));
          if (!nets.includes(net)) continue;
          parts.add(part);
          for (const other of nets) {
            if (seen.has(other) || off.includes(other)) continue;
            seen.add(other);
            next.push(other);
          }
        }
      }
      edge = next;
    }
    return { out, source, parts: [...parts] };
  });
}

type Change = { componentId: string; parameter: string; value: number };

/** What a voice sounds like: its pitch, the size of each of its first nine harmonics, and its level. */
export interface Heard {
  /** The fundamental, read at the chip output the voice starts from. */
  hertz: number;
  /** sizes[0] is the fundamental, sizes[2] the third harmonic. A rail-to-rail square reads 0.63, 0, 0.21. */
  sizes: number[];
  /** Half of the swing of the sound. */
  level: number;
}

/** How long a voice is run for, and how much of the end of the run is read: the start is the circuit settling. */
const RUN_SECONDS = 0.2;
const READ_SECONDS = 0.1;

/**
 * A voice by itself: its own switches closed, every other switch open, and
 * controls put as `set` says. Null when nothing oscillates behind it.
 */
export function hear(work: Work, voice: Voice, set: Change[] = []): Heard | null {
  if (!voice.source) return null;
  const mine = new Set(voice.parts.map((part) => part.id));
  const switched: Change[] = work.parts('switch').map((part) => ({ componentId: part.id, parameter: 'closed', value: mine.has(part.id) ? 1 : 0 }));
  const run = work.bench({ sampleRate: 48000, seconds: RUN_SECONDS, watch: [voice.source], set: [...switched, ...set] });
  const hertz = reading(run, voice.source[0], voice.source[1]).hertz;
  if (!hertz) return null;
  const tail = run.soundTrace.subarray(Math.max(0, run.soundTrace.length - Math.round(READ_SECONDS * run.sampleRate)));
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] < min) min = tail[i];
    if (tail[i] > max) max = tail[i];
  }
  return { hertz, sizes: harmonics(tail, run.sampleRate, hertz, 9), level: tail.length > 0 ? (max - min) / 2 : 0 };
}

/** Which harmonic of a voice is the largest: 1 for the fundamental. */
export const loudest = (heard: Heard) => heard.sizes.indexOf(Math.max(...heard.sizes)) + 1;

/** How large a harmonic is beside the fundamental: 0.33 for the third harmonic of a square. */
export const share = (heard: Heard, harmonic: number) => (heard.sizes[0] > 0 ? heard.sizes[harmonic - 1] / heard.sizes[0] : 0);

// --- What this class asks of the learner's circuit ---

const farads = (part: Component) => Number(part.parameters.capacitance);
const position = (knob: Component) => Number(knob.parameters.position ?? 0.5);
const hasAmp = (voice: Voice) => voice.parts.some((p) => p.type === 'lm741');
const knobOf = (voice: Voice) => voice.parts.find((p) => p.type === 'potentiometer');
const has = (voice: Voice, type: string) => voice.parts.some((p) => p.type === type);
const turned = (knob: Component, to: number): Change[] => [{ componentId: knob.id, parameter: 'position', value: to }];

/** Loud enough to be a note and not a leak. */
const SOUNDING = 0.02;

/** Whether an inverter's output is a buffer's: its input hangs on another output. */
function isBuffer(work: Work, [chip, pin]: PinOf): boolean {
  const input = work.net(chip, CD40106.A[CD40106.Y.indexOf(pin)]);
  return work.parts('cd40106').some((other) => CD40106.Y.some((y) => !(other === chip && y === pin) && work.net(other, y) === input));
}

/** The voices with no amplifier in them that go through a resistor (or a pot) and a capacitor: the filters of the first half. */
const plain = (work: Work) => voices(work).filter((voice) =>
  voice.source !== null && !hasAmp(voice) && has(voice, 'capacitor') && (has(voice, 'resistor') || has(voice, 'potentiometer')));

/** A voice whose high harmonics have been held back: its fifth is well under the square's fifth of the fundamental. */
function duller(heard: Heard | null): boolean {
  return heard !== null && heard.sizes[0] > SOUNDING && share(heard, 5) < 0.16;
}

/** A voice whose fundamental has been held back and its harmonics left. */
function thinner(heard: Heard | null): boolean {
  return heard !== null && heard.sizes[0] > SOUNDING && share(heard, 5) > 0.3;
}

/** The tone knob's voice: a plain one with a pot in it. */
const toneVoice = (work: Work) => plain(work).find((voice) => knobOf(voice) !== undefined);

/** A voice with its pot at each end: [the brighter end, the duller end], by which is louder. */
function ends(work: Work, voice: Voice): [Heard, Heard] | null {
  const knob = knobOf(voice);
  if (!knob) return null;
  const low = hear(work, voice, turned(knob, 0.001)), high = hear(work, voice, turned(knob, 0.999));
  if (!low || !high) return null;
  return low.level > high.level ? [low, high] : [high, low];
}

/** A tone knob that works: bright at one end, dull and less than half as loud at the other. */
function toneWorks(work: Work): boolean {
  const voice = toneVoice(work);
  const heard = voice && ends(work, voice);
  if (!heard) return false;
  const [bright, dull] = heard;
  return bright.sizes[0] > SOUNDING && share(bright, 3) > 0.2 && share(dull, 5) < 0.16 && dull.level < bright.level / 2;
}

/** The outputs of the inverters wired as oscillators: resistance from output back to input, a capacitor from input to ground. */
function oscillators(work: Work): PinOf[] {
  const found: PinOf[] = [];
  for (const chip of work.parts('cd40106')) {
    CD40106.Y.forEach((y, i) => {
      const input = work.net(chip, CD40106.A[i]), output = work.net(chip, y);
      if (input !== output && linked(work, output, input, ['resistor', 'potentiometer', 'ldr'])
        && work.parts('capacitor').some((c) => spans(work, c, input, GROUND))) found.push([chip, y]);
    });
  }
  return found;
}

/** A second oscillator beside the first, playing the low note the filter is built for. */
function lowOscillator(work: Work): boolean {
  const all = oscillators(work);
  if (all.length < 2) return false;
  const run = work.bench({ sampleRate: 8000, seconds: 0.25, watch: all });
  return all.some(([chip, pin]) => {
    const hertz = reading(run, chip, pin).hertz;
    return hertz !== null && hertz > 95 && hertz < 125;
  });
}

/** An op-amp with power, and its IN+ held at half the supply by two resistors and a large capacitor. */
function halfSupplied(work: Work): Component | undefined {
  const supply = work.parts('power')[0];
  const positive = plus(work);
  if (!supply || positive === null) return undefined;
  return work.parts('lm741').find((amp) => {
    const half = work.net(amp, LM741.IN_PLUS);
    if (work.net(amp, LM741.V_PLUS) !== positive || !work.grounded(amp, LM741.V_MINUS) || rails(work).includes(half)) return false;
    if (!work.parts('capacitor').some((c) => farads(c) >= 10e-6 && spans(work, c, half, GROUND))) return false;
    const run = work.bench({ watch: [[amp, LM741.IN_PLUS], [supply, POWER.PLUS]] });
    const volts = reading(run, amp, LM741.IN_PLUS).mean, whole = reading(run, supply, POWER.PLUS).mean;
    return whole > 0 && volts > 0.45 * whole && volts < 0.55 * whole;
  });
}

/** The filter's way in: from a chip's output a switch and a resistor to a point, a resistor from the point to ground, and a capacitor and a resistor from the point to IN−. */
function hasInput(work: Work): boolean {
  const off = rails(work);
  const outputs = work.parts('cd40106').flatMap((chip) => CD40106.Y.map((y) => work.net(chip, y)));
  return work.parts('lm741').some((amp) => {
    const minus = work.net(amp, LM741.IN_MINUS);
    return work.parts('resistor').some((lower) => {
      const point = [work.net(lower, 0), work.net(lower, 1)].find((net) => !off.includes(net));
      if (point === undefined || !spans(work, lower, point, GROUND) || !linked(work, point, minus, ['resistor', 'capacitor'])) return false;
      return outputs.some((output) => linked(work, output, point, ['switch', 'resistor']) && !linked(work, output, point, ['resistor']));
    });
  });
}

/** What goes round the op-amp: a resistor from OUT to IN−, two capacitors in a line beside it, and from between them a pot (and a resistor) to the half-supply point. */
function hasRing(work: Work): boolean {
  const off = rails(work);
  const caps = work.parts('capacitor'), resistors = work.parts('resistor');
  return work.parts('lm741').some((amp) => {
    const minus = work.net(amp, LM741.IN_MINUS), out = work.net(amp, LM741.OUT), half = work.net(amp, LM741.IN_PLUS);
    if (!resistors.some((r) => spans(work, r, out, minus))) return false;
    const middles = caps.flatMap((c) => [work.net(c, 0), work.net(c, 1)])
      .filter((net) => net !== minus && net !== out && net !== half && !off.includes(net)
        && caps.some((c) => spans(work, c, minus, net)) && caps.some((c) => spans(work, c, net, out)));
    // A leg reaches a point if it is on it, or one resistor away from it
    const reaches = (leg: string, point: string) => leg === point || resistors.some((r) => spans(work, r, leg, point));
    return middles.some((middle) => work.parts('potentiometer').some((knob) => {
      const legs = [POT.END1, POT.WIPER, POT.END3].map((pin) => work.net(knob, pin));
      return legs.some((a) => reaches(a, middle) && legs.some((b) => b !== a && reaches(b, half)));
    }));
  });
}

/** The resonant filter's voice: through an op-amp, with a pot. */
const filterVoice = (work: Work) => voices(work).find((voice) => voice.source !== null && hasAmp(voice) && knobOf(voice) !== undefined);

/**
 * A resonant filter that works: with its pot a tenth of the way from one
 * end, the third harmonic of its note comes out larger than the fundamental.
 * No filter made of a resistor and a capacitor alone can do that.
 */
function filterWorks(work: Work): boolean {
  const voice = filterVoice(work);
  const knob = voice && knobOf(voice);
  if (!voice || !knob) return false;
  return [0.9, 0.1].some((to) => {
    const heard = hear(work, voice, turned(knob, to));
    return heard !== null && heard.sizes[0] > SOUNDING / 4 && loudest(heard) === 3;
  });
}

/** The note the check is about: 441 Hz, give or take. */
const isTheNote = (heard: Heard) => heard.hertz > 420 && heard.hertz < 460;
const pure = (heard: Heard) => share(heard, 3) < 0.15;
const loud = (heard: Heard) => heard.level > 0.2;

/** What the check reads: the voice at 441 Hz that passes, or the first one there is; failing that, any voice at all. */
function judged(work: Work): Heard | null {
  const all = voices(work).map((voice) => hear(work, voice)).filter((heard): heard is Heard => heard !== null);
  const notes = all.filter(isTheNote);
  return notes.find((heard) => pure(heard) && loud(heard)) ?? notes[0] ?? all[0] ?? null;
}

const size = (value: number) => value.toFixed(2);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const hz = (value: number) => `${Math.round(value)} Hz`;
const ORDINALS = ['', 'fundamental', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];

// --- The circuits ---

/** The Simple Oscillator example, which is what class 4 keeps: 441 Hz from 1Y through SOUND to the Audio Out. */
function simpleOscillator() {
  const { components, connections } = exampleCircuits.find((example) => example.name === 'Simple Oscillator')!.build();
  const one = (type: string) => components.find((component) => component.type === type)!;
  return { components, connections, chip: one('cd40106'), sound: one('switch'), out: one('audio-output'), supply: one('power') };
}

/** The oscillator buffered: 1Y to 2A, and SOUND on 2Y with nothing after it yet. */
function buffered() {
  const { components, connections, chip, sound, out, supply } = simpleOscillator();
  sound.position = { x: 640, y: 220 };
  return {
    chip, sound, supply,
    components: components.filter((component) => component !== out),
    connections: [
      ...connections.filter((wire) => wire.from.componentId !== sound.id && wire.to.componentId !== sound.id),
      connect(chip, CD40106.Y[0], chip, CD40106.A[1]),
      connect(chip, CD40106.Y[1], sound, 0),
    ],
  };
}

/** The first filter: 10 kΩ from SOUND to the meeting point, 10 nF from there to ground, the Audio Out on the meeting point. */
function lowPass(): Built {
  const { components, connections, sound } = buffered();
  const series = resistor(10e3, 760, 220);
  const shunt = capacitor(10e-9, 860, 300, 90);
  const shuntGround = ground(860, 380);
  const out = place('audio-output', 960, 260);
  return {
    components: [...components, series, shunt, shuntGround, out],
    connections: [...connections, connect(sound, 1, series, 0), connect(series, 1, out, 0), connect(shunt, 0, out, 0), connect(shunt, 1, shuntGround, 0)],
  };
}

/** The two swapped: 10 nF from SOUND to the meeting point, 10 kΩ from there to ground. */
function highPass(): Built {
  const { components, connections, sound } = buffered();
  const series = capacitor(10e-9, 760, 220);
  const shunt = resistor(10e3, 860, 300, 90);
  const shuntGround = ground(860, 380);
  const out = place('audio-output', 960, 260);
  return {
    components: [...components, series, shunt, shuntGround, out],
    connections: [...connections, connect(sound, 1, series, 0), connect(series, 1, out, 0), connect(shunt, 0, out, 0), connect(shunt, 1, shuntGround, 0)],
  };
}

/** The tone knob: 1 kΩ and a 100 kΩ pot in the resistor's place, on the pot's legs 2 and 3 so that up is brighter, and 47 nF. */
function toneKnob() {
  const { components, connections, sound, chip, supply } = buffered();
  const stop = resistor(1e3, 760, 220);
  const knob = pot('', 100e3, 0.5, 880, 240);
  const shunt = capacitor(47e-9, 980, 300, 90);
  const shuntGround = ground(980, 380);
  const out = place('audio-output', 1080, 260);
  return {
    chip, supply, sound,
    components: [...components, stop, knob, shunt, shuntGround, out],
    connections: [
      ...connections,
      connect(sound, 1, stop, 0), connect(stop, 1, knob, POT.WIPER), connect(knob, POT.END3, out, 0),
      connect(shunt, 0, out, 0), connect(shunt, 1, shuntGround, 0),
    ],
  };
}

/**
 * A second oscillator on the chip's third inverter (120 kΩ, 100 nF: 108 Hz)
 * and the resonant filter it plays through. The filter is the Weird Sound
 * Generator's ODDNESS stage with one value changed: the lower resistor of
 * the divider is 10 kΩ where the example has 1 kΩ, so that it is loud
 * enough for an Audio Out with its trim left alone.
 */
function filterVoiceParts(chip: Component, supply: Component, names: { knob?: string; sound?: string } = {}, turnedTo = 0.5): Built {
  const x = 560, y = 720;
  // The oscillator: 120 kΩ from 3Y back to 3A, 100 nF from 3A to ground
  const timing = resistor(120e3, 440, 500);
  const timingCap = capacitor(100e-9, 160, 340, 90);
  const timingGround = ground(160, 440);
  // In: a switch, 1 MΩ over 10 kΩ, then 100 nF and 750 kΩ to IN−
  const sound = place('switch', x, y, { label: names.sound, parameters: { closed: 1 } });
  const upper = resistor(1e6, x + 120, y);
  const lower = resistor(10e3, x + 200, y + 80, 90);
  const dividerGround = ground(x + 200, y + 170);
  const coupling = capacitor(100e-9, x + 280, y);
  const input = resistor(750e3, x + 380, y);
  // The op-amp on half supply
  const amp = place('lm741', x + 540, y + 20);
  const ampGround = ground(x + 480, y + 120);
  const halfTop = resistor(100e3, x + 300, y + 140);
  const halfBottom = resistor(100e3, x + 400, y + 220, 90);
  const steady = capacitor(220e-6, x + 320, y + 220, 90);
  const halfGround = ground(x + 360, y + 320);
  // Round the op-amp: 10 MΩ, two 470 pF in a line beside it, and from between them the pot and 1 kΩ to half supply
  const across = resistor(10e6, x + 540, y - 80);
  const capIn = capacitor(470e-12, x + 490, y - 160);
  const capOut = capacitor(470e-12, x + 590, y - 160);
  // Turned half round, so its leg 3 is on the left, towards the 1 kΩ
  const knob = place('potentiometer', x + 540, y - 240, {
    rotation: 180, label: names.knob, parameters: { maxResistance: 1e6, value: formatValue(1e6, 'resistance'), position: turnedTo },
  });
  const stop = resistor(1e3, x + 420, y - 240);
  // Out: 1 kΩ and 1 µF to an Audio Out
  const outR = resistor(1e3, x + 660, y + 20);
  const outC = capacitor(1e-6, x + 760, y + 20);
  const out = place('audio-output', x + 860, y + 60);
  return {
    components: [
      timing, timingCap, timingGround, sound, upper, lower, dividerGround, coupling, input,
      amp, ampGround, halfTop, halfBottom, steady, halfGround, across, capIn, capOut, knob, stop, outR, outC, out,
    ],
    connections: [
      connect(chip, CD40106.Y[2], timing, 1), connect(timing, 0, chip, CD40106.A[2]),
      connect(timingCap, 0, chip, CD40106.A[2]), connect(timingCap, 1, timingGround, 0),
      connect(chip, CD40106.Y[2], sound, 0), connect(sound, 1, upper, 0),
      connect(upper, 1, lower, 0), connect(lower, 1, dividerGround, 0),
      connect(upper, 1, coupling, 0), connect(coupling, 1, input, 0), connect(input, 1, amp, LM741.IN_MINUS),
      connect(supply, POWER.PLUS, amp, LM741.V_PLUS), connect(amp, LM741.V_MINUS, ampGround, 0),
      connect(supply, POWER.PLUS, halfTop, 0), connect(halfTop, 1, amp, LM741.IN_PLUS),
      connect(halfTop, 1, halfBottom, 0), connect(halfBottom, 1, halfGround, 0),
      connect(halfTop, 1, steady, 0), connect(steady, 1, halfGround, 0),
      connect(amp, LM741.IN_MINUS, across, 0), connect(across, 1, amp, LM741.OUT),
      connect(amp, LM741.IN_MINUS, capIn, 0), connect(capIn, 1, capOut, 0), connect(capOut, 1, amp, LM741.OUT),
      connect(capIn, 1, knob, POT.WIPER), connect(knob, POT.END3, stop, 1), connect(stop, 0, amp, LM741.IN_PLUS),
      connect(amp, LM741.OUT, outR, 0), connect(outR, 1, outC, 0), connect(outC, 1, out, 0),
    ],
  };
}

/** The whole build: the tone knob on the first oscillator, its SOUND open, and beside it the resonant filter on a second. */
function both(): Built {
  const { components, connections, chip, supply, sound } = toneKnob();
  sound.parameters = { ...sound.parameters, closed: 0 };
  const filter = filterVoiceParts(chip, supply);
  return { components: [...components, ...filter.components], connections: [...connections, ...filter.connections] };
}

/**
 * What the class keeps: the low oscillator and the resonant filter by
 * themselves, the pot named ODDNESS (at 90%, where the third harmonic rings)
 * and the switch between the oscillator and the 1 MΩ named SOUND.
 */
export function toneKept(): Built {
  const supply = place('power', 490, 60);
  const supplyGround = ground(510, 130);
  const chip = place('cd40106', 500, 260);
  const filter = filterVoiceParts(chip, supply, { knob: 'ODDNESS', sound: 'SOUND' }, 0.9);
  return {
    components: [supply, supplyGround, chip, ...filter.components],
    connections: [
      connect(supply, POWER.PLUS, chip, CD40106.VDD), connect(supplyGround, 0, chip, CD40106.VSS), connect(supply, POWER.MINUS, supplyGround, 0),
      ...filter.connections,
    ],
  };
}

/** Class 13: what a square wave is made of, and three ways of taking some of it away. */
export const tone: ClassDefinition = {
  id: 'tone',
  number: 13,
  unit: 'Bigger sound',
  title: 'Tone',
  promise: 'A tone knob, and a filter that sings.',
  startsFrom: 'Class 4\'s oscillator: the Simple Oscillator, playing 441 Hz through a switch named SOUND.',
  start: () => {
    const { components, connections } = simpleOscillator();
    return { components, connections };
  },

  build: [
    {
      id: 'buffer',
      text: 'Give the oscillator a buffer: wire the chip\'s 1Y to its 2A, and move SOUND\'s wire from 1Y to 2Y.',
      how: 'As in class 4: the second inverter takes the load and the first is left alone. Click the wire from 1Y to SOUND and press Delete, then wire 2Y to SOUND. It sounds the same. One of the experiments shows what the buffer is for.',
      done: (work) => voices(work).some((voice) => voice.source !== null && isBuffer(work, voice.source)),
    },
    {
      id: 'lowpass',
      text: 'Drop a 10 kΩ resistor onto the wire between SOUND and the Audio Out. Then wire a 10 nF capacitor from the Audio Out\'s pin to ground.',
      how: 'Move the Audio Out to the right first, to make room. A part let go of on a wire goes into the wire. A resistor and a capacitor wired like this are a filter: they let some of a sound through and hold some back. The place where the two and the Audio Out meet is the meeting point. This class is about what arrives there.',
      done: (work) => plain(work).some((voice) => duller(hear(work, voice))),
    },
    playStep('Close SOUND if it is open. The note is the same buzz with a little of its edge taken off.'),
    {
      id: 'scope',
      text: 'Put a probe on each side of the resistor: right-click the wire on 2Y, then the wire on the Audio Out.',
      how: 'On 2Y the wave is square. At the meeting point its corners are rounded: the capacitor takes time to fill through the resistor, as in class 3, so it cannot follow the jump.',
      done: (work) => work.situation.playing
        && plain(work).some((voice) => work.probed(voice.source![0], voice.source![1]) && work.probed(voice.out, 0)),
    },
    {
      id: 'highpass',
      text: 'Swap the two parts: the 10 nF from SOUND to the meeting point, the 10 kΩ from the meeting point to ground.',
      how: 'Double-click the resistor, choose All parts and click a 10 nF capacitor on the shelf. Then double-click the old capacitor and put a 10 kΩ resistor in its place. Listen: thin and bright. On the scope the flat tops have gone and only the jumps are left, as spikes.',
      done: (work) => plain(work).some((voice) => thinner(hear(work, voice))),
    },
    {
      id: 'knob',
      text: 'Put them back the first way round, with a knob: from SOUND a 1 kΩ resistor and then a 100 kΩ pot to the meeting point, and 47 nF from the meeting point to ground.',
      how: 'Double-click the capacitor and put a 1 kΩ resistor in its place. Double-click the 10 kΩ and put a 47 nF capacitor in its place. Then take away the wire from the 1 kΩ to the Audio Out and put the pot there: the 1 kΩ to the pot\'s middle leg, the pot\'s leg 3 to the Audio Out\'s pin. That way round, up is brighter. The 1 kΩ keeps some resistance there when the pot is at its end.',
      done: toneWorks,
    },
    {
      id: 'turn',
      text: 'Play, and turn the pot from one end to the other: bright at one end, dull and quiet at the other.',
      how: 'Drag the small knob beside the pot up and down. This is the tone knob of a guitar or a radio.',
      done: (work) => {
        const voice = work.situation.playing ? toneVoice(work) : undefined;
        const knob = voice && knobOf(voice);
        return knob !== undefined && Math.abs(position(knob) - 0.5) > 0.3 && toneWorks(work);
      },
    },
    {
      id: 'second',
      text: 'Open SOUND, so it is quiet. Leave the tone knob where it is and build a second oscillator beside it, a low one, on the chip\'s third inverter: 120 kΩ from 3Y back to 3A, and 100 nF from 3A to ground.',
      how: 'One chip, several voices, as in class 6. This one plays 108 Hz, two octaves below the first. The next filter shows best on a low note. The tone knob stays: the experiments and the check come back to it.',
      done: lowOscillator,
    },
    {
      id: 'amp',
      text: 'Add an LM741: V+ to +, V− to ground. Give it half the supply, as in class 12: two 100 kΩ in a line from + to ground, their meeting point to IN+, and 220 µF from that point to ground.',
      how: 'The point between the two resistors sits at 4.5 V. That is the op-amp\'s zero. The large capacitor holds it still while the filter leans on it.',
      done: (work) => halfSupplied(work) !== undefined,
    },
    {
      id: 'input',
      text: 'From 3Y: a switch, then 1 MΩ to a new point, and 10 kΩ from that point to ground. From the same point: 100 nF, then 750 kΩ, to IN−.',
      how: '1 MΩ over 10 kΩ is a divider. It cuts the 9 V square down to about a hundredth, 0.09 V, and the filter makes it large again. The Weird Sound Generator example has 1 kΩ there and comes out a tenth as loud: it is made to be plugged into an amplifier. Type 750k into the search box: the shelf makes values it does not stock. The 100 nF is a coupling capacitor.',
      done: hasInput,
    },
    {
      id: 'ring',
      text: 'Round the op-amp: 10 MΩ from OUT back to IN−. Beside it, two 470 pF capacitors in a line, also from OUT to IN−. From the point between the two capacitors: a 1 MΩ pot, then 1 kΩ, to the half-supply point.',
      how: 'The point between the capacitors goes to the pot\'s middle leg, and the pot\'s leg 3 to the 1 kΩ. There is nothing to hear yet, so check each wire against the step.',
      done: hasRing,
    },
    {
      id: 'out',
      text: 'From OUT: 1 kΩ, then 1 µF, then a second Audio Out.',
      how: 'Another coupling capacitor: OUT stands on 4.5 V and the Audio Out wants only the signal.',
      done: filterWorks,
    },
    {
      id: 'sweep',
      text: 'Close the new switch, play, and turn the new pot slowly from one end to the other.',
      how: 'Nearly all of it happens above 85%. The note stays where it is and something inside it climbs. This is the ODDNESS knob of the Weird Sound Generator, by itself.',
      done: (work) => {
        const voice = work.situation.playing ? filterVoice(work) : undefined;
        const knob = voice && knobOf(voice);
        return knob !== undefined && Math.abs(position(knob) - 0.5) > 0.3 && filterWorks(work);
      },
    },
  ],

  why: [
    {
      title: 'Harmonics',
      text: 'A square wave is not one tone but many, stacked. The lowest is the fundamental: it is the pitch you hear, 441 Hz for the first oscillator. Above it are weaker tones at 3, 5, 7 and 9 times its frequency. These are harmonics. On the app\'s scale for sound, the fundamental of this square measures 0.63 and those harmonics 0.21, 0.13, 0.09 and 0.07. A fundamental with no harmonics is a pure tone: smooth, like a whistle. The harmonics are the buzz. The mix of them is what makes one instrument sound unlike another on the same note. That is called timbre.',
    },
    {
      title: 'Low-pass',
      text: 'A resistor and a capacitor make a filter: a circuit that lets some tones through and holds others back. A capacitor takes time to fill through a resistor (class 3), so the meeting point cannot keep up with fast changes. High tones are held back and low ones pass: a low-pass filter. That is why the square\'s corners were rounded. With 10 kΩ and 10 nF the third harmonic fell from 0.21 to 0.16 and the seventh from 0.09 to 0.04.',
    },
    {
      title: 'High-pass',
      text: 'Swapped round, the capacitor is in the signal\'s way. Only changes get through a capacitor, so the jumps of the square pass and its flat parts drain away through the resistor. Now low tones are held back and high ones pass: a high-pass filter. The fundamental fell from 0.63 to 0.17 while the seventh harmonic only went from 0.09 to 0.08.',
    },
    {
      title: 'The corner',
      text: 'The frequency where a filter starts to bite is its corner frequency: 1 ÷ (2π × R × C), with R in ohms and C in farads. 10 kΩ and 10 nF give 1.6 kHz. That is above the third harmonic of the note, so only the harmonics higher up lost much. A tone knob moves the corner by changing R. At its dull end the corner is at 34 Hz, far below the note itself, which is why the note fades as well.',
    },
    {
      title: 'Resonance',
      text: 'The second filter has an amplifier in it, with capacitors in its feedback. It does something a resistor and a capacitor cannot do alone: at its corner it rings, like a glass that is tapped, and whatever arrives at that frequency comes out larger. This is resonance. The pot moves the corner. Each time the corner lands on a harmonic of the 108 Hz note, that harmonic sings out: the third at 324 Hz, the fifth at 540 Hz, the seventh at 756 Hz. The corner is at about 1 ÷ (2π × 470 pF × √(R × 10 MΩ)), where R is the pot and its 1 kΩ.',
    },
    {
      title: 'On a real board',
      text: 'The app\'s parts are exactly the values printed on them. A real capacitor can be a tenth out either way, and a real pot is seldom exactly half way at half way. So on a real board each harmonic would ring a little to one side of where it does here. You would find it by ear, which is what a knob is for.',
    },
  ],

  tries: [
    {
      id: 'dull',
      title: 'All the way down',
      question: 'Close SOUND and open the filter\'s switch, to hear the tone knob by itself. Turn it all the way to its dull end. Beside the bright end, the note will be…',
      options: ['Just as loud, only duller', 'About half as loud', 'About a tenth as loud'],
      answer: 2,
      change: 'Turn the tone knob as far as it goes towards dull.',
      made: (work) => {
        const voice = toneVoice(work);
        const knob = voice && knobOf(voice);
        if (!voice || !knob || Math.abs(position(knob) - 0.5) < 0.47) return false;
        const here = hear(work, voice), there = hear(work, voice, turned(knob, position(knob) < 0.5 ? 0.999 : 0.001));
        return here !== null && there !== null && here.level < there.level / 4;
      },
      result: (work) => {
        const voice = toneVoice(work)!;
        const here = hear(work, voice)!;
        const [bright] = ends(work, voice)!;
        return `Level ${size(here.level)}, where the bright end reads ${size(bright.level)}. The corner is now far below the note, so the filter holds back the fundamental too: it is down from ${size(bright.sizes[0])} to ${size(here.sizes[0])}. And the sound is no purer for it. The third harmonic is still ${percent(share(here, 3))} of the fundamental. Past a certain point a filter like this only makes things quieter.`;
      },
    },
    {
      id: 'bigger',
      title: 'A bigger capacitor',
      question: 'Change the tone knob\'s 47 nF for 470 nF, ten times as much. With the knob at its bright end, the sound will be…',
      options: ['Brighter than it was there', 'The same as it was there', 'Duller than it was there'],
      answer: 2,
      change: 'Click the 47 nF capacitor and type 470n into Capacitance, at the top right. Turn the tone knob to its bright end.',
      made: (work) => {
        const voice = toneVoice(work);
        const knob = voice && knobOf(voice);
        if (!voice || !knob || Math.abs(position(knob) - 0.5) < 0.47) return false;
        if (!voice.parts.some((p) => p.type === 'capacitor' && farads(p) >= 200e-9)) return false;
        const here = hear(work, voice), there = hear(work, voice, turned(knob, position(knob) < 0.5 ? 0.999 : 0.001));
        return here !== null && there !== null && here.level > there.level && share(here, 3) < 0.2;
      },
      result: (work) => {
        const here = hear(work, toneVoice(work)!)!;
        return `The third harmonic is ${percent(share(here, 3))} of the fundamental here. With 47 nF it was 30%. Ten times the capacitance puts the corner ten times lower, wherever the knob is: its whole range has moved down. R and C set the corner together. Put 47 nF back before going on.`;
      },
    },
    {
      id: 'unbuffered',
      title: 'Without the buffer',
      question: 'Move SOUND\'s wire from 2Y back to 1Y, so the filter hangs on the oscillator itself. Turning the tone knob will now…',
      options: ['Change the tone, as before', 'Change the pitch as well', 'Stop the oscillator'],
      answer: 1,
      change: 'Delete the wire from 2Y to SOUND and wire 1Y to SOUND. Play, and turn the tone knob from end to end.',
      made: (work) => {
        const voice = toneVoice(work);
        if (!voice || isBuffer(work, voice.source!)) return false;
        const heard = ends(work, voice);
        return heard !== null && Math.abs(heard[0].hertz - heard[1].hertz) > 2;
      },
      result: (work) => {
        const [bright, dull] = ends(work, toneVoice(work)!)!;
        return `${hz(bright.hertz)} at the bright end and ${hz(dull.hertz)} at the dull end. With the buffer it was 441 Hz wherever the knob was. The filter's capacitor fills and empties through the oscillator's own output, so it has become part of the timing. A buffer keeps what comes after it from reaching back. Put SOUND's wire back on 2Y.`;
      },
    },
    {
      id: 'third',
      title: 'Ninety percent',
      question: 'Open SOUND and close the filter\'s switch. With its pot at 50% the filter gives a dull 108 Hz. Turn the pot up to 90%. What will be loudest?',
      options: ['The fundamental, 108 Hz', 'The third harmonic, 324 Hz', 'Every harmonic, as in the square'],
      answer: 1,
      change: 'Click the filter\'s pot and set Position to 90%, at the top right. If yours got duller on the way up, its end legs are the other way round: use 10%.',
      made: (work) => {
        const voice = filterVoice(work);
        const heard = voice && hear(work, voice);
        return heard !== null && heard !== undefined && loudest(heard) === 3;
      },
      result: (work) => {
        const heard = hear(work, filterVoice(work)!)!;
        return `The third harmonic, ${hz(heard.hertz * 3)}, measures ${size(heard.sizes[2])} and the fundamental ${size(heard.sizes[0])}. The corner is sitting on the third harmonic and ringing with it. Listen for a second, higher note inside the first.`;
      },
    },
    {
      id: 'ladder',
      title: 'Up the ladder',
      question: 'Keep going: 96%, then 98%. The filter will…',
      options: ['Stay on the third harmonic', 'Pick out the fifth, then the seventh', 'Go silent'],
      answer: 1,
      change: 'Set Position to 96% and listen. Then 98%. (4% and 2% if yours is the other way round.)',
      made: (work) => {
        const voice = filterVoice(work);
        const heard = voice && hear(work, voice);
        return heard !== null && heard !== undefined && loudest(heard) >= 5;
      },
      result: (work) => {
        const heard = hear(work, filterVoice(work)!)!;
        const top = loudest(heard);
        return `Now the ${ORDINALS[top]} harmonic is the loudest: ${hz(heard.hertz * top)}, at ${size(heard.sizes[top - 1])}. Each harmonic rings in turn as the corner passes it: the third at 90%, the fifth at 96%, the seventh at 98%, the ninth at 99%. At 97% the corner is between two of them and nothing rings. The oscillator has not changed. Every one of these tones was in the square all along.`;
      },
    },
  ],

  check: {
    goal: 'Make the 441 Hz square nearly pure: its third harmonic under 15% of its fundamental, with the level still above 0.2. Close SOUND and open the filter\'s switch, and work on the tone knob.',
    reading: (work) => {
      const heard = judged(work);
      if (!heard) return null;
      if (!isTheNote(heard)) return `Nothing here plays near 441 Hz: your note is at ${hz(heard.hertz)}.`;
      const third = share(heard, 3);
      const verdict = pure(heard) && loud(heard) ? 'Nearly pure, and loud enough.'
        : pure(heard) ? 'Pure enough, but too quiet: too much filtering.'
        : !loud(heard) ? 'Not pure enough, and too quiet.'
        : third > 0.36 ? 'Loud enough, but its harmonics are stronger than the square\'s own: this filter holds back the wrong end.'
        : 'Loud enough, but not pure enough: too little filtering.';
      return `Your note: third harmonic ${percent(third)} of the fundamental, level ${size(heard.level)}. ${verdict}`;
    },
    passed: (work) => {
      const heard = judged(work);
      return heard !== null && isTheNote(heard) && pure(heard) && loud(heard);
    },
    hint: 'Calculated, not measured: the filter has to take a lot off the third harmonic (1,323 Hz) and little off the fundamental (441 Hz), so its corner belongs a little below the fundamental. With 47 nF, a corner at 300 Hz needs 1 ÷ (2π × 300 × 47 nF), about 11 kΩ: the 1 kΩ and a tenth of the pot. That is the tone knob near 90% if up is bright for yours, or near 10% if not. A corner too high leaves the buzz. A corner too low takes the note away as well.',
  },

  keep: (() => {
    const [name, cover, save] = keepSteps({
      type: 'potentiometer', name: 'ODDNESS', what: 'the filter\'s pot', has: 'lm741',
      why: 'It is the name the Weird Sound Generator gives this knob.',
    });
    return [
      {
        id: 'tidy',
        text: 'Take the tone knob\'s voice away, so only the filter\'s is left.',
        how: 'Delete the first oscillator\'s two resistors and its capacitor, SOUND, the tone knob with its 1 kΩ and its 47 nF, and the first Audio Out: click each and press Delete. The chip, the second oscillator and the filter stay.',
        done: (work) => ['audio-output', 'potentiometer', 'switch'].every((type) => work.parts(type).length === 1) && filterWorks(work),
      },
      name,
      {
        id: 'sound',
        text: 'Name the filter\'s switch SOUND.',
        how: 'It is the only switch left: the one between the oscillator and the 1 MΩ. On the cover it turns the voice on and off.',
        done: (work) => {
          const voice = filterVoice(work);
          return voice !== undefined && voice.parts.some((p) => p.type === 'switch' && isNamed(p, 'SOUND'));
        },
      },
      cover,
      save,
    ];
  })(),

  words: [
    { word: 'Harmonic', meaning: 'One of the weaker, higher tones inside a sound, at a whole number of times the frequency of the lowest.' },
    { word: 'Fundamental', meaning: 'The lowest tone in a sound: the pitch you hear.' },
    { word: 'Pure tone', meaning: 'A fundamental with no harmonics. Smooth, like a whistle.' },
    { word: 'Timbre', meaning: 'What a sound is like apart from its pitch and its level: which harmonics it has, and how much of each.' },
    { word: 'Filter', meaning: 'A circuit that lets some tones through and holds others back.' },
    { word: 'Low-pass', meaning: 'A filter that passes low tones and holds back high ones. Resistor first, capacitor to ground.' },
    { word: 'High-pass', meaning: 'A filter that passes high tones and holds back low ones. Capacitor first, resistor to ground.' },
    { word: 'Corner frequency', meaning: 'Where a filter starts to bite: 1 ÷ (2π × R × C).' },
    { word: 'Resonance', meaning: 'A filter ringing at its corner, so that what arrives at that frequency comes out larger.' },
  ],

  circuit: both,
  stages: [
    { upTo: 'scope', circuit: lowPass },
    { upTo: 'highpass', circuit: highPass },
    { upTo: 'turn', circuit: () => { const { components, connections } = toneKnob(); return { components, connections }; } },
  ],
};
