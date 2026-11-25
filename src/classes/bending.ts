import { exampleCircuits } from '@/examples/circuits';
import { harmonics, risings } from '@/simulation/measure/signal';
import { formatHertz } from '@/utils/readings';
import { formatValue } from '@/utils/parameterParser';
import type { Component } from '@/types/circuit';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Built, ClassDefinition } from './types';
import type { Work } from './Work';
import {
  capacitor, CD4013, CD4017, CD4040, CD40106, CD4093, connect, ground, isNamed, LM741, NE555, near, place, playStep, rails, resistor,
} from './kit';
import { simplestOscillatorKept } from './simplestOscillator';

// ---------------------------------------------------------------------------
// Part 1: the oscillator from class 4, bent
// ---------------------------------------------------------------------------

type Change = { componentId: string; parameter: string; value: number };

/** The first oscillator on the canvas: an inverter with a way back from its output to its input. */
function firstOscillator(work: Work): { chip: Component; a: number; y: number } | undefined {
  for (const chip of work.parts('cd40106')) {
    for (let k = 0; k < 6; k++) {
      const a = CD40106.A[k], y = CD40106.Y[k];
      if (reach(work, work.net(chip, y), FEEDBACK, 3).has(work.net(chip, a))) return { chip, a, y };
    }
  }
  return undefined;
}

/** The note the circuit plays, every switch closed and every button held, with whatever jumper is held. */
function note(work: Work, set: Change[] = []): number | null {
  const bend = work.situation.bend ?? undefined;
  const run = work.bench({ seconds: 0.25, set: [...held(work), ...set], ...(bend ? { bend } : {}) });
  return run.sound.max - run.sound.min > 0.05 ? run.sound.hertz : null;
}

/** Every switch closed and every button held. */
const held = (work: Work): Change[] =>
  [...work.parts('switch'), ...work.parts('pushbutton')].map((part) => ({ componentId: part.id, parameter: 'closed', value: 1 }));

/** How far the supply's STARVE is turned (the most starved, if there are several). */
const starved = (work: Work) => Math.max(0, ...work.parts('power').map((supply) => Number(supply.parameters.starve ?? 0)));

/**
 * A bend that was kept: a switch or button that is not the one the circuit
 * came with, and that changes the note when it is worked.
 */
function keptBend(work: Work): Component | undefined {
  const candidates = [...work.parts('switch'), ...work.parts('pushbutton')].filter((part) => !isNamed(part, 'SOUND'));
  if (candidates.length === 0 || work.parts('audio-output').length === 0) return undefined;
  const closed = note(work);
  return candidates.find((part) => {
    const open = note(work, [{ componentId: part.id, parameter: 'closed', value: 0 }]);
    return open !== null && (closed === null || Math.abs(closed - open) > open * 0.02);
  });
}

// ---------------------------------------------------------------------------
// Part 2: the Weird Sound Generator, read
// ---------------------------------------------------------------------------

const WEIRD = 0, WACKY = 1, ZANY = 2;

/** The Weird Sound Generator, if that is what is on the canvas: its chip, its op-amp and its five controls. */
function wsg(work: Work) {
  const chip = work.parts('cd40106')[0], amp = work.parts('lm741')[0];
  const knob = (name: string) => work.parts('potentiometer').find((part) => isNamed(part, name));
  const weird = knob('WEIRD'), wacky = knob('WACKY'), zany = knob('ZANY'), zaniness = knob('ZANINESS'), oddness = knob('ODDNESS');
  const wackiness = work.parts('switch').find((part) => isNamed(part, 'WACKINESS'));
  if (!chip || !amp || !weird || !wacky || !zany || !zaniness || !oddness || !wackiness) return null;
  return { chip, amp, weird, wacky, zany, zaniness, oddness, wackiness };
}
type Wsg = NonNullable<ReturnType<typeof wsg>>;

const position = (knob: Component) => Number(knob.parameters.position ?? 0);
const isOpen = (toggle: Component) => Number(toggle.parameters.closed ?? 0) < 0.5;

/** The generator as its controls stand, watched for a second: long enough for Zany to go round three times. */
function heard(work: Work, it: Wsg): BenchRun {
  return work.bench({
    seconds: 1,
    watch: [[it.chip, CD40106.Y[WEIRD]], [it.chip, CD40106.Y[WACKY]], [it.chip, CD40106.Y[ZANY]]],
  });
}

const hertzOf = (run: BenchRun, it: Wsg, which: number) =>
  run.volts(it.chip.id, it.chip.pins[CD40106.Y[which]].id).hertz;

/** The lowest and the highest pitch an output is at, cycle by cycle. */
function pitches(run: BenchRun, it: Wsg, which: number): { low: number; high: number } | null {
  const trace = run.trace(it.chip.id, it.chip.pins[CD40106.Y[which]].id);
  const spans = trace ? periods(trace) : [];
  if (spans.length < 2) return null;
  // The second from each end of the list: one odd cycle is not a pitch
  const sorted = [...spans].sort((a, b) => a - b);
  const short = sorted[1] ?? sorted[0], long = sorted[sorted.length - 2] ?? sorted[sorted.length - 1];
  return { low: run.sampleRate / long, high: run.sampleRate / short };
}

