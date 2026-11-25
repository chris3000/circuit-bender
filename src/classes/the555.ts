import { formatHertz, formatVolts } from '@/utils/readings';
import type { Component, Connection } from '@/types/circuit';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Built, ClassDefinition } from './types';
import { GROUND, type Work } from './Work';
import {
  all, capacitor, CD40106, connect, ground, isNamed, keepSteps, LED, linked, LIT, NE555, place, playStep, plus, POWER, reading,
  resistor, spans, switches,
} from './kit';

// --- What this class asks of the learner's circuit ---

const timers = (work: Work) => work.parts('ne555');
const hasSound = (work: Work) => work.parts('audio-output').length + work.parts('speaker').length + work.parts('piezo').length > 0;

/** A 555 with its two power pins wired. */
function powered(work: Work, timer: Component): boolean {
  return work.net(timer, NE555.VCC) === plus(work) && work.grounded(timer, NE555.GND);
}

// Something slow: a blink

/** Long enough to see a light blink twice, read coarsely: it is slow. */
const BLINK = { seconds: 2.5, sampleRate: 8000 };
/** The blinker runs at 1.46 Hz. Anything from 1.2 to 1.8 is it. */
const isBlink = (hertz: number | null) => hertz !== null && hertz >= 1.2 && hertz <= 1.8;
/** The tone runs at 1.38 kHz. Anything within a tenth is it. */
const isTone = (hertz: number | null) => hertz !== null && hertz >= 1250 && hertz <= 1520;

/** The moments, in seconds, at which a recorded current comes on: rises past a tenth of a milliamp, having been well below it. */
function comesOn(trace: Float32Array | null, sampleRate: number): number[] {
  const at: number[] = [];
  if (!trace) return at;
  let on = trace[0] > LIT;
  for (let i = 1; i < trace.length; i++) {
    if (!on && trace[i] > LIT) { on = true; at.push(i / sampleRate); } else if (on && trace[i] < LIT / 10) on = false;
  }
  return at;
}

/** How fast the fastest 555 output runs, in hertz, if any runs fast enough to hear. */
function fast(work: Work): number | null {
  if (timers(work).length === 0) return null;
  const run = work.bench({ watch: timers(work).map((timer) => [timer, NE555.OUT] as const) });
  const hertz = timers(work).map((timer) => reading(run, timer, NE555.OUT).hertz ?? 0);
  return Math.max(...hertz) > 20 ? Math.max(...hertz) : null;
}

/** The circuit watched for long enough to see a blink: every 555's output and every LED's current. */
function watched(work: Work): BenchRun {
  return work.bench({
    ...BLINK,
    watch: timers(work).map((timer) => [timer, NE555.OUT] as const),
    watchAmps: work.parts('led').map((led) => led.id),
  });
}

/** A 555 whose output goes high and low about one and a half times a second. */
function ticks(work: Work): boolean {
  if (timers(work).length === 0 || fast(work) !== null) return false;
  const run = watched(work);
  return timers(work).some((timer) => isBlink(reading(run, timer, NE555.OUT).hertz));
}

/** An LED that blinks at that speed. */
function blinks(work: Work): boolean {
  if (timers(work).length === 0 || work.parts('led').length === 0 || fast(work) !== null) return false;
  const run = watched(work);
  return work.parts('led').some((led) => {
    const on = comesOn(run.ampsTrace(led.id), run.sampleRate);
    return on.length >= 2 && isBlink(1 / (on[on.length - 1] - on[on.length - 2]));
  });
}

// A tap of the button, and what follows

/** Every button pressed a tenth of a second into a run and let go a tenth of a second later. The run is long enough for a ring of 1.2 s to end in. */
const TAP = { at: 0.1, held: 0.1, seconds: 1.6, sampleRate: 8000 };

function tapped(work: Work): BenchRun {
  return work.bench({
    seconds: TAP.seconds, sampleRate: TAP.sampleRate,
    set: all(work, 'pushbutton', 'closed', 0),
    watchAmps: work.parts('led').map((led) => led.id),
    events: work.parts('pushbutton').flatMap((button) => [
      { at: TAP.at, componentId: button.id, parameter: 'closed', value: 1 },
      { at: TAP.at + TAP.held, componentId: button.id, parameter: 'closed', value: 0 },
    ]),
  });
}

/** How long something lasted after the tap, in seconds; null if it was still going when the run ended. */
type Lasting = { seconds: number | null };

/**
 * The light of a one-shot: an LED that is dark until the tap, comes on with
 * it and stays on after the button is let go. Null if no LED does that.
 */
