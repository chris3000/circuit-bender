import { formatAmps, formatHertz, formatVolts } from '@/utils/readings';
import { measureSignal, type SignalReading } from '@/simulation/measure/signal';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Component, Connection } from '@/types/circuit';
import type { Built, ClassDefinition } from './types';
import { GROUND, type PinOf, type Work } from './Work';
import {
  all, capacitor, CD40106, connect, ground, keepSteps, LED, ledAmps, linked, LIT, namedSwitch, place, playStep, plus, POWER,
  reading, resistor, spans, swing, switches, TRANSISTOR,
} from './kit';
import { sharingVoltageKept } from './sharingVoltage';

// --- What this class asks of the learner's circuit ---

const NPN = '2n3904';
/** An LED with only its own resistor holding it back: 10 mA and more. */
const FULL = 0.01;
/** An LED that is off, as far as the eye goes: half of what can just be seen. */
const OFF = LIT / 2;

/** The LED's current with a control of every part of a kind put to `value`. */
const ledWith = (work: Work, type: string, parameter: string, value: number) =>
  ledAmps(work, work.run(all(work, type, parameter, value)));

/** The LED's current as the circuit stands. */
const ledNow = (work: Work) => ledAmps(work, work.run());

/** The transistor that switches the LED: E on ground, and C reached from + through the LED and its resistor. */
function lampSwitch(work: Work): Component | undefined {
  const supply = plus(work);
  if (!supply || work.parts('led').length === 0) return undefined;
  return work.parts(NPN).find((q) =>
    work.grounded(q, TRANSISTOR.E) && linked(work, supply, work.net(q, TRANSISTOR.C), ['resistor', 'led']));
}

/** A lamp a finger works: dark untouched, fully lit pressed hard. No finger can do that without a transistor. */
const touchLamp = (work: Work) => work.parts('body-contact').length > 0 && work.parts(NPN).length > 0
  && ledWith(work, 'body-contact', 'touch', 0) < OFF && ledWith(work, 'body-contact', 'touch', 1) > FULL;

/** A light that comes on in the dark: off in bright light, fully lit with none. */
const nightLight = (work: Work) => work.parts('ldr').length > 0 && work.parts(NPN).length > 0
  && ledWith(work, 'ldr', 'light', 1) < OFF && ledWith(work, 'ldr', 'light', 0) > FULL;

/** The night light the other way up: fully lit in bright light, dim in the dark, but with 100 kΩ below it not quite out. */
const dayLight = (work: Work) => work.parts('ldr').length > 0 && work.parts(NPN).length > 0
  && ledWith(work, 'ldr', 'light', 1) > FULL && ledWith(work, 'ldr', 'light', 0) < FULL / 2 && ledWith(work, 'ldr', 'light', 0) > LIT;

/** The resistors with a leg on a transistor's base. */
const baseResistors = (work: Work, q: Component) => {
  const base = work.net(q, TRANSISTOR.B);
  return work.parts('resistor').filter((r) => work.net(r, 0) === base || work.net(r, 1) === base);
};

/** The current into a transistor's base, where one resistor carries all of it (0 where that cannot be said). */
function baseAmps(work: Work, run: BenchRun, q: Component | undefined): number {
  const feeds = q ? baseResistors(work, q) : [];
  return feeds.length === 1 ? Math.abs(run.amps(feeds[0].id)) : 0;
}

/** The base of the lamp's transistor, read with every photocell in one light. */
function baseVolts(work: Work, light: number): number {
  const q = lampSwitch(work);
  if (!q) return 0;
  return reading(work.bench({ watch: [[q, TRANSISTOR.B]], set: all(work, 'ldr', 'light', light) }), q, TRANSISTOR.B).mean;
}

/** The outputs of the inverters wired as oscillators: resistors from the output back to the input, a capacitor from the input to ground. */
function oscillators(work: Work): PinOf[] {
  const found: PinOf[] = [];
  for (const chip of work.parts('cd40106')) {
    CD40106.A.forEach((input, n) => {
      const a = work.net(chip, input), y = work.net(chip, CD40106.Y[n]);
      if (linked(work, y, a, ['resistor']) && work.parts('capacitor').some((c) => spans(work, c, a, GROUND))) found.push([chip, CD40106.Y[n]]);
    });
  }
  return found;
}