/** How many times a recorded square wave goes from low to high. */
function turns(trace: ArrayLike<number>): number {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < trace.length; i++) {
    if (trace[i] < min) min = trace[i];
    if (trace[i] > max) max = trace[i];
  }
  if (!(max - min > 0.5)) return 0;
  return risings(trace, min + (max - min) * 0.6, min + (max - min) * 0.4).length;
}

/** How long each cycle of a recorded square wave took, in samples; the first is left out. */
function periods(trace: ArrayLike<number>): number[] {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < trace.length; i++) {
    if (trace[i] < min) min = trace[i];
    if (trace[i] > max) max = trace[i];
  }
  if (!(max - min > 0.5)) return [];
  const edges = risings(trace, min + (max - min) * 0.6, min + (max - min) * 0.4);
  const spans: number[] = [];
  for (let i = 2; i < edges.length; i++) spans.push(edges[i] - edges[i - 1]);
  return spans;
}

/** The size of a tone's fundamental in the sound. */
const fundamental = (run: BenchRun, hertz: number): number => harmonics(run.soundTrace, run.sampleRate, hertz, 1)[0];

// ---------------------------------------------------------------------------
// Part 3: the brief, checked on whatever the learner builds
// ---------------------------------------------------------------------------

/** Parts that pass a signal along with some resistance. */
const RESISTIVE = ['resistor', 'potentiometer', 'ldr', 'body-contact'];
/** What can lie between an output and its own input in an oscillator. */
const FEEDBACK = [...RESISTIVE, '1n914', '1n4004', 'led'];
/** What a signal can pass through on its way to being heard. */
const PASSIVE = [...RESISTIVE, 'capacitor', 'switch', 'pushbutton', 'spdt'];

/** Each stage of a chip that can be made to oscillate: its inputs and its output. */
const STAGES: Record<string, Array<{ ins: number[]; out: number; back?: number[] }>> = {
  cd40106: CD40106.A.map((a, k) => ({ ins: [a], out: CD40106.Y[k] })),
  cd4049: CD40106.A.map((a, k) => ({ ins: [a], out: CD40106.Y[k] })),
  cd4093: CD4093.Y.map((y, k) => ({ ins: [CD4093.A[k], CD4093.B[k]], out: y })),
  // A 555 goes round by way of its output or its discharge pin
  ne555: [{ ins: [NE555.TRIG, NE555.THRES], out: NE555.OUT, back: [NE555.OUT, NE555.DISCH] }],
  // An amplifier is an oscillator only with a way back to its + input
  lm741: [{ ins: [LM741.IN_PLUS], out: LM741.OUT }],
  tl072: [{ ins: [1], out: 2 }, { ins: [4], out: 5 }],
  lm324: [0, 1, 2, 3].map((n) => ({ ins: [n * 3 + 1], out: n * 3 + 2 })),
};

/** The amplifiers: for each, its inverting input, its other input and its output. */
const AMPLIFIERS: Record<string, Array<{ minus: number; plus: number; out: number }>> = {
  lm741: [{ minus: LM741.IN_MINUS, plus: LM741.IN_PLUS, out: LM741.OUT }],
  tl072: [{ minus: 0, plus: 1, out: 2 }, { minus: 3, plus: 4, out: 5 }],
  lm324: [0, 1, 2, 3].map((n) => ({ minus: n * 3, plus: n * 3 + 1, out: n * 3 + 2 })),
  lm386: [{ minus: 0, plus: 1, out: 3 }],
};

/** The outputs of the chips that count and step: a gate, a counter, a flip-flop. */
const LOGIC: Record<string, { outs: number[]; vdd: number; vss: number }> = {
  cd4093: { outs: CD4093.Y, vdd: CD4093.VDD, vss: CD4093.VSS },
  cd4040: { outs: CD4040.Q, vdd: CD4040.VDD, vss: CD4040.VSS },
  cd4017: { outs: [...CD4017.Q, CD4017.CO], vdd: CD4017.VDD, vss: CD4017.VSS },
  cd4013: { outs: CD4013.OUTS, vdd: CD4013.VDD, vss: CD4013.VSS },
};

/** Every pin that puts a signal out: where a mixer's inputs come from. */
function sources(work: Work): Map<string, string> {
  const found = new Map<string, string>();
  const add = (part: Component, pin: number) => found.set(work.net(part, pin), `${part.id}::${pin}`);
  for (const [type, stages] of Object.entries(STAGES)) for (const part of work.parts(type)) for (const stage of stages) add(part, stage.out);
  for (const [type, chip] of Object.entries(LOGIC)) for (const part of work.parts(type)) for (const out of chip.outs) add(part, out);
  for (const part of work.parts('lm386')) add(part, 3);
  for (const part of work.parts('audio-input')) add(part, 0);
  for (const rail of rails(work)) found.delete(rail);
  return found;
}

/** The pairs of nets a part joins: a pot joins all three of its legs, a changeover its common to each throw. */
function joins(work: Work, part: Component): Array<[string, string]> {
  const net = (pin: number) => work.net(part, pin);
  if (part.type === 'potentiometer') return [[net(0), net(1)], [net(1), net(2)], [net(0), net(2)]];
  if (part.type === 'spdt') return [[net(0), net(1)], [net(0), net(2)]];
  return [[net(0), net(1)]];
}

