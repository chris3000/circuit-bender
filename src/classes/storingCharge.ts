import { formatAmps, formatVolts } from '@/utils/readings';
import type { Component } from '@/types/circuit';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Built, ClassDefinition } from './types';
import { GROUND, type Work } from './Work';
import { all, capacitor, connect, ground, keepSteps, LED, near, place, playStep, rails, resistor, spans, valued } from './kit';
import { theLoopKept } from './theLoop';

// --- What this class asks of the learner's circuit ---

/** When, in a timed run, the button is let go or pressed. */
const AT = 0.05;
/** A fade is watched for this long, at this many readings a second: it is slow, and smooth. */
const WATCH = { seconds: 6, sampleRate: 4000 };

const held = (work: Work, value: 0 | 1) => all(work, 'pushbutton', 'closed', value);

/** The LED that is brightest while every button is held, and its current then. */
function lamp(work: Work): { led: Component; amps: number } | null {
  if (work.parts('pushbutton').length === 0) return null;
  const run = work.run(held(work, 1));
  let best: { led: Component; amps: number } | null = null;
  for (const led of work.parts('led')) {
    const amps = run.amps(led.id);
    if (!best || amps > best.amps) best = { led, amps };
  }
  return best;
}

/** The first moment, in seconds after `AT`, that a current is on the far side of `level`; null if it never is. */
function timeTo(run: BenchRun, id: string, level: number, falling: boolean): number | null {
  const trace = run.ampsTrace(id);
  if (!trace) return null;
  for (let i = Math.ceil(AT * run.sampleRate); i < trace.length; i++) {
    if (falling ? trace[i] <= level : trace[i] >= level) return i / run.sampleRate - AT;
  }
  return null;
}

/** Letting go: how bright the LED was, and how long it takes to fall to a half and to a tenth of that. */
interface Fade {
  /** The LED's current while the button is held, in amps. */
  on: number;
  /** Seconds from letting go to half that current; null if it has not got there when the watching stops. */
  half: number | null;
  tenth: number | null;
}

function fade(work: Work): Fade | null {
  const lit = lamp(work);
  if (!lit || lit.amps < 1e-5) return null;
  // It starts as it stands with the button held (the capacitor full), then the button is let go
  const run = work.bench({
    ...WATCH, set: held(work, 1), watchAmps: [lit.led.id],
    events: work.parts('pushbutton').map((b) => ({ at: AT, componentId: b.id, parameter: 'closed', value: 0 })),
  });
  return { on: lit.amps, half: timeTo(run, lit.led.id, lit.amps / 2, true), tenth: timeTo(run, lit.led.id, lit.amps / 10, true) };
}

/** Pressing: the run from the button's first touch, with the LED's current and every resistor's recorded. */
function press(work: Work): BenchRun | null {
  const lit = lamp(work);
  if (!lit) return null;
  return work.bench({
    seconds: 1.5, sampleRate: 4000, set: held(work, 0),
    watchAmps: [lit.led.id, ...work.parts('resistor').map((r) => r.id)],
    events: work.parts('pushbutton').map((b) => ({ at: AT, componentId: b.id, parameter: 'closed', value: 1 })),
  });
}

/** A light that stays on after the button is let go: it takes at least a tenth of a second to fall to half. */
function fades(work: Work): boolean {
  const result = fade(work);
  return result !== null && result.on > 1e-4 && (result.half === null || result.half >= 0.1);
}

const seconds = (value: number | null) => (value === null ? `more than ${WATCH.seconds - 1} s` : `${value.toFixed(2)} s`);

/** The resistor of about `ohms` that the LED's current runs through while the button is held: the way out of the tank. */
function drainOf(work: Work, ohms: number): Component | undefined {
  const lit = lamp(work);
  if (!lit || lit.amps < 1e-6) return undefined;
  const run = work.run(held(work, 1));
  // It is the one on the LED's side of the tank, not the one on the button
  const anode = work.net(lit.led, LED.A);
  return valued(work, 'resistor', ohms).find((r) => (work.net(r, 0) === anode || work.net(r, 1) === anode)
    && Math.abs(Math.abs(run.amps(r.id)) - lit.amps) <= lit.amps * 0.01);
}

