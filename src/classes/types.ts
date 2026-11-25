import type { Component, Connection } from '@/types/circuit';
import type { Work } from './Work';

/**
 * One small thing to do. The app can tell when it has been done by looking
 * at the learner's own circuit; once done it stays done, whatever is taken
 * apart afterwards.
 */
export interface Step {
  id: string;
  /** What to do. */
  text: string;
  /** How to do it, for someone who has not done such a thing before. */
  how?: string;
  done: (work: Work) => boolean;
}

/** An experiment: guess, change one thing, look. */
export interface Experiment {
  id: string;
  title: string;
  /** What to guess before trying, and the answers to pick from. */
  question: string;
  options: string[];
  /** Which of the options is what happens. */
  answer: number;
  /** The change to make. */
  change: string;
  /** Whether the learner's circuit now has that change in it. */
  made: (work: Work) => boolean;
  /** What it shows, with numbers read off the learner's own circuit. */
  result: (work: Work) => string;
}

/** The goal that finishes a class: something the app measures on the learner's circuit. */
export interface Check {
  goal: string;
  /** What the circuit reads now, in words ("Your LED: 14.5 mA"), or null if there is nothing to read yet. */
  reading: (work: Work) => string | null;
  passed: (work: Work) => boolean;
  /** For whoever is stuck. Calculated rather than measured, and it says so. */
  hint: string;
}

/** A circuit as code builds it, like an example. */
export interface Built {
  components: Component[];
  connections: Connection[];
}

/**
 * The circuit as it stands part of the way through the build, once the step
 * `upTo` and every step before it is done. A class that builds several
 * things one after another has one for each; "Stuck?" puts the one for the
 * step being worked on onto the canvas.
 */
export interface Stage {
  upTo: string;
  circuit: () => Built;
}

export interface ClassDefinition {
  id: string;
  number: number;
  unit: string;
  title: string;
  /** One sentence: what will be on the canvas at the end. */
  promise: string;
  /** What the class starts from, in words. */
  startsFrom: string;
  /** The circuit it starts from, when that is not an empty canvas: what an earlier class kept, built by code. */
  start?: () => Built;
  build: Step[];
  /** What is going on: read once the thing works. */
  why: Array<{ title: string; text: string }>;
  tries: Experiment[];
  check: Check;
  keep: Step[];
  words: Array<{ word: string; meaning: string }>;
  /**
   * The class's circuit, built by code like an example: as it stands at the
   * end of the build, and for whoever is stuck. The class's test measures
   * the numbers the class quotes on it.
   */
  circuit: () => Built;
  /** The circuits on the way there, in the order of the build, for a class that builds more than one thing. */
  stages?: Stage[];
}

/** The parts of a class, in the order they are met. */
export const SECTIONS = [
  { id: 'build', label: 'Build', title: 'Build it' },
  { id: 'why', label: 'Why', title: 'What is going on' },
  { id: 'try', label: 'Try', title: 'Guess, change, look' },
  { id: 'check', label: 'Check', title: 'Check' },
  { id: 'keep', label: 'Keep', title: 'Keep it' },
  { id: 'words', label: 'Words', title: 'New words' },
] as const;
export type Section = typeof SECTIONS[number]['id'];