/** A speaker wired straight from an oscillator's output to ground, and the output it is on. */
function bareSpeaker(work: Work): { speaker: Component; output: PinOf } | undefined {
  for (const output of oscillators(work)) {
    const speaker = work.parts('speaker').find((s) => spans(work, s, work.net(output[0], output[1]), GROUND));
    if (speaker) return { speaker, output };
  }
  return undefined;
}

/** The run that reads a speaker on a chip: long enough for a note to show, were there one. */
const bareRun = (work: Work, output: PinOf) => work.bench({ seconds: 0.05, watch: [output] });

/** A speaker in a transistor's collector, with the transistor and the resistors on its base. */
function drivenSpeaker(work: Work): { speaker: Component; feeds: Component[] } | undefined {
  for (const q of work.parts(NPN)) {
    if (!work.grounded(q, TRANSISTOR.E)) continue;
    const collector = work.net(q, TRANSISTOR.C);
    const speaker = work.parts('speaker').find((s) => [0, 1].some((pin) =>
      work.net(s, pin) === collector || linked(work, collector, work.net(s, pin), ['resistor'])));
    if (speaker) return { speaker, feeds: baseResistors(work, q) };
  }
  return undefined;
}

/** The run that hears a driven speaker, with its current and the base's recorded. */
const drivenRun = (work: Work, driven: { speaker: Component; feeds: Component[] }) =>
  work.bench({ seconds: 0.1, watchAmps: [driven.speaker.id, ...driven.feeds.map((r) => r.id)] });

/** The most a recorded current reaches, either way. */
function peak(trace: Float32Array | null): number {
  let most = 0;
  for (const amps of trace ?? []) most = Math.max(most, Math.abs(amps));
  return most;
}

/**
 * What the LED does over a few seconds, in amps, with every photocell in one
 * light and every switch one way. Slow things are read at 8,000 samples a
 * second. The dark run is long enough to count a blink of once a second, the
 * bright one to catch any blink that fast. Null without an LED.
 */
function watchLed(work: Work, light: 0 | 1, closed: 0 | 1): SignalReading | null {
  const leds = work.parts('led');
  if (leds.length === 0) return null;
  const run = work.bench({
    set: [...all(work, 'ldr', 'light', light), ...switches(work, closed)],
    seconds: light === 1 ? 1 : 3, sampleRate: 8000, watchAmps: leds.map((led) => led.id),
  });
  // The brightest LED at each moment: usually there is only the one
  const traces = leds.map((led) => run.ampsTrace(led.id)).filter((trace): trace is Float32Array => trace !== null);
  if (traces.length === 0) return null;
  const brightest = traces.length === 1 ? traces[0] : traces[0].map((_, i) => Math.max(...traces.map((trace) => trace[i])));
  return measureSignal(brightest, run.sampleRate, LIT);
}

const isOff = (led: SignalReading) => led.max < OFF;
/** Flashes a second, to one place: null for an LED that is not going on and off, or does so too slowly to count. */
const flashes = (led: SignalReading) =>
  (led.max > LIT && led.min < OFF && led.hertz !== null ? Math.round(led.hertz * 10) / 10 : null);

/** What an LED was seen to do, in words. `slow` is what to say of one that went on and off too few times to count. */
function seen(led: SignalReading, slow: string): string {
  if (isOff(led)) return 'off';
  if (led.min >= OFF) return 'lit all the time';
  const rate = flashes(led);
  if (rate === null) return slow;
  return `flashing ${rate < 10 ? rate.toFixed(1) : Math.round(rate)} times a second`;
}

/** A switch that lights the LED whatever the light, and leaves the night light alone when it is open. */
function always(work: Work): boolean {
  if (work.parts('switch').length === 0 || work.parts('ldr').length === 0 || work.parts(NPN).length === 0) return false;
  // The quick run first: a switch that is not wired in yet lights nothing
  const held = watchLed(work, 1, 1);
  if (!held || held.mean < FULL / 10) return false;
  const bright = watchLed(work, 1, 0), dark = watchLed(work, 0, 0);
  return bright !== null && dark !== null && isOff(bright) && dark.max > FULL;
}

// --- The circuits ---

interface Lamp {
  q: Component;
  limit: Component;
  led: Component;
  components: Component[];
  connections: Connection[];
}