/**
 * The nets that can be reached from one by going through parts of the given
 * kinds, at most `hops` of them, without passing through the supply's ends
 * or through any net in `stopAt` (which can be arrived at, but not left).
 */
function reach(work: Work, from: string, types: string[], hops: number, stopAt?: ReadonlySet<string>): Set<string> {
  const avoid = new Set(rails(work));
  const links = types.flatMap((type) => work.parts(type)).flatMap((part) => joins(work, part));
  const seen = new Set<string>();
  let edge = [from];
  for (let hop = 0; hop < hops && edge.length > 0; hop++) {
    const next: string[] = [];
    for (const [a, b] of links) {
      for (const [here, there] of [[a, b], [b, a]]) {
        if (!edge.includes(here) || there === from || seen.has(there) || avoid.has(there) || here === there) continue;
        seen.add(there);
        if (!stopAt?.has(there)) next.push(there);
      }
    }
    edge = next;
  }
  return seen;
}

/** What is heard: the nets the Audio Outs, speakers and piezos listen to. */
const ears = (work: Work): string[] => [
  ...work.parts('audio-output').map((part) => work.net(part, 0)),
  ...work.parts('speaker').flatMap((part) => [work.net(part, 0), work.net(part, 1)]),
  ...work.parts('piezo').flatMap((part) => [work.net(part, 0), work.net(part, 1)]),
].filter((net) => !rails(work).includes(net));

/**
 * Every net the sound passes on its way out: back from what is heard through
 * resistors, capacitors, knobs and switches, and back through amplifiers
 * from output to input, as far as the outputs of the chips that made it.
 */
function wayOut(work: Work): Set<string> {
  const made = new Set(sources(work).keys());
  const path = new Set<string>();
  let edge = ears(work);
  for (let round = 0; round < 4 && edge.length > 0; round++) {
    const next: string[] = [];
    for (const net of edge) {
      if (path.has(net)) continue;
      path.add(net);
      for (const reached of reach(work, net, PASSIVE, 4, made)) path.add(reached);
    }
    // Through an amplifier, from its output back to its inputs
    for (const [type, stages] of Object.entries(AMPLIFIERS)) {
      for (const part of work.parts(type)) {
        for (const stage of stages) {
          if (!path.has(work.net(part, stage.out))) continue;
          for (const pin of [stage.minus, stage.plus]) if (!path.has(work.net(part, pin))) next.push(work.net(part, pin));
        }
      }
    }
    edge = next.filter((net) => !rails(work).includes(net));
  }
  return path;
}

/** A mixer: a point on the way out where signals from two different outputs meet, each through its own resistance. */
function mixes(work: Work, path: ReadonlySet<string>): boolean {
  const made = sources(work);
  const resistive = RESISTIVE.flatMap((type) => work.parts(type));
  for (const point of path) {
    if (made.has(point)) continue;
    const arriving = new Set<string>();
    for (const part of resistive) {
      for (const [a, b] of joins(work, part)) {
        const far = a === point ? b : b === point ? a : null;
        if (far === null || far === point) continue;
        const from = made.has(far) ? [far] : [...reach(work, far, PASSIVE, 2, new Set(made.keys()))].filter((net) => net !== point && made.has(net));
        for (const net of from) arriving.add(made.get(net)!);
      }
    }
    if (arriving.size >= 2) return true;
  }
  return false;
}

/**
 * A filter: a point on the way out with a resistance leading to it and a
 * capacitor from it to ground or the supply, or an amplifier on the way out
 * with a capacitor in its way back.
 */
function filters(work: Work, path: ReadonlySet<string>): boolean {
  const ends = rails(work);
  const made = sources(work);
  const resistive = RESISTIVE.flatMap((type) => work.parts(type));
  for (const point of path) {
    if (made.has(point)) continue;
    const shunted = work.parts('capacitor').some((cap) => {
      const a = work.net(cap, 0), b = work.net(cap, 1);
      return (a === point && ends.includes(b)) || (b === point && ends.includes(a));
    });
    const fed = resistive.some((part) => joins(work, part).some(([a, b]) => (a === point && b !== point && !ends.includes(b)) || (b === point && a !== point && !ends.includes(a))));
    if (shunted && fed) return true;
  }
  for (const [type, stages] of Object.entries(AMPLIFIERS)) {
    for (const part of work.parts(type)) {
      for (const stage of stages) {
        const out = work.net(part, stage.out), minus = work.net(part, stage.minus);
        if (!path.has(out)) continue;
        if (reach(work, out, ['capacitor'], 2).has(minus)) return true;
      }
    }
  }
  return false;
}

/** A control: something on the cover that the player works. */
interface Control {
  part: Component;
  parameter: string;
  /** Where it is put while the others are tried. */
  rest: number;
  /** Where it is moved to, to see whether it does anything. */
  moves: number[];
}