/** The resistor of about `ohms` on the button: the way into the tank. */
function fillOf(work: Work, ohms: number): Component | undefined {
  const off = rails(work);
  const buttonNets = work.parts('pushbutton').flatMap((b) => [work.net(b, 0), work.net(b, 1)]).filter((net) => !off.includes(net));
  return valued(work, 'resistor', ohms).find((r) => buttonNets.includes(work.net(r, 0)) || buttonNets.includes(work.net(r, 1)));
}

/** The capacitors that hold the charge: from ground to a point a resistor is on. */
function tanks(work: Work): Component[] {
  const resistorNets = new Set(work.parts('resistor').flatMap((r) => [work.net(r, 0), work.net(r, 1)]));
  return work.parts('capacitor').filter((c) => {
    const top = [work.net(c, 0), work.net(c, 1)].find((net) => net !== GROUND);
    return top !== undefined && resistorNets.has(top) && spans(work, c, top, GROUND);
  });
}

const farads = (part: Component) => Number(part.parameters.capacitance);

// --- The circuit ---

/** The fading light: a button and 100 Ω into the tank, a 100 µF from there to ground, and 4.7 kΩ and the LED out of it. */
function fadingLight(name?: string): Built {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const button = place('pushbutton', 320, 200, name ? { label: name } : {});
  const fill = resistor(100, 440, 200);
  const tank = capacitor(100e-6, 540, 300, 90);
  const tankGround = ground(540, 400);
  const drain = resistor(4700, 640, 200);
  const led = place('led', 740, 300, { rotation: 90 });
  const ledGround = ground(740, 400);
  return {
    components: [supply, supplyGround, button, fill, tank, tankGround, drain, led, ledGround],
    connections: [
      connect(supply, 1, supplyGround, 0),
      connect(supply, 0, button, 0),
      connect(button, 1, fill, 0),
      connect(fill, 1, drain, 0),
      connect(fill, 1, tank, 0),
      connect(tank, 1, tankGround, 0),
      connect(drain, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
  };
}

/** What the class keeps: the fading light, its button named GLOW. */
export const storingChargeKept = (): Built => fadingLight('GLOW');

/** Class 3: a capacitor holds charge, and a resistor decides how long it takes to let it go. */
export const storingCharge: ClassDefinition = {
  id: 'storing-charge',
  number: 3,
  unit: 'Light',
  title: 'Storing charge',
  promise: 'A light that stays on after you let go of its button, and fades.',
  startsFrom: 'The light you kept in class 1: a supply, a switch, 470 Ω and an LED.',
  start: theLoopKept,

  build: [
    {
      id: 'button',
      text: 'Swap the switch for a push button.',
      how: 'Double-click the switch and pick Push button from the list. It takes the switch\'s place, wires and all. A push button is closed only while it is held.',
      done: (work) => work.parts('pushbutton').length > 0 && (work.parts('switch').length === 0 || fades(work)),
    },
    {
      id: 'drain',
      text: 'Change the 470 Ω resistor to 4.7 kΩ.',
      how: 'Click it and type 4.7k into Resistance. This is the resistor the stored charge will leave through.',
      done: (work) => valued(work, 'resistor', 4700).length > 0 || fades(work),
    },
    {
      id: 'fill',
      text: 'Put a 100 Ω resistor into the wire between the button and the 4.7 kΩ.',
      how: 'Type 100 into the search box, drag the resistor over that wire and let go when the wire lights up. It goes into the wire.',
      done: (work) => fillOf(work, 100) !== undefined || fades(work),
    },
    {
      id: 'tank',
      text: 'Add a 100 µF capacitor: one leg to the point between the two resistors, the other to ground.',
      how: 'Search for "100u". Wire one leg to the wire that joins the two resistors: drop the wire on that wire and a dot joins them. The other leg goes to a ground. On a real board a capacitor this large has a + leg, which goes to the higher voltage. Here either way round works.',
      done: (work) => tanks(work).length > 0 && fades(work),
    },
    playStep('Nothing lights yet: the button is open.'),
    {
      id: 'press',
      text: 'Press the button and hold it: the LED lights. Let go: it stays on, and fades.',
      how: 'Press on the button on the canvas and keep the mouse down. While it is held the LED carries 1.46 mA. If the LED goes out the moment you let go, the capacitor is not on the point between the resistors.',
      done: (work) => work.situation.playing && fades(work) && work.parts('pushbutton').some((b) => Number(b.parameters.closed) >= 1),
    },
    {
      id: 'probe',
      text: 'Put a probe on the capacitor: right-click the wire on its upper leg. Press and let go again, and watch the scope.',
      how: 'The scope at the bottom of the window draws a voltage as time goes by. Set its Time/div to 200 ms so a whole fade fits. The line jumps to 8.85 V when you press and sinks away in a curve when you let go.',
      done: (work) => work.situation.playing && tanks(work).some((c) => work.probed(c, work.net(c, 0) === GROUND ? 1 : 0)),
    },
  ],

  why: [
    {
      title: 'A tank',
      text: 'A capacitor stores charge, as a tank stores water. The point between the two resistors is the top of the tank. Pressing the button fills it through the 100 Ω, almost at once. Letting go leaves it to empty through the 4.7 kΩ and the LED, and that takes time. The light you see after letting go is the charge coming back out.',
    },
    {
      title: 'How much it holds',
      text: 'Capacitance is measured in farads (F). A farad is enormous. This one is 100 microfarads (µF), a ten-thousandth of a farad. Smaller ones are in nanofarads (nF), a thousand times smaller again.',
    },
    {
      title: 'How long it takes',
      text: 'The time is the resistance times the capacitance: 4,700 Ω × 0.0001 F = 0.47 s. This is the time constant. A fuller tank pushes harder, so it empties fast at first and then ever more slowly: that is the curve on the scope. The LED\'s current falls to half every 0.7 × R × C. Here that is 0.33 s, and it is down to a tenth after 1.11 s.',
    },
    {
      title: 'The small resistor',
      text: 'An empty capacitor takes all the current it can get. The 100 Ω holds the first rush to no more than 9 V ÷ 100 Ω = 90 mA, which a real button and supply can stand. It also means the tank only fills to 8.85 V: the two resistors and the LED are a divider, as in class 2.',
    },
    {
      title: 'Only changes get through',
      text: 'There is no way through a capacitor. Current flows into it only while its voltage is changing. Once the tank is full, nothing more goes in, however long the button is held. That will matter when sound has to get from one part of a circuit to another.',
    },
  ],

  tries: [
    {
      id: 'more-resistance',
      title: 'A bigger way out',
      question: 'Change the 4.7 kΩ for 10 kΩ, about twice as much. The fade will take…',
      options: ['About half as long', 'The same time', 'About twice as long'],
      answer: 2,
      change: 'Click the 4.7 kΩ and type 10k. Press the button, let go and watch.',
      made: (work) => drainOf(work, 10000) !== undefined && fades(work),
      result: (work) => {
        const result = fade(work)!;
        return `${seconds(result.half)} to fall to half, where it took 0.33 s. More resistance lets the charge out more slowly. The LED is also dimmer while the button is held: ${formatAmps(result.on)}, down from 1.46 mA. Put 4.7 kΩ back before going on.`;
      },
    },
    {
      id: 'more-capacitance',
      title: 'A bigger tank',
      question: 'With 4.7 kΩ back, change the capacitor from 100 µF to 470 µF. The fade will take…',
      options: ['The same time', 'Nearly five times as long', 'Nearly five times less'],
      answer: 1,
      change: 'Click the capacitor and type 470u into Capacitance.',
      made: (work) => tanks(work).some((c) => near(farads(c), 470e-6)) && drainOf(work, 4700) !== undefined && fades(work),
      result: (work) => `${seconds(fade(work)!.half)} to fall to half. A bigger tank holds more charge, and the same resistor takes longer to let it out. The LED is no dimmer this time: the tank fills to the same voltage. Put 100 µF back.`,
    },
    {
      id: 'beside',
      title: 'Two tanks side by side',
      question: 'Add a second 100 µF beside the first, in parallel. The fade will take…',
      options: ['Half as long', 'The same time', 'Twice as long'],
      answer: 2,
      change: 'Add another 100 µF capacitor. Wire one leg to the top of the first and the other to ground.',
      made: (work) => {
        const same = tanks(work).filter((c) => near(farads(c), 100e-6));
        return same.length >= 2 && new Set(same.map((c) => work.net(c, work.net(c, 0) === GROUND ? 1 : 0))).size < same.length && fades(work);
      },
      result: (work) => `${seconds(fade(work)!.half)} to fall to half: twice the 0.33 s of one. Capacitors in parallel add up, the opposite of resistors. Two tanks side by side are one bigger tank. Take the second one away again.`,
    },
    {
      id: 'slow-fill',
      title: 'A slow way in',
      question: 'Change the 100 Ω for 10 kΩ. Now when you press and hold, the LED will…',
      options: ['Come on at once, as bright as before', 'Come on slowly, and not as bright', 'Not come on at all'],
      answer: 1,
      change: 'Click the 100 Ω and type 10k. Press the button and keep it held.',
      made: (work) => fillOf(work, 10000) !== undefined && fillOf(work, 100) === undefined && tanks(work).length > 0
        && (lamp(work)?.amps ?? 0) > 1e-4,
      result: (work) => {
        const lit = lamp(work)!;
        const run = press(work)!;
        const tank = tanks(work)[0];
        const top = work.net(tank, 0) === GROUND ? 1 : 0;
        const volts = work.bench({ set: held(work, 1), watch: [[tank, top]] }).volts(tank.id, tank.pins[top].id).mean;
        return `It takes ${seconds(timeTo(run, lit.led.id, 1e-4, false))} to reach even 0.1 mA, and settles at ${formatAmps(lit.amps)}, a third of what it was. Filling takes time too, when the way in is small. And the tank now fills only to ${formatVolts(volts)}: the 10 kΩ above and the 4.7 kΩ and LED below are a divider. Put 100 Ω back.`;
      },
    },
  ],

  check: {
    goal: 'Make the LED take two seconds to fall to half after you let go. Anywhere from 1.7 to 2.3 s will do.',
    reading: (work) => {
      const result = fade(work);
      if (!result) return null;
      return `Your LED: half after ${seconds(result.half)}`;
    },
    passed: (work) => {
      const result = fade(work);
      return result !== null && result.half !== null && result.half >= 1.7 && result.half <= 2.3;
    },
    hint: 'Calculated, not measured: the current halves every 0.7 × R × C, so R × C must be about 2 ÷ 0.7 = 2.9. With the 100 µF that is 29 kΩ, and the nearest value on the shelf is 27 kΩ. A bigger capacitor with a smaller resistor gets there too, and keeps the LED brighter.',
  },

  keep: keepSteps({
    type: 'pushbutton', name: 'GLOW', what: 'the button', has: 'capacitor',
    why: 'On the cover it is a button you hold, with a lamp that glows on after it.',
  }),

  words: [
    { word: 'Capacitor', meaning: 'A part that stores charge. Current flows into it only while its voltage is changing.' },
    { word: 'Charge', meaning: 'What a capacitor stores: current that has flowed in and not yet flowed out.' },
    { word: 'Farad', meaning: 'The measure of capacitance (F): how much charge a capacitor holds for each volt.' },
    { word: 'Microfarad, nanofarad', meaning: 'A millionth of a farad (µF), and a thousandth of that (nF).' },
    { word: 'Time constant', meaning: 'Resistance × capacitance, in seconds: how long a capacitor takes to fill or empty through a resistor.' },
    { word: 'Push button', meaning: 'A switch that is closed only while it is held.' },
    { word: 'Probe', meaning: 'A point the scope watches. Right-click a wire to put one on it.' },
    { word: 'Scope', meaning: 'Oscilloscope for short: it draws a voltage as time goes by.' },
  ],

  circuit: () => fadingLight(),
};