function flash(work: Work): Lasting | null {
  if (work.parts('pushbutton').length === 0 || work.parts('led').length === 0 || timers(work).length === 0) return null;
  const run = tapped(work);
  const tap = Math.round(TAP.at * run.sampleRate), letGo = Math.round((TAP.at + TAP.held) * run.sampleRate);
  for (const led of work.parts('led')) {
    const trace = run.ampsTrace(led.id);
    if (!trace) continue;
    let from = 0;
    while (from < trace.length && trace[from] <= LIT) from++;
    // Lit before the tap, or not within a twentieth of a second of it: not set off by the button
    if (from < tap || from > tap + run.sampleRate / 20) continue;
    let to = from;
    while (to < trace.length && trace[to] > LIT) to++;
    // Out again by the time the button is let go, give or take: that is only a button and a light
    if (to < letGo + run.sampleRate / 10) continue;
    return { seconds: to < trace.length ? (to - from) / run.sampleRate : null };
  }
  return null;
}

/** A one-shot that works, and is over before the run is. */
const oneShot = (work: Work) => (flash(work)?.seconds ?? null) !== null;

// A sound: when it starts and stops, and its pitch

/** The bench hands over its sound 16 samples late: that is how long the filter that smooths it takes. */
const SOUND_LAG = 16;
/** A rail-to-rail swing is ±0.5. Less than a hundredth is silence. */
const QUIET = 0.01;
/** A pitch is read over this many cycles. */
const SPAN = 24;

/**
 * The moments, in seconds, at which a recorded sound rises through its middle:
 * one for each cycle of a tone. The sound has had its steady level taken out,
 * so its middle is zero. A cycle counts once it has been as far below as above.
 */
function cycles(run: BenchRun): number[] {
  const trace = run.soundTrace;
  let sum = 0, count = 0;
  for (let i = 0; i < trace.length; i++) {
    if (Math.abs(trace[i]) > QUIET) { sum += trace[i] * trace[i]; count++; }
  }
  if (count === 0) return [];
  const level = 0.3 * Math.sqrt(sum / count);
  const at: number[] = [];
  let high = trace[0] > level;
  for (let i = 1; i < trace.length; i++) {
    const v = trace[i];
    if (!high && v > level) {
      high = true;
      const before = trace[i - 1];
      at.push(((before < level ? i - 1 + (level - before) / (v - before) : i) - SOUND_LAG) / run.sampleRate);
    } else if (high && v < -level) {
      high = false;
    }
  }
  return at;
}

/** A sound as it was heard in a run. */
interface Heard {
  /** When it started, in seconds. */
  from: number;
  /** When it stopped; null if it was still sounding when the run ended. */
  to: number | null;
  /** The lowest and the highest pitch it held. A steady tone has the two alike, a siren has them apart. */
  low: number;
  high: number;
}

function heardIn(run: BenchRun): Heard | null {
  const at = cycles(run);
  if (at.length < 4) return null;
  const last = at[at.length - 1];
  // The pitch over each stretch of a few cycles (fewer in a short recording)...
  const span = Math.max(1, Math.min(SPAN, Math.floor(at.length / 4)));
  const local: number[] = [];
  for (let i = 0; i + span < at.length; i++) local.push(span / (at[i + span] - at[i]));
  const sorted = [...local].sort((a, b) => a - b);
  // ...and the longest time it stays near a pitch, timed from end to end
  const held = (target: number): number => {
    let best = 0, bestFrom = 0, from = -1;
    for (let i = 0; i <= local.length; i++) {
      const near = i < local.length && Math.abs(local[i] - target) <= target * 0.02;
      if (near && from < 0) from = i;
      if (!near && from >= 0) {
        if (i - from > best) { best = i - from; bestFrom = from; }
        from = -1;
      }
    }
    return (best - 1 + span) / (at[bestFrom + best - 1 + span] - at[bestFrom]);
  };
  const low = held(sorted[Math.floor((sorted.length - 1) * 0.1)]);
  const high = held(sorted[Math.floor((sorted.length - 1) * 0.9)]);
  const ended = last < run.seconds - 0.02;
  return { from: at[0], to: ended ? last + 1 / high : null, low, high };
}

/** One pitch, near enough. */
const steady = (sound: Heard) => sound.high / sound.low < 1.03;
/** A pitch, or the two a sound moves between, in words. */
const pitch = (sound: Heard) => (steady(sound) ? formatHertz(sound.low) : `${formatHertz(sound.low)} and ${formatHertz(sound.high)}`);

/**
 * The controls put for listening: every button held down, so that a tone a
 * button sets off sounds all the way through, and every switch one way (or
 * left as it stands).
 */
const listening = (work: Work, closed?: 0 | 1) =>
  [...(closed === undefined ? [] : switches(work, closed)), ...all(work, 'pushbutton', 'closed', 1)];