const CONTROLS: Record<string, Omit<Control, 'part'>> = {
  potentiometer: { parameter: 'position', rest: 0.5, moves: [0.9, 0.1] },
  ldr: { parameter: 'light', rest: 0.5, moves: [0.9, 0.1] },
  'body-contact': { parameter: 'touch', rest: 0.5, moves: [1, 0] },
  'audio-input': { parameter: 'level', rest: 0.5, moves: [1, 0] },
  switch: { parameter: 'closed', rest: 1, moves: [0] },
  pushbutton: { parameter: 'closed', rest: 1, moves: [0] },
  spdt: { parameter: 'throw', rest: 0, moves: [1] },
  piezo: { parameter: 'tap', rest: 0, moves: [1] },
};

const controls = (work: Work): Control[] =>
  Object.entries(CONTROLS).flatMap(([type, control]) => work.parts(type).map((part) => ({ part, ...control })));

/**
 * The instrument is tried at a lower rate than it is played at: quick, and
 * still every edge in its place. The first trial is the long one: it has to
 * see a slow oscillator go round.
 */
const TRIAL = { seconds: 1.2, sampleRate: 24000 };
const FIRST_TRIAL = { seconds: 2.5, sampleRate: 24000 };

/** Whether two recordings are of different sounds: a control that does nothing leaves every sample where it was. */
function differ(a: Float32Array, b: Float32Array): boolean {
  let apart = 0, size = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    apart += (a[i] - b[i]) ** 2;
    size += a[i] ** 2 + b[i] ** 2;
  }
  return size > 0 && apart > size * 0.001;
}

/** How a circuit stands against the brief. */
interface Brief {
  sounds: boolean;
  /** How many oscillators are going. */
  oscillators: number;
  /** One of them is pushed about by something: its cycles are not all the same length. */
  controlled: boolean;
  /** Light or touch changes the sound. */
  played: boolean;
  /** A gate or a counter is at work. */
  counts: boolean;
  /** There is a mixer or a filter on the way out. */
  shaped: boolean;
  /** How many controls have no name. */
  unnamed: number;
  /** The named controls that change nothing that can be heard. */
  idle: string[];
}

// What the brief finds does not depend on where the knobs stand (each is
// tried in its own two places), so a knob being turned asks nothing new
const briefs = new Map<string, Brief>();

function signature(work: Work): string {
  const live = new Set(Object.values(CONTROLS).map((control) => control.parameter));
  return JSON.stringify([
    work.circuit.getComponents().map((part) => [
      part.id, part.type, (part.label ?? '').trim() !== '',
      Object.entries(part.parameters).filter(([key]) => !(CONTROLS[part.type] && live.has(key))),
    ]),
    work.circuit.getConnections().map((c) => [c.from.componentId, c.from.pinId, c.to.componentId, c.to.pinId]),
  ]);
}

function brief(work: Work): Brief {
  const key = signature(work);
  const known = briefs.get(key);
  if (known) return known;
  const found = readBrief(work);
  if (briefs.size > 30) briefs.delete(briefs.keys().next().value!);
  briefs.set(key, found);
  return found;
}

function readBrief(work: Work): Brief {
  const all = controls(work);
  const named = (control: Control) => (control.part.label ?? '').trim() !== '';
  const nothing: Brief = { sounds: false, oscillators: 0, controlled: false, played: false, counts: false, shaped: false, unnamed: all.filter((c) => !named(c)).length, idle: [] };
  if (ears(work).length === 0) return nothing;

  // Every stage that might be an oscillator, and every counting chip's outputs, are watched on one run
  const stages = Object.entries(STAGES).flatMap(([type, list]) => work.parts(type).flatMap((part) => list
    .filter((stage) => (stage.back ?? [stage.out]).some((back) => {
      const round = reach(work, work.net(part, back), FEEDBACK, 3);
      return stage.ins.some((pin) => round.has(work.net(part, pin)));
    }))
    .map((stage) => ({ part, pin: stage.out }))));
  const logic = Object.entries(LOGIC).flatMap(([type, chip]) => work.parts(type)
    .filter((part) => work.net(part, chip.vdd) !== work.net(part, chip.vss) && work.grounded(part, chip.vss))
    .flatMap((part) => chip.outs.map((pin) => ({ part, pin }))));
  // Where every control is put while one is tried: at rest, or (`others`) with every other switch and button the other way
  const toggles = ['switch', 'pushbutton'];
  const tried = (moved?: { control: Control; to: number }, others: 'rest' | 'open' = 'rest') => work.bench({
    ...(moved || others === 'open' ? TRIAL : FIRST_TRIAL),
    set: all.map((control) => ({
      componentId: control.part.id,
      parameter: control.parameter,
      value: moved && control.part.id === moved.control.part.id ? moved.to
        : others === 'open' && toggles.includes(control.part.type) ? 0 : control.rest,
    })),
    watch: moved || others === 'open' ? [] : [...stages, ...logic].slice(0, 40).map(({ part, pin }) => [part, pin] as const),
  });
  const base = tried();
  const swing = base.sound.max - base.sound.min;
  const sounds = swing > 0.02;

  let oscillators = 0, controlled = false;
  for (const { part, pin } of stages) {
    const trace = base.trace(part.id, part.pins[pin].id);
    // Once round is enough to be an oscillator; whether its cycles are all alike takes a few
    if (!trace || turns(trace) < 2) continue;
    oscillators++;
    const spans = periods(trace);
    if (spans.length < 2) continue;
    const sorted = [...spans].sort((a, b) => a - b);
    const middle = sorted[sorted.length >> 1];
    // A cycle is out of step when it is off by more than the trace can be read to
    if (sorted[sorted.length - 1] - sorted[0] > Math.max(middle * 0.15, 3)) controlled = true;
  }
  // A gate or a counter is at work if one of its outputs moves at all: a step of a sequence comes round slowly
  const counts = logic.some(({ part, pin }) => {
    const trace = base.trace(part.id, part.pins[pin].id);
    return trace !== null && turns(trace) >= 1;
  });

  const path = wayOut(work);
  const shaped = mixes(work, path) || filters(work, path);

  // A control does something if moving it changes the sound: with the others
  // at rest, or (two switches side by side each do nothing while the other
  // is closed) with every other switch and button open
  const changes = (control: Control) =>
    control.moves.some((to) => differ(base.soundTrace, tried({ control, to }).soundTrace))
    || control.moves.some((to) => differ(tried({ control, to: control.rest }, 'open').soundTrace, tried({ control, to }, 'open').soundTrace));
  const played = sounds && all.some((control) => (control.part.type === 'ldr' || control.part.type === 'body-contact') && changes(control));
  // Each trial is a run of its own, so the names are only gone through once the rest of the brief is met
  const rest = sounds && oscillators >= 2 && controlled && played && counts && shaped;
  const idle = rest ? all.filter((control) => named(control) && !changes(control)).map((control) => control.part.label!.trim().toUpperCase()) : [];
  return { sounds, oscillators, controlled, played, counts, shaped, unnamed: nothing.unnamed, idle };
}

