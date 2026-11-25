import { formatAmps, formatVolts } from '@/utils/readings';
import type { Component } from '@/types/circuit';
import type { Built, ClassDefinition } from './types';
import { GROUND, type Work } from './Work';
import {
  all, connect, ground, keepSteps, LED, ledAmps, LIT, near, place, playStep, plus, pot, POT, rails, resistor, spans, valued,
} from './kit';

// --- What this class asks of the learner's circuit ---

/** A point between something from + (a resistor, a photocell) and a resistor to ground. */
interface Tap {
  net: string;
  tops: Component[];
  bottoms: Component[];
}

/** Every such point: `topType` is what the upper half is made of. */
function taps(work: Work, topType: 'resistor' | 'ldr'): Tap[] {
  const supply = plus(work);
  if (!supply) return [];
  const off = rails(work);
  const found = new Map<string, Tap>();
  for (const top of work.parts(topType)) {
    const net = [work.net(top, 0), work.net(top, 1)].find((n) => !off.includes(n));
    if (!net || !spans(work, top, supply, net)) continue;
    const bottoms = work.parts('resistor').filter((r) => spans(work, r, net, GROUND));
    if (bottoms.length === 0) continue;
    const tap = found.get(net) ?? { net, tops: [], bottoms };
    tap.tops.push(top);
    found.set(net, tap);
  }
  return [...found.values()];
}

/** The voltage of a tap, with the light on every photocell put to `light` if given. */
function tapVolts(work: Work, tap: Tap, light?: number): number {
  const bottom = tap.bottoms[0];
  const pin = work.net(bottom, 0) === tap.net ? 0 : 1;
  const run = work.bench({ watch: [[bottom, pin]], set: light === undefined ? [] : all(work, 'ldr', 'light', light) });
  return run.volts(bottom.id, bottom.pins[pin].id).mean;
}

const ohms = (part: Component) => Number(part.parameters.resistance);

/** A tap made of one resistor of each value, whichever of them is on top. */
const pairTap = (work: Work, top: number, bottom: number) =>
  taps(work, 'resistor').find((tap) => tap.tops.length === 1 && tap.bottoms.length === 1
    && near(ohms(tap.tops[0]), top) && near(ohms(tap.bottoms[0]), bottom));

/** The plain divider of the build: 10 kΩ over 10 kΩ. */
const evenTap = (work: Work) => pairTap(work, 10000, 10000);

/** A pot across the supply: one end leg on +, the other on ground. */
function potAcrossSupply(work: Work): Component | undefined {
  const supply = plus(work);
  return work.parts('potentiometer').find((p) => {
    const a = work.net(p, POT.END1), b = work.net(p, POT.END3);
    return supply !== null && ((a === supply && b === GROUND) || (a === GROUND && b === supply));
  });
}

/** The LED's current with a control of every part of a kind put to `value`. */
const ledWith = (work: Work, type: string, parameter: string, value: number) =>
  ledAmps(work, work.run(all(work, type, parameter, value)));

/** A dimmer worked by a part of this kind: the LED is dark with it all the way one way and lit (`lit` amps) all the way the other. */
function dimmedBy(work: Work, type: string, parameter: string, lit: number): boolean {
  if (work.parts(type).length === 0 || work.parts('led').length === 0) return false;
  const ends = [ledWith(work, type, parameter, 0), ledWith(work, type, parameter, 1)];
  return Math.min(...ends) < LIT / 2 && Math.max(...ends) > lit;
}

/** The photocell dimmer of the build: dark in the dark, lit in the light. */
const lightDimmer = (work: Work) => dimmedBy(work, 'ldr', 'light', 1e-3) && ledWith(work, 'ldr', 'light', 1) > ledWith(work, 'ldr', 'light', 0);

/**
 * The point nearest 3 V that only resistors make, between + and ground: what
 * the check reads. `pure` says whether every resistor that sets it is a 10 kΩ.
 */
