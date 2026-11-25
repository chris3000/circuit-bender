/**
 * What the classes share: the pins of the parts by name, the builders their
 * circuits are made with, and the questions most of them ask of a learner's
 * circuit. Nothing here is about any one class.
 */
import type { Component } from '@/types/circuit';
import type { BenchRun } from '@/simulation/measure/bench';
import type { SignalReading } from '@/simulation/measure/signal';
import type { Step } from './types';
import { GROUND, type Work } from './Work';

export { capacitor, connect, ground, namedSwitch, place, pot, resistor } from '@/examples/circuits';

// --- Pins, by their place among a part's pins (the order of the definitions and the models) ---

const run6 = (from: number) => [0, 1, 2, 3, 4, 5].map((i) => from + i);

export const POWER = { PLUS: 0, MINUS: 1 };
export const LED = { A: 0, K: 1 };
export const DIODE = { A: 0, K: 1 };
/** A pot's ends are 1 and 3; its middle leg, the wiper, is 2. */
export const POT = { END1: 0, WIPER: 1, END3: 2 };
export const TRANSISTOR = { B: 0, C: 1, E: 2 };
/** Six inverters: A[n] in, Y[n] out, n from 0. */
export const CD40106 = { A: run6(0), Y: run6(6), VDD: 12, VSS: 13 };
/** Four NAND gates: A[n] and B[n] in, Y[n] out, n from 0. */
export const CD4093 = { A: [0, 2, 4, 6], B: [1, 3, 5, 7], Y: [8, 9, 10, 11], VDD: 12, VSS: 13 };
/** Q[0] is Q1, the fastest. */
export const CD4040 = { CLK: 0, RST: 1, Q: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], VDD: 14, VSS: 15 };
/** Q[0] is Q0, the first step. */
export const CD4017 = { CLK: 0, INH: 1, RST: 2, Q: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], CO: 13, VDD: 14, VSS: 15 };
/** Two flip-flops: D, CLK, SET and RST in, Q and its opposite out. */
export const CD4013 = { D: [0, 4], CLK: [1, 5], SET: [2, 6], RST: [3, 7], Q: [8, 10], NOT_Q: [9, 11], OUTS: [8, 9, 10, 11], VDD: 12, VSS: 13 };
export const NE555 = { TRIG: 0, THRES: 1, RESET: 2, CTRL: 3, DISCH: 4, OUT: 5, VCC: 6, GND: 7 };
export const LM741 = { IN_MINUS: 0, IN_PLUS: 1, V_MINUS: 2, OUT: 3, V_PLUS: 4 };
export const LM386 = { IN_MINUS: 0, IN_PLUS: 1, GND: 2, OUT: 3, VS: 4 };

// --- Sizes ---

/** An LED that can be seen to be lit: a tenth of a milliamp. */
export const LIT = 1e-4;
/** An LED that is dark: under a microamp. */
export const DARK = 1e-6;

/** Whether a value is the one meant, to within a part in a hundred (or `tolerance`). */
export const near = (value: unknown, target: number, tolerance = 0.01) =>
  Math.abs(Number(value) - target) <= Math.abs(target) * tolerance;

// --- Questions about what is on the canvas ---

/** Whether a part has been given this name (capitals or not). */
export const isNamed = (part: Component, name: string) => (part.label ?? '').trim().toUpperCase() === name.toUpperCase();

/** The parts of a kind with a given value: resistors of 10 kΩ, capacitors of 100 nF, pots of 100 kΩ. */
export function valued(work: Work, type: 'resistor' | 'capacitor' | 'potentiometer', value: number): Component[] {
  const key = type === 'resistor' ? 'resistance' : type === 'capacitor' ? 'capacitance' : 'maxResistance';
  return work.parts(type).filter((part) => near(part.parameters[key], value));
}

/** The net the supply's + is on (the first supply's), or null without one. */
export function plus(work: Work): string | null {
  const supply = work.parts('power')[0];
  return supply ? work.net(supply, POWER.PLUS) : null;
}