/** What the instrument still lacks, in the order of the brief. */
function missing(work: Work): string[] {
  const found = brief(work);
  const lacks: string[] = [];
  if (!found.sounds) lacks.push('a sound (the app tries it with every switch closed, every button held and every knob half way)');
  if (found.oscillators < 2) lacks.push(found.oscillators === 1 ? 'a second oscillator' : 'two oscillators');
  else if (!found.controlled) lacks.push('one oscillator controlling the other');
  if (!found.played) lacks.push('something played by light or touch');
  if (!found.counts) lacks.push('a gate or a counter');
  if (!found.shaped) lacks.push('a mixer or a filter before the output');
  if (found.unnamed > 0) lacks.push(found.unnamed === 1 ? 'a name for the last control' : `names for ${found.unnamed} controls`);
  if (found.idle.length > 0) lacks.push(`${found.idle.join(' and ')} to change the sound`);
  if (work.situation.strained) lacks.push('a lighter load (the indicator at the top is out of the green)');
  return lacks;
}

const meetsBrief = (work: Work) => {
  const found = brief(work);
  return found.sounds && found.oscillators >= 2 && found.controlled && found.played && found.counts && found.shaped
    && found.unnamed === 0 && found.idle.length === 0;
};

// ---------------------------------------------------------------------------
// The circuits
// ---------------------------------------------------------------------------

const example = (name: string): Built => exampleCircuits.find((entry) => entry.name === name)!.build();

/** Class 4's oscillator with a bend kept: a switch and 10 kΩ across its two timing resistors. */
function bentOscillator(): Built {
  const { components, connections } = simplestOscillatorKept();
  const chip = components.find((part) => part.type === 'cd40106')!;
  const jumper = resistor(10000, 360, 520);
  const bend = place('switch', 500, 520, { parameters: { closed: 0 } });
  return {
    components: [...components, jumper, bend],
    connections: [...connections, connect(chip, CD40106.A[0], jumper, 0), connect(jumper, 1, bend, 0), connect(bend, 1, chip, CD40106.Y[0])],
  };
}

const weirdSoundGenerator = (): Built => example('MFOS Weird Sound Generator');

/**
 * An instrument that meets the brief, with nothing new in it: a slow
 * oscillator gates a quick one whose pitch is set by light, a counter adds
 * the octave below, the two are mixed, and a knob takes the edge off.
 */