/**
 * The pitch of the sound, in hertz, read closely over a moment of it; null
 * for silence. For a tone that holds still: of a siren it hears only the
 * note it starts on.
 */
function note(work: Work, closed?: 0 | 1): number | null {
  if (!hasSound(work) || timers(work).length === 0) return null;
  return heardIn(work.bench({ seconds: 0.06, set: listening(work, closed) }))?.high ?? null;
}

/** The tone can be heard: what comes out is at its pitch. */
const heard = (work: Work) => isTone(note(work));

/**
 * The sound left to run for long enough to hear a slow oscillator turn over.
 * It is read coarsely, which is quick and tells a siren from a steady tone,
 * but a pitch read this way can be a part in a hundred low.
 */
function sounding(work: Work, closed: 0 | 1): Heard | null {
  if (!hasSound(work) || timers(work).length === 0) return null;
  return heardIn(work.bench({ seconds: 1.3, sampleRate: 8000, set: listening(work, closed) }));
}

/** The same, read closely. It takes a tenth of a second to work out: for a result, not for a step. */
function soundingClosely(work: Work, closed: 0 | 1): Heard | null {
  return heardIn(work.bench({ seconds: 1.1, set: listening(work, closed) }));
}

/** The resistors that lead into a 555's CTRL: one leg on CTRL, or on the far side of a switch from it. */
function intoCtrl(work: Work): Component[] {
  const nets = new Set<string>();
  for (const timer of timers(work)) {
    const ctrl = work.net(timer, NE555.CTRL);
    nets.add(ctrl);
    for (const part of work.parts('switch')) {
      if (work.net(part, 0) === ctrl) nets.add(work.net(part, 1));
      if (work.net(part, 1) === ctrl) nets.add(work.net(part, 0));
    }
  }
  return work.parts('resistor').filter((r) => nets.has(work.net(r, 0)) !== nets.has(work.net(r, 1)));
}

/** A siren: with the switches closed the tone moves between two pitches at least a tenth apart. */
function wails(work: Work): boolean {
  if (work.parts('cd40106').length === 0 || intoCtrl(work).length === 0) return false;
  const sound = sounding(work, 1);
  return sound !== null && sound.high / sound.low > 1.1;
}

/**
 * The doorbell: what is heard when the button is tapped, with the switches
 * as they stand. When and for how long comes from the tap; the pitch of a
 * steady tone is then read closely.
 */
function ring(work: Work): Heard | null {
  if (!hasSound(work) || timers(work).length === 0) return null;
  const sound = heardIn(tapped(work));
  if (!sound || !steady(sound)) return sound;
  const close = note(work) ?? sound.low;
  return { ...sound, low: close, high: close };
}

// How it is wired, where a step is about wiring

/** A 555 set up to wait: DISCH and THRES joined, a resistor from + to there and a capacitor from there to ground. */
function waits(work: Work, timer: Component): boolean {
  const supply = plus(work);
  const top = work.net(timer, NE555.THRES);
  return supply !== null && work.net(timer, NE555.DISCH) === top
    && work.parts('resistor').some((r) => spans(work, r, supply, top))
    && work.parts('capacitor').some((c) => spans(work, c, top, GROUND));
}

/** A 555 with a button from TRIG to ground and a resistor from + to TRIG. */
function hasTrigger(work: Work, timer: Component): boolean {
  const supply = plus(work);
  const trig = work.net(timer, NE555.TRIG);
  return supply !== null
    && work.parts('pushbutton').some((button) => spans(work, button, trig, GROUND))
    && work.parts('resistor').some((r) => spans(work, r, supply, trig));
}

/** A CD40106 with its power wired and one inverter made into an oscillator: a resistor from its output back to its input, a capacitor from the input to ground. */
function slowOscillator(work: Work): boolean {
  return work.parts('cd40106').some((chip) => work.net(chip, CD40106.VDD) === plus(work) && work.grounded(chip, CD40106.VSS)
    && CD40106.A.some((a, n) => {
      const input = work.net(chip, a);
      return linked(work, work.net(chip, CD40106.Y[n]), input, ['resistor'])
        && work.parts('capacitor').some((c) => spans(work, c, input, GROUND));
    }));
}

/** The 555 whose CTRL a resistor joins to +, with any switch in the line closed. */
function pushedUp(work: Work): Component | undefined {
  const supply = plus(work);
  if (supply === null) return undefined;
  return timers(work).find((timer) => linked(work, work.net(timer, NE555.CTRL), supply, ['resistor', 'switch'])
    // A wire straight from CTRL to + is not a push, it is a short
    && work.net(timer, NE555.CTRL) !== supply);
}

const seconds = (value: number) => `${value.toFixed(2)} s`;

// --- The circuits ---

