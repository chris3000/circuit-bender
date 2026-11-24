/**
 * The course: fourteen classes in five units, from a light with a switch to
 * an instrument of the learner's own. The design is in
 * docs/superpowers/specs/2026-11-23-tutorial-classes-design.md; a class is
 * on this list from the start and in `CLASSES` (./index) once it is built.
 */
export interface SyllabusEntry {
  number: number;
  title: string;
  /** What gets built. */
  builds: string;
  /** The id of its ClassDefinition, once it has one. */
  id?: string;
}

export interface SyllabusUnit {
  title: string;
  classes: SyllabusEntry[];
}

export const SYLLABUS: SyllabusUnit[] = [
  {
    title: 'Light',
    classes: [
      { number: 1, title: 'The loop', builds: 'A light with a switch', id: 'the-loop' },
      { number: 2, title: 'Sharing voltage', builds: 'A light meter and a dimmer' },
      { number: 3, title: 'Storing charge', builds: 'A light that fades' },
    ],
  },
  {
    title: 'Sound',
    classes: [
      { number: 4, title: 'The simplest oscillator', builds: 'A blinker that becomes a tone' },
      { number: 5, title: 'Playing it', builds: 'Pitch from a knob, light and skin' },
      { number: 6, title: 'More voices', builds: 'A chord, and one oscillator switching another' },
    ],
  },
  {
    title: 'Logic and rhythm',
    classes: [
      { number: 7, title: 'Gates', builds: 'A key and a beeper' },
      { number: 8, title: 'Counting', builds: 'A binary counter and an octave stack' },
      { number: 9, title: 'The 555', builds: 'A timer, a siren, the Atari Punk Console' },
      { number: 10, title: 'Steps', builds: 'A chaser and a sequencer' },
    ],
  },
  {
    title: 'Bigger sound',
    classes: [
      { number: 11, title: 'A small current controls a big one', builds: 'A touch lamp and a night light' },
      { number: 12, title: 'Amplifiers', builds: 'A mixer and a speaker amp' },
      { number: 13, title: 'Tone', builds: 'A tone knob and a resonant filter' },
    ],
  },
  {
    title: 'Your own instrument',
    classes: [
      { number: 14, title: 'Bending, and the Weird Sound Generator', builds: 'Your own instrument' },
    ],
  },
];