function instrument(names: { rate?: string; light?: string; gate?: string; sub?: string; tone?: string } = {}): Built {
  const label = (name?: string) => (name ? { label: name } : {});
  const knob = (ohms: number, x: number, y: number, name?: string) =>
    place('potentiometer', x, y, { ...label(name), parameters: { maxResistance: ohms, value: formatValue(ohms, 'resistance'), position: 0.5 } });
  const supply = place('power', 200, 100);
  const supplyGround = ground(200, 200);
  const chip = place('cd40106', 520, 300);
  const chipGround = ground(640, 160);
  // The slow one: an LFO
  const rate = knob(1e6, 360, 480, names.rate);
  const rateLimit = resistor(10000, 240, 480);
  const slowCap = capacitor(220e-9, 240, 340, 90);
  const slowGround = ground(240, 420);
  // The quick one: its pitch is the light on the photocell
  const light = place('ldr', 600, 480, { ...label(names.light), parameters: { light: 0.5 } });
  const lightLimit = resistor(10000, 720, 480);
  const quickCap = capacitor(100e-9, 840, 400, 90);
  const quickGround = ground(840, 480);
  // The slow one gates the quick one
  const gate = place('switch', 700, 600, { ...label(names.gate), parameters: { closed: 1 } });
  const diode = place('1n914', 820, 600, { rotation: 180 });
  // A counter for the octave below
  const counter = place('cd4040', 1000, 280);
  const counterGround = ground(1120, 140);
  const sub = place('switch', 1160, 240, { ...label(names.sub), parameters: { closed: 1 } });
  // Mixed, then filtered
  const mixHigh = resistor(100000, 1280, 360);
  const mixLow = resistor(100000, 1280, 240);
  const tone = knob(100000, 1420, 300, names.tone);
  const toneCap = capacitor(10e-9, 1540, 380, 90);
  const toneGround = ground(1540, 460);
  const out = place('audio-output', 1640, 300);

  const components = [
    supply, supplyGround, chip, chipGround, rate, rateLimit, slowCap, slowGround, light, lightLimit, quickCap, quickGround,
    gate, diode, counter, counterGround, sub, mixHigh, mixLow, tone, toneCap, toneGround, out,
  ];
  const connections = [
    connect(supply, 1, supplyGround, 0),
    connect(supply, 0, chip, CD40106.VDD),
    connect(chip, CD40106.VSS, chipGround, 0),
    connect(supply, 0, counter, CD4040.VDD),
    connect(counter, CD4040.VSS, counterGround, 0),
    connect(counter, CD4040.RST, counterGround, 0),
    // The LFO: 1Y, the knob, 10 kΩ, back to 1A
    connect(chip, CD40106.Y[0], rate, 2),
    connect(rate, 0, rate, 1),
    connect(rate, 0, rateLimit, 1),
    connect(rateLimit, 0, chip, CD40106.A[0]),
    connect(slowCap, 0, chip, CD40106.A[0]),
    connect(slowCap, 1, slowGround, 0),
    // The voice: 2Y, the photocell, 10 kΩ, back to 2A
    connect(chip, CD40106.Y[1], light, 0),
    connect(light, 1, lightLimit, 0),
    connect(lightLimit, 1, chip, CD40106.A[1]),
    connect(quickCap, 0, chip, CD40106.A[1]),
    connect(quickCap, 1, quickGround, 0),
    // The gate: while 1Y is low the diode holds 2A low
    connect(chip, CD40106.Y[0], gate, 0),
    connect(gate, 1, diode, 1),
    connect(diode, 0, chip, CD40106.A[1]),
    // The counter halves the voice
    connect(chip, CD40106.Y[1], counter, CD4040.CLK),
    connect(counter, CD4040.Q[0], sub, 0),
    connect(sub, 1, mixLow, 0),
    connect(chip, CD40106.Y[1], mixHigh, 0),
    // The two meet, and go on through the tone knob
    connect(mixHigh, 1, mixLow, 1),
    connect(mixHigh, 1, tone, 2),
    connect(tone, 0, tone, 1),
    connect(tone, 0, toneCap, 0),
    connect(toneCap, 1, toneGround, 0),
    connect(tone, 0, out, 0),
  ];
  return { components, connections };
}

/** What the class keeps: the instrument with every control named. */
export const bendingKept = (): Built => instrument({ rate: 'RATE', light: 'SHADOW', gate: 'CHOP', sub: 'SUB', tone: 'TONE' });

// ---------------------------------------------------------------------------
// The class
// ---------------------------------------------------------------------------

const onWsg = (work: Work, ask: (it: Wsg) => boolean): boolean => {
  const it = wsg(work);
  return it !== null && ask(it);
};

/** The Weird oscillator by itself: neither of the other two reaching it. */
const alone = (it: Wsg) => isOpen(it.wackiness) && position(it.zaniness) <= 0.05;