/** What is on the canvas at each point of the class. */
interface Plan {
  /** The first 555's second resistor and its capacitor: they set how fast it runs. */
  rb: number;
  farads: number;
  /** What the first 555's output goes to: 1 kΩ and an LED, or an Audio Out. */
  out: 'led' | 'sound';
  /** The second 555 beside it, a one-shot with a button and an LED. */
  oneShot?: boolean;
  /** The slow oscillator that pushes the first 555's CTRL, through 10 kΩ and a switch. */
  siren?: boolean;
  /** The first 555's RESET on the one-shot's output, not on +: the doorbell. */
  bell?: boolean;
  /** The switch and the button with the names they are kept under. */
  named?: boolean;
}

function build(plan: Plan): Built {
  const components: Component[] = [];
  const connections: Connection[] = [];
  const add = <T extends Component>(part: T): T => { components.push(part); return part; };
  const wire = (a: Component, pinA: number, b: Component, pinB: number) => { connections.push(connect(a, pinA, b, pinB)); };

  // The supply, and the first 555 running free: + → RA → DISCH → RB → THRES and TRIG → C → ground
  const supply = add(place('power', 100, 260));
  wire(supply, POWER.MINUS, add(ground(100, 360)), 0);
  const timer = add(place('ne555', 440, 280));
  const ra = add(resistor(10e3, 320, 160, 90));
  const rb = add(resistor(plan.rb, 320, 280, 90));
  const cap = add(capacitor(plan.farads, 320, 420, 90));
  wire(supply, POWER.PLUS, timer, NE555.VCC);
  wire(timer, NE555.GND, add(ground(520, 180)), 0);
  wire(supply, POWER.PLUS, ra, 0);
  wire(ra, 1, timer, NE555.DISCH);
  wire(rb, 0, timer, NE555.DISCH);
  wire(rb, 1, timer, NE555.THRES);
  wire(timer, NE555.THRES, timer, NE555.TRIG);
  wire(cap, 0, timer, NE555.TRIG);
  wire(cap, 1, add(ground(320, 500)), 0);

  if (plan.out === 'led') {
    const limit = add(resistor(1000, 580, 260));
    const led = add(place('led', 680, 360, { rotation: 90 }));
    wire(timer, NE555.OUT, limit, 0);
    wire(limit, 1, led, LED.A);
    wire(led, LED.K, add(ground(680, 440)), 0);
  } else {
    wire(timer, NE555.OUT, add(place('audio-output', 580, 300)), 0);
  }

  // The second 555, a one-shot: + → R → DISCH and THRES → C → ground, TRIG held high by 10 kΩ until the button grounds it
  let shot: Component | null = null;
  if (plan.oneShot) {
    shot = add(place('ne555', 880, 280));
    const r = add(resistor(100e3, 760, 160, 90));
    const c = add(capacitor(10e-6, 760, 340, 90));
    const pullUp = add(resistor(10e3, 680, 500));
    const button = add(place('pushbutton', 800, 580, { rotation: 90, ...(plan.named ? { label: 'RING' } : {}) }));
    const limit = add(resistor(1000, 1020, 260));
    const led = add(place('led', 1120, 360, { rotation: 90 }));
    wire(timer, NE555.VCC, shot, NE555.VCC);
    wire(shot, NE555.RESET, shot, NE555.VCC);
    wire(shot, NE555.GND, add(ground(960, 180)), 0);
    wire(supply, POWER.PLUS, r, 0);
    wire(r, 1, shot, NE555.DISCH);
    wire(shot, NE555.DISCH, shot, NE555.THRES);
    wire(c, 0, shot, NE555.THRES);
    wire(c, 1, add(ground(760, 420)), 0);
    wire(supply, POWER.PLUS, pullUp, 0);
    wire(pullUp, 1, shot, NE555.TRIG);
    wire(button, 0, shot, NE555.TRIG);
    wire(button, 1, add(ground(800, 660)), 0);
    wire(shot, NE555.OUT, limit, 0);
    wire(limit, 1, led, LED.A);
    wire(led, LED.K, add(ground(1120, 440)), 0);
  }

  // RESET is what lets the first 555 run: + for always, the one-shot's output for a doorbell
  if (plan.bell && shot) wire(shot, NE555.OUT, timer, NE555.RESET);
  else wire(timer, NE555.RESET, timer, NE555.VCC);

  // The slow oscillator of class 6, and its way into CTRL
  if (plan.siren) {
    const chip = add(place('cd40106', 240, 700));
    const feedback = add(resistor(1e6, 240, 840));
    const slowCap = add(capacitor(1e-6, 120, 720, 90));
    const push = add(resistor(10e3, 400, 660));
    const wail = add(place('switch', 520, 660, { parameters: { closed: 1 }, ...(plan.named ? { label: 'WAIL' } : {}) }));
    wire(supply, POWER.PLUS, chip, CD40106.VDD);
    wire(chip, CD40106.VSS, add(ground(340, 580)), 0);
    wire(chip, CD40106.Y[0], feedback, 1);
    wire(feedback, 0, chip, CD40106.A[0]);
    wire(slowCap, 0, chip, CD40106.A[0]);
    wire(slowCap, 1, add(ground(120, 800)), 0);
    wire(chip, CD40106.Y[0], push, 0);
    wire(push, 1, wail, 0);
    wire(wail, 1, timer, NE555.CTRL);
  }

  return { components, connections };
}