function resistorPoint(work: Work): { volts: number; pure: boolean } | null {
  const supply = plus(work);
  if (!supply) return null;
  const off = rails(work);
  const resistors = work.parts('resistor');
  const others = work.circuit.getComponents().filter((c) => !['resistor', 'junction'].includes(c.type));
  const foreign = new Set(others.flatMap((part) => part.pins.map((_, pin) => work.net(part, pin))));
  const seen = new Set<string>();
  let best: { volts: number; pure: boolean } | null = null;
  for (const start of resistors) {
    for (const pin of [0, 1]) {
      const point = work.net(start, pin);
      if (off.includes(point) || seen.has(point)) continue;
      seen.add(point);
      // Everything that reaches the point through resistors alone, the supply's two ends aside
      const nets = new Set([point]);
      const network = new Set<Component>();
      const ends = new Set<string>();
      for (let grew = true; grew;) {
        grew = false;
        for (const r of resistors) {
          const a = work.net(r, 0), b = work.net(r, 1);
          if (network.has(r) || !(nets.has(a) || nets.has(b))) continue;
          network.add(r);
          for (const net of [a, b]) {
            if (off.includes(net)) ends.add(net); else nets.add(net);
          }
          grew = true;
        }
      }
      // It has to hang between + and ground, with nothing else on it (a photocell, an LED)
      if (!ends.has(supply) || !ends.has(GROUND) || [...nets].some((net) => foreign.has(net))) continue;
      const volts = work.bench({ watch: [[start, pin]] }).volts(start.id, start.pins[pin].id).mean;
      const pure = [...network].every((r) => near(ohms(r), 10000));
      if (!best || Math.abs(volts - 3) < Math.abs(best.volts - 3)) best = { volts, pure };
    }
  }
  return best;
}

// --- The circuits ---

/** The supply and the two 10 kΩ in a line: the divider. */
function divider() {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const top = resistor(10000, 360, 220, 90);
  const bottom = resistor(10000, 360, 340, 90);
  const dividerGround = ground(360, 420);
  return {
    supply, top, bottom,
    components: [supply, supplyGround, top, bottom, dividerGround],
    connections: [
      connect(supply, 1, supplyGround, 0),
      connect(supply, 0, top, 0),
      connect(top, 1, bottom, 0),
      connect(bottom, 1, dividerGround, 0),
    ],
  };
}