/** Class 14: break a circuit's rules, read the largest one, and build one of your own. */
export const bending: ClassDefinition = {
  id: 'bending',
  number: 14,
  unit: 'Your own instrument',
  title: 'Bending, and the Weird Sound Generator',
  promise: 'You break a circuit\'s rules on purpose, read the largest circuit in the app, and then build an instrument of your own.',
  startsFrom: 'The oscillator from class 4, at 441 Hz, with its SOUND switch. It is the Simple Oscillator in Examples.',
  start: simplestOscillatorKept,

  build: [
    playStep('The oscillator from class 4 plays its 441 Hz.'),
    {
      id: 'bend',
      text: 'Press BEND at the top and pick 10K. Press on one end of the two resistors in a line, drag to their other end, and hold.',
      how: 'While you hold, a wire with a 10 kΩ resistor in it joins the two points. It is a resistor beside the other two, as in class 2: less resistance, so the note jumps from 441 Hz to 1.68 kHz. Let go and it is gone. Nothing in the circuit has changed.',
      done: (work) => work.situation.playing && work.bent() !== null,
    },
    {
      id: 'others',
      text: 'Pick FINGER and hold the same two points. Then try WIRE. Then try points you have no reason to try.',
      how: 'FINGER is half a megohm, about what a licked finger is: the note only rises to 466 Hz. WIRE is a plain wire: across the resistors it stops the oscillator. In the app nothing can be harmed, so try anything.',
      done: (work) => {
        const bend = work.bent();
        return work.situation.playing && bend !== null && !near(bend.ohms, 10000);
      },
    },
    {
      id: 'starve',
      text: 'Put the bend tool away: the × at the end of its bar. Click the supply and turn its STARVE knob to half way.',
      how: 'STARVE puts resistance between the battery and the circuit, like a battery running flat. At half way the chip has 8.28 V, not 9 V, and the note has risen to 540 Hz. Further round it falls again, and the sound gets quieter.',
      done: (work) => starved(work) >= 0.45 && firstOscillator(work) !== undefined,
    },
    {
      id: 'keep-bend',
      text: 'Turn STARVE back down. Bend again, and when one sounds good press SWITCH beside KEEP IT AS A.',
      how: 'The app puts a switch where the jumper was, with the jumper\'s resistor in line. Now the bend is part of the circuit. Close the switch to hear it.',
      done: (work) => keptBend(work) !== undefined,
    },
    {
      id: 'open',
      text: 'Save this one if you want it. Then open Examples at the top and pick the MFOS Weird Sound Generator.',
      how: 'It is the largest circuit in the app, a design by Ray Wilson. Listen to it for a while before reading on.',
      done: (work) => wsg(work) !== null,
    },
    {
      id: 'three',
      text: 'Find the chip. Right-click the wires on 1Y, 2Y and 3Y to put a probe on each.',
      how: 'It is the chip from class 4, with three of its inverters wired as oscillators. 1Y is Weird, the one that is heard. 2Y is Wacky, near 90 Hz. 3Y is Zany, an LFO at 3.2 Hz.',
      done: (work) => onWsg(work, (it) => [WEIRD, WACKY, ZANY].every((k) => work.probed(it.chip, CD40106.Y[k]))),
    },
    {
      id: 'half',
      text: 'Find the op-amp at the right. Click the wire on its + input to read it with the meter.',
      how: 'It reads 4.50 V. The two 100 kΩ resistors above it are a divider, and the 220 µF holds the point steady: half supply, as in class 12.',
      done: (work) => work.situation.playing && onWsg(work, (it) => work.metered(it.amp, LM741.IN_PLUS)),
    },
  ],

  why: [
    {
      title: 'Bending',
      text: 'To bend a circuit is to join points that were never meant to be joined, and listen. The wire you join them with is a jumper. Nobody designs these sounds. They are found.',
    },
    {
      title: 'Three habits',
      text: 'Change one thing at a time, and check the circuit still works after each. Write down what you liked, because you may not find it again. And if it sounds good, it is good, whether or not you can explain it yet.',
    },
    {
      title: 'On a real board',
      text: 'There is one more rule there: only bend something that runs on batteries. Never open anything that plugs into the wall. The app is kinder still: a real chip can be killed by a jumper in the wrong place, and here nothing can.',
    },
    {
      title: 'Starving',
      text: 'To starve a circuit is to give it less supply than it wants. The chip\'s thresholds move with its supply, so pitch moves. And when two oscillators share a starved supply, each one pulls it about for the other, so they start to bend each other.',
    },
    {
      title: 'Nothing in it is new',
      text: 'The Weird Sound Generator is made of things you have built. Weird, Wacky and Zany are Schmitt trigger oscillators, each with a knob and a resistor in line for its pitch. The diode from Wacky to Weird\'s input is a gate. The transistor across Weird\'s pitch knob is a switch worked by a voltage, and Zany works it. The 1 MΩ over 1 kΩ is a divider that makes the square wave small. The op-amp with ODDNESS is a filter with resonance. The 1 µF before the output is a coupling capacitor.',
    },
    {
      title: 'Reading a big circuit',
      text: 'Do not read it all at once. Find the supply. Find each chip and ask what each part of it is doing. Find where the sound leaves, and walk back from there. Then switch things off until one part is left that you understand, and bring the others back one at a time. The experiments do just that.',
    },
  ],

  tries: [
    {
      id: 'wackiness',
      title: 'Wacky let go',
      question: 'With the Weird Sound Generator playing, open the WACKINESS switch. It is in line with the diode from Wacky to Weird. Weird will…',
      options: ['Stop', 'Run free, still jumping in pitch', 'Carry on as before'],
      answer: 1,
      change: 'Click WACKINESS on the canvas, or flip it on the cover.',
      made: (work) => onWsg(work, (it) => isOpen(it.wackiness) && position(it.zaniness) > 0.3),
      result: (work) => {
        const it = wsg(work)!;
        const run = heard(work, it);
        const range = pitches(run, it, WEIRD)!;
        return `Weird now jumps between ${formatHertz(range.low)} and ${formatHertz(range.high)}, ${hertzOf(run, it, ZANY)!.toFixed(1)} times a second. That is Zany, switching the transistor across Weird's knob. Wacky no longer reaches it.`;
      },
    },
    {
      id: 'zaniness',
      title: 'Zany let go',
      question: 'Leave WACKINESS open. Turn ZANINESS all the way down. It is a divider on Zany\'s output, on the way to the transistor\'s base. Weird will…',
      options: ['Stay on its lower pitch', 'Stay on its higher pitch', 'Stop'],
      answer: 0,
      change: 'Turn the ZANINESS knob to 0.',
      made: (work) => onWsg(work, alone),
      result: (work) => {
        const it = wsg(work)!;
        return `A steady ${formatHertz(hertzOf(heard(work, it), it, WEIRD)!)}. With nothing on its base the transistor never switches on, so Weird's knob is never bypassed. This is the oscillator from class 4, by itself.`;
      },
    },
    {
      id: 'weird',
      title: 'The pitch knob',
      question: 'Weird is alone now. Turn WEIRD down to about a quarter. The note will be…',
      options: ['Lower', 'Higher', 'The same'],
      answer: 0,
      change: 'Turn the WEIRD knob down to a quarter or less.',
      made: (work) => onWsg(work, (it) => alone(it) && position(it.weird) <= 0.3),
      result: (work) => {
        const it = wsg(work)!;
        return `${formatHertz(hertzOf(heard(work, it), it, WEIRD)!)}, down from 282 Hz. The knob is a variable resistor in the oscillator's way back, as in class 5. Turn it back up to where it was.`;
      },
    },
    {
      id: 'oddness',
      title: 'The filter',
      question: 'Weird is still alone. Turn ODDNESS down to about a tenth. The note will be…',
      options: ['Louder', 'Quieter', 'The same'],
      answer: 1,
      change: 'Turn the ODDNESS knob down to a tenth or less.',
      made: (work) => onWsg(work, (it) => alone(it) && position(it.oddness) <= 0.15 && position(it.weird) > 0.3),
      result: (work) => {
        const it = wsg(work)!;
        const now = heard(work, it);
        const hertz = hertzOf(now, it, WEIRD)!;
        const before = work.bench({ seconds: 1, set: [{ componentId: it.oddness.id, parameter: 'position', value: 0.9 }] });
        const times = fundamental(before, hertz) / fundamental(now, hertz);
        return `Quieter: the fundamental is ${times.toFixed(1)} times smaller. ODDNESS moves the filter's resonance. Where the knob stood, the resonance sat on Weird's ${formatHertz(hertz)} and lifted it. Now it is somewhere else, and the note falls back. Turn it back up.`;
      },
    },
    {
      id: 'sync',
      title: 'Wacky takes hold',
      question: 'Weird is alone at 282 Hz, and Wacky runs near 90 Hz. Close WACKINESS again. The note will be at…',
      options: ['282 Hz, as it was', 'Wacky\'s frequency', 'Somewhere in between'],
      answer: 1,
      change: 'Close the WACKINESS switch. Leave ZANINESS at 0.',
      made: (work) => onWsg(work, (it) => !isOpen(it.wackiness) && position(it.zaniness) <= 0.05 && position(it.weird) > 0.3),
      result: (work) => {
        const it = wsg(work)!;
        const run = heard(work, it);
        return `Weird is at ${formatHertz(hertzOf(run, it, WEIRD)!)}, and Wacky at ${formatHertz(hertzOf(run, it, WACKY)!)}. Each time Wacky goes low the diode empties Weird's capacitor, so Weird has to start again in step with it. A gate, worked fast enough, sets the pitch.`;
      },
    },
  ],

  check: {
    goal: 'Build an instrument of your own. Start from anything: this circuit, one you kept, or an empty canvas. It needs two oscillators, one controlling the other. Something played by light or touch. A gate or a counter. A mixer or a filter before the output. A name on every control. And a load that stays in the green while it plays.',
    reading: (work) => {
      if (work.circuit.getComponents().length === 0) return null;
      const lacks = missing(work);
      return lacks.length === 0 ? 'It meets the brief.' : `Still missing: ${lacks.join('; ')}.`;
    },
    passed: (work) => work.situation.playing && !work.situation.strained && meetsBrief(work),
    hint: 'There is no one answer, so nothing is calculated here. One way: an LFO gates a second oscillator through a diode, as in class 6. A photocell sets the second one\'s pitch, as in class 5. A counter adds the octave below, as in class 8. Two resistors mix them, and a knob and a capacitor to ground take the edge off, as in class 13. The app tries your instrument with every switch closed, every button held and every knob half way, and then moves each control by itself.',
  },

  keep: [
    {
      id: 'cover',
      text: 'Look at the cover. Would someone else know what each control does from its name?',
      how: 'The COVER tab at the top left, or the Tab key. Click a name on the cover to change it.',
      done: (work) => work.situation.view === 'cover' && ears(work).length > 0 && controls(work).length > 0 && brief(work).unnamed === 0,
    },
    {
      id: 'save',
      text: 'Save it. Then, in the same place, export it to a file.',
      how: 'A saved circuit stays in this browser. A file can be sent to someone, who can open it with Load.',
      done: (work) => work.situation.saved && ears(work).length > 0 && controls(work).length > 0 && brief(work).unnamed === 0,
    },
  ],

  words: [
    { word: 'Bend', meaning: 'To join two points of a circuit that were not meant to be joined, to hear what it does.' },
    { word: 'Jumper', meaning: 'The wire a bend is made with. It may have a resistor in it, or be a finger.' },
    { word: 'Starve', meaning: 'To give a circuit less supply than it wants.' },
  ],

  // An instrument that meets the brief but for its names. It is here for the tests and as a pattern:
  // "Stuck?" is gone once the build is done, so the learner's own instrument is the learner's own
  circuit: () => instrument(),
  stages: [
    { upTo: 'keep-bend', circuit: bentOscillator },
    { upTo: 'half', circuit: weirdSoundGenerator },
  ],
};