/** The nets that are not a place for two parts to meet each other: the supply's two ends. */
export function rails(work: Work): string[] {
  return [GROUND, ...work.parts('power').map((supply) => work.net(supply, POWER.PLUS))];
}

/** Whether a part with two legs has one on each of two nets, either way round. */
export function spans(work: Work, part: Component, netA: string, netB: string): boolean {
  const a = work.net(part, 0), b = work.net(part, 1);
  return netA !== netB && ((a === netA && b === netB) || (a === netB && b === netA));
}

/**
 * Whether two nets are joined through two-legged parts of the given kinds
 * laid end to end (one, or several in a line), not passing through a rail.
 * It is how "a resistor from the output back to the input" is found whether
 * it is one resistor or two in a line.
 */
export function linked(work: Work, netA: string, netB: string, types: string[], max = 3): boolean {
  if (netA === netB) return false;
  const avoid = rails(work).filter((net) => net !== netA && net !== netB);
  const parts = types.flatMap((type) => work.parts(type));
  let reached = new Set([netA]);
  for (let hop = 0; hop < max; hop++) {
    const next = new Set(reached);
    for (const part of parts) {
      const a = work.net(part, 0), b = work.net(part, 1);
      if (reached.has(a) && !avoid.includes(b)) next.add(b);
      if (reached.has(b) && !avoid.includes(a)) next.add(a);
    }
    if (next.has(netB)) return true;
    reached = next;
  }
  return false;
}

// --- Controls, put one way for a run ---

type Change = { componentId: string; parameter: string; value: number };

/** Every part of a kind with one of its controls put to a value: every switch closed, every photocell in the dark. */
export const all = (work: Work, type: string, parameter: string, value: number): Change[] =>
  work.parts(type).map((part) => ({ componentId: part.id, parameter, value }));

/** Every switch closed (1) or open (0). */
export const switches = (work: Work, closed: 0 | 1): Change[] => all(work, 'switch', 'closed', closed);

// --- Reading a run ---

/** The most current any LED carries, in amps. */
export const ledAmps = (work: Work, run: BenchRun): number =>
  Math.max(0, ...work.parts('led').map((led) => run.amps(led.id)));

/** A watched pin's reading, the pin given by its place among the part's pins. */
export const reading = (run: BenchRun, part: Component, pin: number): SignalReading =>
  run.volts(part.id, part.pins[pin]?.id ?? '');

/** How far a signal swings, top to bottom. */
export const swing = (signal: SignalReading) => signal.max - signal.min;

// --- Steps most classes have ---

/** Press play. */
export const playStep = (how = 'Nothing happens in a circuit until it runs: ▶ at the top right, or the space bar.'): Step => ({
  id: 'play',
  text: 'Press play.',
  how,
  done: (work) => work.situation.playing,
});

/**
 * Keeping a circuit: name its control, look at the cover, save it. `type` is
 * the kind of part that gets the name, `what` says what is being named.
 */
export function keepSteps(options: { type: string; name: string; what: string; why: string; has: string }): Step[] {
  const { type, name, what, why, has } = options;
  return [
    {
      id: 'name',
      text: `Name ${what} ${name}.`,
      how: `Click it and type ${name} into Name, at the top right. ${why}`,
      done: (work) => work.parts(type).some((part) => isNamed(part, name)),
    },
    {
      id: 'cover',
      text: 'Look at the cover: the COVER tab at the top left, or the Tab key.',
      how: 'The cover is the circuit as a finished thing: its controls, its lights and its sound, and nothing else.',
      done: (work) => work.situation.view === 'cover',
    },
    {
      id: 'save',
      text: 'Save it: the Save button at the top.',
      how: 'Saved circuits stay in this browser. Load brings them back.',
      // An example that was only opened is not dirty either: it is the learner's own once its control has the name
      done: (work) => work.situation.saved && work.parts(has).length > 0 && work.parts(type).some((part) => isNamed(part, name)),
    },
  ];
}