/** The load and its switch: from +, 470 Ω and the LED, into the collector of a transistor at (x, y) whose emitter is on ground. */
function lamp(supply: Component, x: number, y: number): Lamp {
  const limit = resistor(470, x - 120, y - 220);
  const led = place('led', x, y - 120, { rotation: 90 });
  const q = place(NPN, x, y);
  const qGround = ground(x, y + 100);
  return {
    q, limit, led,
    components: [limit, led, q, qGround],
    connections: [
      connect(supply, POWER.PLUS, limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, q, TRANSISTOR.C),
      connect(q, TRANSISTOR.E, qGround, 0),
    ],
  };
}

/** The touch lamp: body contacts and 10 kΩ from + to the base. */
function touchLampCircuit(): Built {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const { q, components, connections } = lamp(supply, 620, 420);
  const pads = place('body-contact', 340, 420);
  const base = resistor(10000, 480, 420);
  return {
    components: [supply, supplyGround, ...components, pads, base],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      ...connections,
      connect(supply, POWER.PLUS, pads, 0),
      connect(pads, 1, base, 0),
      connect(base, 1, q, TRANSISTOR.B),
    ],
  };
}

/** The night light: 100 kΩ over a photocell, and 10 kΩ from where they meet to the base. */
function nightLightCircuit(): Built {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const { q, components, connections } = lamp(supply, 620, 420);
  const upper = resistor(100000, 400, 320, 90);
  const cell = place('ldr', 400, 520, { rotation: 90 });
  const cellGround = ground(400, 620);
  const base = resistor(10000, 500, 420);
  return {
    components: [supply, supplyGround, ...components, upper, cell, cellGround, base],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      ...connections,
      connect(supply, POWER.PLUS, upper, 0),
      connect(upper, 1, cell, 0),
      connect(cell, 1, cellGround, 0),
      connect(upper, 1, base, 0),
      connect(base, 1, q, TRANSISTOR.B),
    ],
  };
}

/**
 * What the class keeps: the night light that blinks. A slow oscillator feeds
 * the divider in place of +, and the switch ALWAYS, beside the transistor,
 * lights the LED whatever the light. It starts open: a night light.
 */
export function smallControlsBigKept(): Built {
  const supply = place('power', 200, 200);
  const supplyGround = ground(200, 300);
  // The oscillator of class 4, slowed to two blinks a second by a 22 µF capacitor
  const chip = place('cd40106', 460, 300);
  const timing = capacitor(22e-6, 300, 360, 90);
  const timingGround = ground(300, 460);
  const back1 = resistor(27000, 420, 480);
  const back2 = resistor(2200, 540, 480);
  // The night light, its divider fed from the oscillator's output
  const { q, components, connections } = lamp(supply, 900, 260);
  const upper = resistor(100000, 640, 260);
  const cell = place('ldr', 720, 380, { rotation: 90 });
  const cellGround = ground(720, 480);
  const base = resistor(10000, 800, 260);
  const hold = namedSwitch('ALWAYS', 1000, 260, false);
  hold.rotation = 90;
  const holdGround = ground(1000, 360);
  return {
    components: [supply, supplyGround, chip, timing, timingGround, back1, back2, ...components, upper, cell, cellGround, base, hold, holdGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, chip, CD40106.VDD),
      connect(chip, CD40106.VSS, supplyGround, 0),
      connect(chip, CD40106.A[0], timing, 0),
      connect(timing, 1, timingGround, 0),
      connect(chip, CD40106.A[0], back1, 0),
      connect(back1, 1, back2, 0),
      connect(back2, 1, chip, CD40106.Y[0]),
      ...connections,
      connect(chip, CD40106.Y[0], upper, 0),
      connect(upper, 1, cell, 0),
      connect(cell, 1, cellGround, 0),
      connect(upper, 1, base, 0),
      connect(base, 1, q, TRANSISTOR.B),
      connect(q, TRANSISTOR.C, hold, 0),
      connect(hold, 1, holdGround, 0),
    ],
  };
}