/** The plain 555 tone with its Audio Out, as it stands half way through the build. Class 10 starts from it. */
export const the555Tone = (): Built => build({ rb: 47e3, farads: 10e-9, out: 'sound' });

/** What the class keeps: the doorbell that wails. A button named RING sets off the tone, a switch named WAIL in the line to CTRL makes it a siren. */
export const the555Kept = (): Built => build({ rb: 100e3, farads: 10e-9, out: 'sound', oneShot: true, siren: true, bell: true, named: true });

/** Class 9: one timer chip as a blinker, a tone, a one-shot and a siren. */
export const the555: ClassDefinition = {
  id: 'the-555',
  number: 9,
  unit: 'Logic and rhythm',
  title: 'The 555',
  promise: 'A timer chip three ways: a blinker that turns into a tone, a light that stays on for exactly as long as you say, and a siren. Then the Atari Punk Console.',
  startsFrom: 'An empty canvas.',

  build: [
    {
      id: 'chip',
      text: 'Put down a power supply and a ground, and wire the supply\'s − pin to the ground. Add an NE555. Wire its VCC pin to +, its GND pin to ground and its RESET pin to +.',
      how: 'Search the shelf for "555". It has eight pins: hold the pointer over one to see its name. VCC and GND are its power pins, the VDD and VSS of the chips you know. RESET on + lets it run.',
      done: (work) => timers(work).some((timer) => powered(work, timer) && work.net(timer, NE555.RESET) === plus(work)) || fast(work) !== null || ticks(work),
    },
    {
      id: 'timing',
      text: 'Three parts in a line set its speed. Wire a 10 kΩ resistor from + to DISCH, a 100 kΩ from DISCH to THRES and a 4.7 µF capacitor from THRES to ground. Then wire THRES to TRIG.',
      how: 'Search for 10k, 100k and 4.7u. The capacitor will fill through both resistors. THRES and TRIG both watch it.',
      done: (work) => fast(work) !== null || ticks(work),
    },
    {
      id: 'led',
      text: 'From OUT wire a 1 kΩ resistor, then an LED, then ground.',
      how: 'The resistor goes to the LED\'s A leg and the K leg goes to ground, as in class 1.',
      done: (work) => blinks(work) || heard(work),
    },
    playStep('The LED blinks about three times in two seconds. Click the wire on OUT: the meter reads 1.46 Hz.'),
    {
      id: 'probe',
      text: 'Put a probe on the capacitor: right-click the wire on its upper leg. Watch the scope.',
      how: 'Set the scope\'s Time/div to 200 ms. The line climbs to 6 V while the LED is lit and falls back to 3 V while it is dark, over and over.',
      done: (work) => work.situation.playing && timers(work).some((timer) => work.probed(timer, NE555.THRES) || work.probed(timer, NE555.TRIG)),
    },
    {
      id: 'faster',
      text: 'Now make it about a thousand times faster. Change the 100 kΩ to 47 kΩ and the 4.7 µF to 10 nF.',
      how: 'Click each part and type 47k or 10n into its value, at the top right. The LED seems to shine steadily, only dimmer: it is blinking far too fast to see.',
      done: (work) => isTone(fast(work)),
    },
    {
      id: 'listen',
      text: 'Take away the LED, then its 1 kΩ, and wire an Audio Out to OUT in their place.',
      how: 'Click a part and press Delete. Then search the shelf for "audio": its one pin goes to OUT. The blink has become a note, as it did in class 4. The meter reads 1.38 kHz: a kilohertz (kHz) is a thousand hertz.',
      done: heard,
    },
    {
      id: 'second',
      text: 'Leave the tone where it is. Beside it add a second NE555: VCC and RESET to +, GND to ground. Wire a 100 kΩ from + to its DISCH, wire DISCH to THRES, and wire a 10 µF capacitor from THRES to ground.',
      how: 'One resistor this time, and THRES goes to DISCH, not to TRIG. TRIG is for the next step.',
      done: (work) => timers(work).some((timer) => powered(work, timer) && waits(work, timer)) || oneShot(work),
    },
    {
      id: 'button',
      text: 'Wire a 10 kΩ from + to the second 555\'s TRIG, and a push button from TRIG to ground.',
      how: 'The resistor holds TRIG high. The button pulls it down to ground for as long as it is held.',
      done: (work) => timers(work).some((timer) => waits(work, timer) && hasTrigger(work, timer)) || oneShot(work),
    },
    {
      id: 'lamp',
      text: 'From the second 555\'s OUT wire a 1 kΩ, then an LED, then ground. Play, and tap the button.',
      how: 'Click the button on the canvas, as briefly as you like. The LED stays on for 1.10 s every time, then goes out and waits for the next tap. The tone carries on all the while.',
      done: oneShot,
    },
    {
      id: 'slow',
      text: 'Now a slow oscillator, the one from class 6. Add a CD40106 with VDD on + and VSS on ground. Wire 1 MΩ from its 1Y back to its 1A, and 1 µF from 1A to ground.',
      how: 'It turns over 1.3 times a second. Nothing is listening to it yet.',
      done: (work) => slowOscillator(work) || wails(work),
    },
    {
      id: 'ctrl',
      text: 'Wire a 10 kΩ from the CD40106\'s 1Y to the CTRL pin of the first 555, the one that makes the tone.',
      how: 'CTRL has had nothing on it until now. The tone starts to jump between two pitches: a siren.',
      done: wails,
    },
    {
      id: 'wail',
      text: 'Put a switch into the wire between that 10 kΩ and CTRL. Open, the tone holds still. Closed, it wails.',
      how: 'Drag a switch from the shelf onto the wire and let go when the wire lights up: it goes into the wire. Click the switch to work it.',
      done: (work) => {
        if (work.parts('switch').length === 0 || !wails(work)) return false;
        const open = sounding(work, 0);
        return open !== null && steady(open);
      },
    },
  ],

  why: [
    {
      title: 'A timer',
      text: 'The 555 is the oscillator of class 4 with its workings brought out to pins. THRES and TRIG watch the capacitor. While OUT is high the capacitor fills from + through both resistors. When it reaches two thirds of the supply, 6 V, OUT goes low and DISCH becomes a way to ground: the capacitor empties through the second resistor alone. At one third, 3 V, OUT goes high, DISCH lets go and it fills again. That is the line on the scope. Filling goes through more resistance than emptying and takes a little longer, so the LED was lit 52% of the time. A 555 wired to go round like this for ever is called astable: it is never stable.',
    },
    {
      title: 'How fast',
      text: 'Frequency = 1.44 ÷ ((RA + 2 × RB) × C). RA is the resistor from +, RB the one after it. RB counts twice because the capacitor uses it both ways. The blinker: 1.44 ÷ (210,000 Ω × 0.0000047 F) = 1.46 Hz. The tone: 1.44 ÷ (104,000 Ω × 0.00000001 F) = 1,385 Hz, the 1.38 kHz on the meter.',
    },
    {
      title: 'Waiting',
      text: 'The second 555 cannot start itself. DISCH holds its capacitor empty and OUT stays low. The 10 kΩ holds TRIG high: a pull-up, the pull-down of class 7 the other way up. The button takes TRIG to ground, below 3 V, and that is the trigger. OUT goes high, DISCH lets go and the capacitor fills. When it reaches 6 V, OUT goes low and the capacitor is emptied at once. The time is 1.1 × R × C: 1.1 × 100,000 Ω × 0.00001 F = 1.1 s, however short the tap. A 555 wired this way is a one-shot.',
    },
    {
      title: 'A voltage sets the pitch',
      text: 'CTRL is the 6 V level itself, brought out to a pin. Push it up from outside and the capacitor has further to climb before the 555 turns round, so each cycle takes longer and the pitch falls. Pull it down and the pitch rises. The slow oscillator does both in turn through its 10 kΩ. CTRL goes up to 6.73 V and down to 4.53 V, and the tone jumps between 1.18 kHz and 1.78 kHz. A voltage is setting a pitch. It is called a control voltage, and every synthesizer oscillator is built on it.',
    },
    {
      title: 'A strong output',
      text: 'A 555\'s OUT does not quite reach the supply: lighting the LED it sat at 7.6 V. But it can pass far more current than a CD40106 can, enough to work a small loudspeaker with no help. The Atari Punk Console at the end of this class does that.',
    },
    {
      title: 'On a real board',
      text: 'The app is kinder than a real 555 in two ways. Here a RESET pin with nothing on it reads high and the chip runs. On a real board it can pick up stray signals and stop the chip at odd moments, so it is always wired to +. And a real CTRL pin that is not in use gets a 10 nF capacitor to ground, to keep stray signals from wobbling the pitch. The app has no stray signals.',
    },
  ],

  tries: [
    {
      id: 'shorter',
      title: 'A shorter wait',
      question: 'Change the one-shot\'s 100 kΩ for 47 kΩ, about half as much. After a tap the LED will stay on for…',
      options: ['About twice as long', 'The same 1.10 s', 'About half as long'],
      answer: 2,
      change: 'Click the 100 kΩ on the second 555 and type 47k. Play, and tap the button.',
      made: (work) => {
        const lit = flash(work)?.seconds ?? null;
        return lit !== null && lit >= 0.45 && lit <= 0.6;
      },
      result: (work) => `${seconds(flash(work)!.seconds!)}, where it was 1.10 s. The capacitor fills faster through a smaller resistor and reaches 6 V sooner: 1.1 × 47,000 Ω × 0.00001 F = 0.52 s. Now hold the button down for longer than that. The LED stays on until you let go: a one-shot cannot finish while its trigger is still held. Put 100 kΩ back.`,
    },
    {
      id: 'flat',
      title: 'A tired battery',
      question: 'Open the switch so the tone holds still. Now turn the supply down from 9 V to 5 V. The pitch will…',
      options: ['Fall by nearly half', 'Stay where it is', 'Rise'],
      answer: 1,
      change: 'Click the supply and type 5 into Voltage, at the top right.',
      made: (work) => {
        const supply = work.parts('power')[0];
        return supply !== undefined && Math.abs(Number(supply.parameters.voltage) - 5) <= 0.5
          && timers(work).some((timer) => powered(work, timer)) && note(work, 0) !== null;
      },
      result: (work) => `${formatHertz(note(work, 0)!)}: the same note. The two levels are fractions of the supply, one third and two thirds. With less voltage the capacitor has less far to go, but it is pushed less hard, and the two cancel. The one-shot still takes 1.10 s too. This is why the 555 is sold as a timer: its time comes from its resistors and its capacitor, not from the battery. Put the supply back to 9 V.`,
    },
    {
      id: 'push',
      title: 'Push CTRL by hand',
      question: 'Close the switch. Take the 10 kΩ off the slow oscillator and wire that end to + instead, so that it pulls CTRL up all the time. The pitch will…',
      options: ['Go up and stay up', 'Not change', 'Go down and stay down'],
      answer: 2,
      change: 'Click the wire from the CD40106\'s 1Y to the 10 kΩ and press Delete. Then wire that end of the resistor to +.',
      made: (work) => {
        if (!pushedUp(work)) return false;
        const sound = sounding(work, 1);
        return sound !== null && steady(sound);
      },
      result: (work) => {
        const timer = pushedUp(work)!;
        const ctrl = reading(work.bench({ watch: [[timer, NE555.CTRL]], set: switches(work, 1) }), timer, NE555.CTRL).mean;
        return `${formatHertz(note(work, 1)!)}, down from 1.38 kHz. CTRL now sits at ${formatVolts(ctrl)}, not 6 V, so the capacitor has further to climb each time round. More voltage, lower note. Wire that end to ground instead and CTRL is pulled down to 4.5 V: 1.79 kHz. These are the siren's two notes, near enough, held still. Then put the resistor back on 1Y.`;
      },
    },
    {
      id: 'say',
      title: 'How much say',
      question: 'With the siren wailing again, change the 10 kΩ into CTRL for 4.7 kΩ. Its two pitches will be…',
      options: ['Closer together', 'The same', 'Further apart'],
      answer: 2,
      change: 'Click the 10 kΩ between the slow oscillator and CTRL and type 4.7k. Keep the switch closed.',
      made: (work) => {
        if (!intoCtrl(work).some((r) => Number(r.parameters.resistance) < 8000)) return false;
        const sound = sounding(work, 1);
        return sound !== null && sound.high / sound.low > 1.7;
      },
      result: (work) => `${pitch(soundingClosely(work, 1) ?? sounding(work, 1)!)}, where 10 kΩ gave 1.18 kHz and 1.78 kHz. Inside the chip, CTRL is the middle of a divider across the supply. The resistor from outside pulls against that divider, and a smaller one pulls harder. Try 47 kΩ: 1.33 kHz and 1.49 kHz, hardly a siren at all. The smaller the resistor, the more say the slow oscillator has. Put 10 kΩ back.`,
    },
    {
      id: 'reset',
      title: 'RESET',
      question: 'Take the first 555\'s RESET off + and wire it to ground. The tone will…',
      options: ['Carry on as before', 'Drop to a low hum', 'Stop'],
      answer: 2,
      change: 'Click the wire from the first 555\'s RESET to + and press Delete. Then wire RESET to a ground.',
      made: (work) => hasSound(work) && timers(work).some((timer) => powered(work, timer) && work.grounded(timer, NE555.RESET))
        && note(work, 1) === null,
      result: () => 'Silence. With RESET low, OUT is held low whatever the capacitor is doing. RESET is the 555\'s enable, like the spare input of the gate in class 7: high lets it run, low stops it. Take RESET off ground again. The check has a better place for it than +.',
    },
  ],

  check: {
    goal: 'Make a doorbell. It is silent until the button is tapped. Then it sounds one steady tone between 600 and 800 Hz for about a second: anywhere from 0.9 to 1.2 s will do. Then it is silent again.',
    reading: (work) => {
      if (timers(work).length === 0 || !hasSound(work)) return null;
      const sound = ring(work);
      if (!sound) return 'Your bell: silent, even after a tap';
      if (sound.from < TAP.at - 0.01) return `Your bell: ${pitch(sound)}, sounding before the button is touched`;
      const lasting = sound.to === null ? 'and still sounding after 1.5 s' : `for ${seconds(sound.to - sound.from)}`;
      return `Your bell: silent, then ${pitch(sound)} ${lasting} after a tap`;
    },
    passed: (work) => {
      const sound = ring(work);
      if (!sound || sound.to === null) return false;
      const lasting = sound.to - sound.from;
      return sound.from >= TAP.at - 0.01 && sound.from <= TAP.at + 0.05 && lasting >= 0.9 && lasting <= 1.2
        && sound.low >= 600 && sound.high <= 800;
    },
    hint: 'Calculated, not measured: RESET is the tone\'s enable, and the one-shot\'s OUT is high for 1.1 s after a tap and low the rest of the time. So wire the first 555\'s RESET to the second 555\'s OUT. For the pitch, make the 47 kΩ a 100 kΩ: 1.44 ÷ ((10 kΩ + 2 × 100 kΩ) × 10 nF) = 686 Hz. Open the switch to CTRL so the tone holds still.',
  },

  keep: [
    {
      id: 'ring',
      text: 'Close the switch to CTRL again: now the bell wails. Name the button RING.',
      how: 'Click the button and type RING into Name, at the top right.',
      done: (work) => work.parts('pushbutton').some((button) => isNamed(button, 'RING')),
    },
    ...keepSteps({
      type: 'switch', name: 'WAIL', what: 'the switch', has: 'ne555',
      why: 'On the cover there is a button to ring it, a switch to choose between one note and two, a lamp and a speaker.',
    }),
    {
      id: 'punk',
      text: 'Last, load the Atari Punk Console: Examples, at the top. It is two 555s, and you have built both.',
      how: 'The first 555 is your tone, with a pot named PITCH for its second resistor. The second is your one-shot, with a pot named WIDTH for its resistor and no button: every cycle of the first sets it off. Work out what WIDTH will do before you turn it. A one-shot that is still on when the next cycle comes takes no notice of it.',
      done: (work) => work.parts('speaker').length > 0 && timers(work).some((first) => timers(work).some((second) => second.id !== first.id
        && work.joined(first, NE555.OUT, second, NE555.TRIG) && work.joined(second, NE555.THRES, second, NE555.DISCH))),
    },
  ],

  words: [
    { word: 'Timer', meaning: 'A chip that measures out time with a resistor and a capacitor. The 555 is the best known.' },
    { word: 'VCC', meaning: 'The 555\'s + power pin: the VDD of other chips.' },
    { word: 'Astable', meaning: 'Never stable: a 555 wired to go round for ever, as an oscillator. Frequency = 1.44 ÷ ((RA + 2 × RB) × C).' },
    { word: 'One-shot', meaning: 'A 555 wired to wait: each trigger gives one pulse of 1.1 × R × C, then it waits again.' },
    { word: 'Trigger', meaning: 'What sets a one-shot off: TRIG pulled below a third of the supply.' },
    { word: 'Pull-up', meaning: 'A resistor to + that holds a pin high until something pulls it low.' },
    { word: 'Control voltage', meaning: 'A voltage that sets something, here a pitch. The 555 takes one on CTRL.' },
    { word: 'Kilohertz', meaning: 'A thousand hertz (kHz).' },
  ],

  circuit: () => build({ rb: 47e3, farads: 10e-9, out: 'sound', oneShot: true, siren: true }),
  stages: [
    { upTo: 'probe', circuit: () => build({ rb: 100e3, farads: 4.7e-6, out: 'led' }) },
    { upTo: 'listen', circuit: the555Tone },
    { upTo: 'lamp', circuit: () => build({ rb: 47e3, farads: 10e-9, out: 'sound', oneShot: true }) },
  ],
};