/** The divider, and beside it a pot across the supply with an LED on its middle leg. */
function withPot(): Built {
  const { supply, components, connections } = divider();
  const knob = pot('', 10000, 0.5, 520, 300);
  const knobGround = ground(520, 420);
  const limit = resistor(470, 640, 220);
  const led = place('led', 740, 320, { rotation: 90 });
  const ledGround = ground(740, 420);
  return {
    components: [...components, knob, knobGround, limit, led, ledGround],
    connections: [
      ...connections,
      connect(supply, 0, knob, POT.END1),
      connect(knob, POT.END3, knobGround, 0),
      connect(knob, POT.WIPER, limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
  };
}

/** The divider, and beside it the dimmer: a photocell, 470 Ω and an LED in a line. */
function withPhotocell(): Built {
  const { supply, components, connections } = divider();
  const cell = place('ldr', 520, 200);
  const limit = resistor(470, 640, 200);
  const led = place('led', 740, 300, { rotation: 90 });
  const ledGround = ground(740, 400);
  return {
    components: [...components, cell, limit, led, ledGround],
    connections: [
      ...connections,
      connect(supply, 0, cell, 0),
      connect(cell, 1, limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
  };
}

/** What the class keeps: the dimmer by itself, its photocell named SHADE. Class 11 starts from it. */
export function sharingVoltageKept(): Built {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const cell = place('ldr', 340, 200, { label: 'SHADE' });
  const limit = resistor(470, 480, 200);
  const led = place('led', 600, 300, { rotation: 90 });
  const ledGround = ground(600, 400);
  return {
    components: [supply, supplyGround, cell, limit, led, ledGround],
    connections: [
      connect(supply, 1, supplyGround, 0),
      connect(supply, 0, cell, 0),
      connect(cell, 1, limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
  };
}

/** Class 2: two resistors share the supply's voltage, and anything that changes one of them is a control. */
export const sharingVoltage: ClassDefinition = {
  id: 'sharing-voltage',
  number: 2,
  unit: 'Light',
  title: 'Sharing voltage',
  promise: 'A point whose voltage you choose, then a light dimmed by a knob and by the light in the room.',
  startsFrom: 'An empty canvas.',

  build: [
    {
      id: 'supply',
      text: 'Put down a power supply and a ground, and wire the supply\'s − pin to the ground.',
      how: 'As in class 1. Every circuit in the course starts this way.',
      done: (work) => work.parts('power').some((supply) => work.grounded(supply, 1)),
    },
    {
      id: 'two',
      text: 'Add two 10 kΩ resistors, one above the other.',
      how: 'Type 10k into the search box. To stand a resistor on end, click it and press R.',
      done: (work) => valued(work, 'resistor', 10000).length >= 2,
    },
    {
      id: 'line',
      text: 'Wire them in a line: + to the first, the first to the second, the second to ground.',
      how: 'There is no LED this time and no switch. The current has one way to go: through both resistors, one after the other.',
      done: (work) => evenTap(work) !== undefined,
    },
    playStep('This circuit makes no light and no sound. It is read with the meter.'),
    {
      id: 'read',
      text: 'Click the wire between the two resistors. The meter at the top right reads 4.5 V.',
      how: 'The supply gives 9 V. The point between two equal resistors sits at half of it.',
      done: (work) => {
        const tap = evenTap(work);
        return work.situation.playing && tap !== undefined && work.metered(tap.bottoms[0], work.net(tap.bottoms[0], 0) === tap.net ? 0 : 1);
      },
    },
    {
      id: 'pot',
      text: 'Leave the two resistors where they are. Beside them add a 10 kΩ pot, with one end leg wired to + and the other to ground.',
      how: 'Search for "pot". It has three legs: 1 and 3 are its ends, 2 is the middle one. Hold the pointer over a pin to see which it is.',
      done: (work) => potAcrossSupply(work) !== undefined || lightDimmer(work),
    },
    {
      id: 'lamp',
      text: 'From the pot\'s middle leg wire a 470 Ω resistor, then an LED, then ground.',
      how: 'The resistor goes to the LED\'s A leg and the K leg goes to ground, as in class 1.',
      done: (work) => (potAcrossSupply(work) !== undefined && dimmedBy(work, 'potentiometer', 'position', 5e-3)) || lightDimmer(work),
    },
    {
      id: 'turn',
      text: 'Turn the pot all the way one way, then the other. The LED goes from dark to bright.',
      how: 'Drag the small knob beside the pot up and down. Click the wire on the middle leg and watch its voltage as you turn: from 0 V up to 8.8 V.',
      done: (work) => (work.situation.playing && potAcrossSupply(work) !== undefined
        && work.parts('potentiometer').some((p) => Math.abs(Number(p.parameters.position) - 0.5) > 0.3)
        && dimmedBy(work, 'potentiometer', 'position', 5e-3)) || lightDimmer(work),
    },
    {
      id: 'cell',
      text: 'Take the pot away. Put a photocell in its place: one leg to +, the other to the 470 Ω.',
      how: 'Click the pot and press Delete. The photocell is on the shelf as LDR: search for "photocell". It has two legs and can go either way round.',
      done: lightDimmer,
    },
    {
      id: 'shade',
      text: 'Play, and drag the photocell\'s small dial down and up. That is the light falling on it. The LED follows.',
      how: 'The dial stands for the light in the room: down is dark, up is bright. On a real board you would wave a hand over the photocell.',
      done: (work) => work.situation.playing && lightDimmer(work)
        && work.parts('ldr').some((cell) => Math.abs(Number(cell.parameters.light) - 0.5) > 0.2),
    },
  ],

  why: [
    {
      title: 'In a line',
      text: 'Parts wired one after the other are in series. The current has one way to go, so it is the same in both. Resistances in series add up: two 10 kΩ make 20 kΩ, and by Ohm\'s law 9 V ÷ 20 kΩ = 0.45 mA flows.',
    },
    {
      title: 'Sharing',
      text: 'Each resistor takes a share of the 9 V in proportion to its size. Two equal ones take half each, so the point between them sits at 4.5 V. In general that point sits at 9 V × lower ÷ (upper + lower). This is a voltage divider. Almost every class from here on uses one.',
    },
    {
      title: 'Side by side',
      text: 'Parts wired across the same two points are in parallel. The current has two ways through, so two resistors in parallel pass more than either alone. Two equal ones act as one of half the size.',
    },
    {
      title: 'A pot',
      text: 'A potentiometer, pot for short, is a divider on a shaft. Between its end legs is one strip of resistance. The middle leg is a contact that slides along the strip: the wiper. Turning the shaft changes how the strip is shared out above and below it. Half way, the middle leg read 2.35 V, not 4.5 V: the LED and its resistor are in parallel with the lower half of the strip, and make it act smaller.',
    },
    {
      title: 'Sensors',
      text: 'A sensor is a resistor that something in the world changes. A photocell is about 1 MΩ in the dark and 1 kΩ in bright light. A megohm (MΩ) is a million ohms. In line with the LED it is the resistor of class 1, with the room turning it up and down: 0.007 mA in the dark, 0.22 mA at half light, 4.7 mA in bright light.',
    },
  ],

  tries: [
    {
      id: 'smaller',
      title: 'A smaller lower resistor',
      question: 'In the divider, change the lower 10 kΩ for 4.7 kΩ. The point between them will read…',
      options: ['More than 4.5 V', 'Still 4.5 V', 'Less than 4.5 V'],
      answer: 2,
      change: 'Click the resistor that goes to ground and type 4.7k into Resistance. Then click the wire between the two.',
      made: (work) => pairTap(work, 10000, 4700) !== undefined,
      result: (work) => `${formatVolts(tapVolts(work, pairTap(work, 10000, 4700)!))}. The smaller resistor takes the smaller share: 9 V × 4.7 ÷ 14.7. Swap the two values and the point reads 6.12 V. Put 10 kΩ back in both places before going on.`,
    },
    {
      id: 'tiny',
      title: 'A very uneven pair',
      question: 'Make the upper resistor 100 kΩ and the lower one 1 kΩ. The point will read…',
      options: ['About 4.5 V', 'About 0.9 V', 'About 0.09 V'],
      answer: 2,
      change: 'Type 100k into the upper resistor and 1k into the lower one.',
      made: (work) => pairTap(work, 100000, 1000) !== undefined,
      result: (work) => `${formatVolts(tapVolts(work, pairTap(work, 100000, 1000)!))}: a hundredth of the supply, near enough. A divider can make a voltage as small as you like. Put 10 kΩ back in both places.`,
    },
    {
      id: 'beside',
      title: 'A resistor beside another',
      question: 'Add a third 10 kΩ beside the upper one: both of its ends on the same two points. The point between will…',
      options: ['Go down', 'Stay at 4.5 V', 'Go up'],
      answer: 2,
      change: 'Add a 10 kΩ resistor. Wire one end to + and the other to the point between the first two.',
      made: (work) => taps(work, 'resistor').some((tap) => tap.tops.length === 2 && tap.bottoms.length === 1
        && [...tap.tops, ...tap.bottoms].every((r) => near(ohms(r), 10000))),
      result: (work) => {
        const tap = taps(work, 'resistor').find((t) => t.tops.length === 2)!;
        return `${formatVolts(tapVolts(work, tap))}. Two 10 kΩ in parallel act as one 5 kΩ, so the upper half is now the smaller one and takes the smaller share. Leave it there: you may want it for the check.`;
      },
    },
    {
      id: 'meter',
      title: 'A light meter',
      question: 'Put a photocell where the divider\'s upper resistors are. As the light gets brighter, the point between will…',
      options: ['Go up', 'Stay where it is', 'Go down'],
      answer: 0,
      change: 'Take away what is between + and the point. Wire a photocell there, with a single 10 kΩ from the point to ground. Click the wire between them and drag the photocell\'s dial.',
      made: (work) => taps(work, 'ldr').some((tap) => tap.bottoms.length === 1 && near(ohms(tap.bottoms[0]), 10000)),
      result: (work) => {
        const tap = taps(work, 'ldr').find((t) => t.bottoms.length === 1 && near(ohms(t.bottoms[0]), 10000))!;
        const at = (light: number) => formatVolts(tapVolts(work, tap, light));
        return `${at(0)} in the dark, ${at(0.5)} at half light and ${at(1)} in bright light. Light makes the photocell smaller, so it takes a smaller share and leaves more for the resistor below. The light is now a voltage: this is how a circuit reads a sensor.`;
      },
    },
    {
      id: 'finger',
      title: 'A finger for a sensor',
      question: 'In the dimmer, swap the photocell for body contacts: two plates you bridge with a finger. Pressed hard, the LED will…',
      options: ['Light fully', 'Barely glow', 'Stay completely dark'],
      answer: 1,
      change: 'Double-click the dimmer\'s photocell and pick Body contacts from the list. Play, then press on the contacts and hold.',
      made: (work) => work.parts('body-contact').length > 0 && work.parts('led').length > 0
        && ledWith(work, 'body-contact', 'touch', 0) < 1e-6 && ledWith(work, 'body-contact', 'touch', 1) > 2e-5,
      result: (work) => `${formatAmps(ledWith(work, 'body-contact', 'touch', 1))} pressed hard, and ${formatAmps(ledWith(work, 'body-contact', 'touch', 0.01))} for the lightest touch. A microamp (µA) is a millionth of an amp. Skin is a resistor, but a large one: about 2 MΩ for a light touch and 50 kΩ pressed hard. Class 11 makes a finger light the LED fully. For now, put the photocell back.`,
    },
  ],

  check: {
    goal: 'Make a point that sits at 3.0 V, using only 10 kΩ resistors. Anywhere from 2.9 to 3.1 V will do.',
    reading: (work) => {
      const point = resistorPoint(work);
      if (!point) return null;
      return `Your point: ${formatVolts(point.volts)}${point.pure ? '' : ', but not every resistor in it is 10 kΩ'}`;
    },
    passed: (work) => {
      const point = resistorPoint(work);
      return point !== null && point.pure && point.volts >= 2.9 && point.volts <= 3.1;
    },
    hint: 'Calculated, not measured: 3 V is a third of 9 V, so the lower half must be a third of the whole. Resistors in a line add, so two 10 kΩ in a line above one 10 kΩ gives 9 V × 10 ÷ 30. Two 10 kΩ side by side below one 10 kΩ gives 9 V × 5 ÷ 15. Either works.',
  },

  keep: [
    {
      id: 'tidy',
      text: 'Take the divider away, so only the dimmer is left.',
      how: 'Click a resistor of the divider and press Delete. Do the same for the others. The dimmer is the photocell, the 470 Ω and the LED.',
      done: (work) => lightDimmer(work) && taps(work, 'resistor').length === 0 && taps(work, 'ldr').length === 0,
    },
    ...keepSteps({
      type: 'ldr', name: 'SHADE', what: 'the photocell', has: 'led',
      why: 'On the cover a photocell is a knob that stands for the light. A name says what it is for.',
    }),
  ],

  words: [
    { word: 'Series', meaning: 'One after the other, so the same current goes through each. Resistances in series add.' },
    { word: 'Parallel', meaning: 'Side by side across the same two points. Two equal resistors in parallel act as one of half the size.' },
    { word: 'Voltage divider', meaning: 'Two resistances in series across a voltage. The point between sits at voltage × lower ÷ (upper + lower).' },
    { word: 'Potentiometer', meaning: 'Pot for short: a strip of resistance with a sliding contact, turned by a shaft. A divider you can set.' },
    { word: 'Wiper', meaning: 'A pot\'s middle leg: the contact that slides.' },
    { word: 'Sensor', meaning: 'A part whose resistance follows something in the world: light, a touch.' },
    { word: 'Photocell', meaning: 'A resistor that light makes smaller. Also called an LDR, a light-dependent resistor.' },
    { word: 'Megohm', meaning: 'A million ohms (MΩ).' },
    { word: 'Microamp', meaning: 'A millionth of an amp (µA).' },
  ],

  circuit: withPhotocell,
  stages: [
    { upTo: 'read', circuit: () => { const { components, connections } = divider(); return { components, connections }; } },
    { upTo: 'turn', circuit: withPot },
  ],
};