/** Class 11: a transistor lets a small current switch a large one, so a finger, a photocell or a chip can work a load it could never feed. */
export const smallControlsBig: ClassDefinition = {
  id: 'small-controls-big',
  number: 11,
  unit: 'Bigger sound',
  title: 'A small current controls a big one',
  promise: 'A lamp you switch on with a fingertip, then a light that comes on by itself when it gets dark.',
  startsFrom: 'The dimmer you kept in class 2: a supply, the photocell SHADE, a 470 Ω resistor and an LED.',
  start: sharingVoltageKept,

  build: [
    {
      id: 'clear',
      text: 'Take the photocell away. The app closes the wire behind it, so + goes straight to the 470 Ω.',
      how: 'Click the photocell and press Delete. What is left is the light of class 1 without its switch: play it and the LED is fully lit, at 14.5 mA.',
      done: (work) => ledNow(work) > FULL || lampSwitch(work) !== undefined,
    },
    {
      id: 'transistor',
      text: 'Drop a 2N3904 onto the wire from the LED to ground. Its C leg takes the LED and its E leg takes the ground.',
      how: 'Search for "2N3904". It is a transistor, and it has three legs: B, C and E. Drag the ground down first to make room. If the legs land the wrong way up, take its two wires off and wire it by hand: the LED\'s K to C, and E to ground. Leave B alone for now.',
      done: (work) => lampSwitch(work) !== undefined,
    },
    playStep('The LED stays dark. Nothing gets from C to E until something comes in at B.'),
    {
      id: 'contacts',
      text: 'Add body contacts and a 10 kΩ resistor. Wire + to the contacts, the contacts to the 10 kΩ, and the 10 kΩ to B.',
      how: 'Search for "body". These are the two plates of class 2 that a finger bridges. The contacts and the resistor are in series from + to B, so it does not matter which of them comes first.',
      done: (work) => touchLamp(work) || nightLight(work),
    },
    {
      id: 'touch',
      text: 'Play, and press on the contacts. The LED lights. Drag upwards while you hold to press harder.',
      how: 'In class 2 a finger in line with this LED could barely make it glow. Now the finger only has to reach B.',
      done: (work) => (work.situation.playing && touchLamp(work)
        && work.parts('body-contact').some((pads) => Number(pads.parameters.touch) > 0)) || nightLight(work),
    },
    {
      id: 'feed',
      text: 'Now the night light. Change the body contacts for a 100 kΩ resistor. The LED lights and stays lit.',
      how: 'Double-click the contacts and pick the resistor from the list. Then click it and type 100k into Resistance. B now gets its current all the time, through 100 kΩ and 10 kΩ in series.',
      done: (work) => {
        const q = lampSwitch(work), supply = plus(work);
        const fed = q !== undefined && supply !== null && linked(work, supply, work.net(q, TRANSISTOR.B), ['resistor']);
        return (fed && ledNow(work) > FULL) || nightLight(work);
      },
    },
    {
      id: 'cell',
      text: 'Add a photocell from the point where the two resistors meet to ground.',
      how: 'Search for "photocell". Wire one leg to the wire between the 100 kΩ and the 10 kΩ: let go of the new wire on top of that one and the app joins them. Wire the other leg to ground. The 100 kΩ and the photocell are now a divider, and B hangs from its middle.',
      done: nightLight,
    },
    {
      id: 'dusk',
      text: 'Play, and drag the photocell\'s dial all the way up: bright light. The LED goes out. Drag it down again and the LED comes back.',
      how: 'The dial stands for the light in the room, as in class 2. This time less light means more LED.',
      done: (work) => work.situation.playing && nightLight(work) && ledNow(work) < OFF,
    },
    {
      id: 'read',
      text: 'Click the wire that goes into B, and move the dial again with an eye on the meter.',
      how: 'In bright light it reads 89.1 mV. A millivolt (mV) is a thousandth of a volt, so that is 0.09 V. As the light falls the voltage climbs, and then it stops: however dark it gets, B never goes above 742 mV.',
      done: (work) => {
        const q = lampSwitch(work);
        return work.situation.playing && q !== undefined && nightLight(work) && work.metered(q, TRANSISTOR.B);
      },
    },
  ],

  why: [
    {
      title: 'Three legs',
      text: 'A transistor has three legs: the base (B), the collector (C) and the emitter (E). The LED\'s current has to pass through it, in at the collector and out at the emitter, and the transistor decides how much may pass. It goes by the current coming in at the base. With none, it lets nothing through.',
    },
    {
      title: 'Gain',
      text: 'A small current into the base lets a much larger one flow from collector to emitter. The lightest touch on the contacts passes 4.3 µA into the base, and the LED gets 1.8 mA: over 400 times as much. That number is the transistor\'s gain. In class 2 the same finger was in line with the LED, and pressed as hard as it could it got the LED 0.14 mA.',
    },
    {
      title: 'Fully on',
      text: 'Press hard and the base gets 138 µA. 400 times that would be 55 mA, but the LED and its 470 Ω cannot pass more than 14.2 mA, however much the transistor would allow. The transistor is then fully on. It acts as a closed switch: only 0.16 V is left between C and E.',
    },
    {
      title: 'The base is a diode',
      text: 'From base to emitter a transistor is a diode, the part of class 6. No current goes in until the base is about 0.6 V above the emitter, and from there on the voltage hardly rises: it was 0.74 V with the LED fully lit. That is what the 10 kΩ is for. With no resistor in the way, nothing would limit the current into the base.',
    },
    {
      title: 'The night light',
      text: 'The 100 kΩ and the photocell are a divider. In bright light the photocell is 1 kΩ and the point between them sits at 0.09 V: far below 0.6 V, so the base gets nothing and the LED is off. In the dark the photocell is 1 MΩ and takes almost nothing. What comes through the 100 kΩ goes into the base instead: 74 µA, plenty to turn the transistor fully on.',
    },
    {
      title: 'A switch that a current works',
      text: 'Used like this a transistor is a switch, closed by a small current instead of a hand. What it switches is its load: here the LED and its resistor. Whatever is in control, a finger or a photocell or a chip, only has to supply the base.',
    },
  ],

  tries: [
    {
      id: 'fade',
      title: 'Dusk',
      question: 'Bring the light down slowly from full. The LED will…',
      options: ['Brighten evenly, all the way down', 'Stay off, then come on over a short stretch of the dial', 'Snap fully on at one exact point'],
      answer: 1,
      change: 'Play. Drag the photocell\'s dial to the top, then down a little at a time. Stop where the LED is lit, but not fully.',
      made: (work) => nightLight(work) && ledNow(work) > LIT && ledNow(work) < 0.012,
      result: (work) => {
        const run = work.run();
        const led = ledAmps(work, run), base = baseAmps(work, run, lampSwitch(work));
        const gain = base > 0 ? `, from ${formatAmps(base)} into the base: ${Math.round(led / base / 10) * 10} times as much` : '';
        return `${formatAmps(led)} in the LED${gain}. The LED is off with the dial above three quarters and fully lit below half. In the stretch between, the transistor is partly on, and the LED gets the base current times the gain.`;
      },
    },
    {
      id: 'swap',
      title: 'The other way up',
      question: 'Swap the photocell and the 100 kΩ, so the photocell is the upper half of the divider. Now the LED will…',
      options: ['Light in the dark, as before', 'Light in the light', 'Stay off whatever the light'],
      answer: 1,
      change: 'Double-click the 100 kΩ and pick LDR from the list. Double-click the old photocell, pick the resistor, then click it and type 100k into Resistance. Play, and move the dial.',
      made: dayLight,
      result: (work) => {
        const at = (light: number) => formatAmps(ledWith(work, 'ldr', 'light', light));
        return `${at(1)} in bright light, and still ${at(0.25)} at a quarter light. In the dark it dims to ${at(0)} but does not go out: a dark photocell is 1 MΩ, and 1 MΩ over 100 kΩ still leaves the base ${formatVolts(baseVolts(work, 0))}. The same parts, the other way up, are the opposite switch. Swap them back before going on.`;
      },
    },
    {
      id: 'speaker',
      title: 'A speaker straight on a chip',
      question: 'Build class 4\'s 440 Hz oscillator beside the night light, and wire a speaker straight from its output to ground. You will hear…',
      options: ['A loud note', 'A quiet note', 'Nothing at all'],
      answer: 2,
      change: 'Add a CD40106: VDD to +, VSS to ground. 27 kΩ and 2.2 kΩ in series from 1Y back to 1A, and 100 nF from 1A to ground. Then a speaker: one leg to 1Y, the other to ground. Play.',
      made: (work) => {
        const bare = bareSpeaker(work);
        return bare !== undefined && Math.abs(bareRun(work, bare.output).amps(bare.speaker.id)) > 5e-3;
      },
      result: (work) => {
        const { speaker, output } = bareSpeaker(work)!;
        const run = bareRun(work, output);
        const volts = reading(run, output[0], output[1]);
        const stuck = swing(run.sound) < 0.02;
        return `${stuck ? 'Silence' : 'Next to nothing'}. The output is stuck at ${formatVolts(volts.max)}, and the speaker takes a steady ${formatAmps(Math.abs(run.amps(speaker.id)))}. A speaker is only 8 Ω. The chip's output is not a perfect switch: it has about 280 Ω of its own inside. 280 Ω over 8 Ω is a divider, and 9 V × 8 ÷ 288 is 0.25 V. The input never climbs to its 5.3 V threshold, so the oscillator has stopped. In class 4 an LED was load enough to pull this output down a little. A speaker pulls it nearly to ground.`;
      },
    },
    {
      id: 'driver',
      title: 'Give it a transistor',
      question: 'Let the chip work a second transistor, and the transistor work the speaker. How much current will the chip have to supply?',
      options: ['All of the speaker\'s current, as before', 'Under a milliamp: only the base', 'None at all'],
      answer: 1,
      change: 'Take the speaker off the chip. Add a second 2N3904: E to ground, and 1Y through a 10 kΩ to B. Wire one leg of the speaker to +, and the other through a 220 Ω to C. Play.',
      made: (work) => {
        const driven = drivenSpeaker(work);
        if (!driven) return false;
        const { sound } = drivenRun(work, driven);
        return sound.hertz !== null && swing(sound) > 0.02;
      },
      result: (work) => {
        const driven = drivenSpeaker(work)!;
        const run = drivenRun(work, driven);
        const base = driven.feeds.length === 1 ? peak(run.ampsTrace(driven.feeds[0].id)) : 0;
        const share = base > 0 ? ` The chip supplies only ${formatAmps(base)}, into the base. The supply does the rest.` : '';
        return `A note: ${formatHertz(run.sound.hertz ?? 0)}. The speaker gets ${formatAmps(peak(run.ampsTrace(driven.speaker.id)))} at a time.${share} That is a little under the 441 Hz the oscillator makes left alone, because even a base is a small load on 1Y. Without the 220 Ω the speaker would get three times the current and the transistor would have to turn the rest of the 9 V into heat. The app lets you. A real 2N3904 would get hot, so on a real board the resistor stays. Now take the speaker, its transistor and their two resistors away. Leave the oscillator: the check wants it.`;
      },
    },
  ],

  check: {
    goal: 'Make the night light blink: off in bright light, flashing one to three times a second in the dark.',
    reading: (work) => {
      const dark = watchLed(work, 0, 0), bright = watchLed(work, 1, 0);
      if (!dark || !bright) return null;
      return `In the dark: ${seen(dark, 'on and off, too slowly to count')}. In bright light: ${seen(bright, 'on and off')}.`;
    },
    passed: (work) => {
      const dark = watchLed(work, 0, 0), bright = watchLed(work, 1, 0);
      if (!dark || !bright || !isOff(bright)) return false;
      const rate = flashes(dark);
      return rate !== null && rate >= 1 && rate <= 3;
    },
    hint: 'Calculated, not measured: the oscillator on the canvas runs at 440 Hz, which is 220 times faster than 2 Hz. A capacitor 220 times larger slows it by that much: 22 µF where it has 100 nF. Then let it feed the divider. Take the top of the 100 kΩ off + and wire it to the oscillator\'s output, 1Y. While the output is low, nothing reaches the base. While it is high, the photocell decides, as before.',
  },

  keep: [
    {
      id: 'always',
      text: 'Add a switch beside the transistor: one side to C, the other to ground.',
      how: 'Wire it to the collector of the transistor that has the LED. Closed, it does the transistor\'s job by hand: the LED is lit whatever the photocell says. Open, the night light is left to itself. Two switches in parallel: either one will light the LED.',
      done: always,
    },
    ...keepSteps({
      type: 'switch', name: 'ALWAYS', what: 'the switch', has: 'led',
      why: 'On the cover it reads as what it does: ALWAYS on, or only in the dark.',
    }),
  ],

  words: [
    { word: 'Transistor', meaning: 'A part with three legs that lets a small current control a large one.' },
    { word: 'Base, collector, emitter', meaning: 'A transistor\'s legs: B, C and E. The large current goes in at the collector and out at the emitter. The small one that controls it goes in at the base.' },
    { word: 'Gain', meaning: 'How many times larger the collector\'s current is than the base\'s: several hundred for a 2N3904.' },
    { word: 'Fully on', meaning: 'A transistor given more base current than its load needs. It acts as a closed switch.' },
    { word: 'Load', meaning: 'Whatever a circuit has to feed current to: an LED, a speaker. A heavy load is one that asks for a lot.' },
    { word: 'Speaker', meaning: 'Turns a current that goes back and forth into sound. Its coil is only 8 Ω: a heavy load.' },
    { word: 'Millivolt', meaning: 'A thousandth of a volt (mV).' },
  ],

  circuit: nightLightCircuit,
  stages: [
    { upTo: 'touch', circuit: touchLampCircuit },
  ],
};
