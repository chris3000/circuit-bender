import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { inputJackArt } from '@/components/art/partArt';
import { inputJackBoard } from '@/components/art/boardArt';

/** Room to the right of the symbol for the small knob that sets the level. */
const KNOB_ROOM = { right: 20 };

/** What it can play, in the order the simulation has them: the `wave` parameter is the place in this list. */
export const SIGNAL_WAVE_NAMES = ['Sine', 'Triangle', 'Square', 'Saw', 'Plucked string', 'Noise'];

/**
 * A signal coming in from outside: the socket a guitar, a player or another
 * circuit would be plugged into. Nothing is plugged into a browser, so it
 * makes the signal itself: a test tone, a plucked string, hiss.
 */
export const audioInputDefinition: ComponentDefinition = {
  type: 'audio-input',
  metadata: {
    name: 'Audio In',
    category: 'power',
    description: 'A signal from outside to feed into a circuit: a test tone, a plucked string or noise, at the pitch and level you set',
  },
  pins: [
    { id: generatePinId('audio-input', 0), label: 'OUT', type: 'output', position: { x: 0, y: -20 } },
  ],
  defaultParameters: { wave: 0, frequency: 220, volts: 1, level: 1 },
  shelf: {
    title: 'Audio in', caption: 'Signal to feed in', art: inputJackArt,
    keywords: ['input', 'signal', 'source', 'generator', 'tone', 'sine', 'square', 'triangle', 'guitar', 'line', 'jack', 'socket', 'test', 'oscillator', 'noise'],
  },
  control: { kind: 'dial', parameter: 'level', name: 'Level', at: { x: 28, y: -4 }, rest: 1 },
  cover: { control: 'knob', parameter: 'level', name: 'INPUT' },
  schematic: {
    symbol: {
      width: 40, height: 40,
      render: (params) => (
        <g>
          <line x1="0" y1="-20" x2="0" y2="-12" stroke="currentColor" strokeWidth="2" />
          <circle cx="0" cy="-1" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
          {/* One cycle of what it plays */}
          <path d={WAVE_SHAPES[Number(params.wave)] ?? WAVE_SHAPES[0]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          <text x="0" y="19" textAnchor="middle" fontSize="8" fill="currentColor">AUDIO IN</text>
        </g>
      ),
    },
    dimensions: { width: 40, height: 40 },
    overhang: KNOB_ROOM,
  },
  board: {
    symbol: { width: 40, height: 40, render: inputJackBoard },
    dimensions: { width: 40, height: 40 },
    overhang: KNOB_ROOM,
  },
};

/** One cycle of each wave, in the order of `SIGNAL_WAVE_NAMES`. */
const WAVE_SHAPES = [
  'M -7,-1 Q -3.5,-9 0,-1 Q 3.5,7 7,-1',
  'M -7,-1 L -3.5,-6 L 3.5,4 L 7,-1',
  'M -7,3 L -7,-5 L 0,-5 L 0,3 L 7,3 L 7,-5',
  'M -7,3 L 0,-5 L 0,3 L 7,-5 L 7,3',
  'M -7,-1 L -5,-7 L -3,4 L -1,-5 L 1,2 L 3,-3 L 5,0 L 7,-1',
  'M -7,-1 L -5.5,-5 L -4,2 L -2.5,-6 L -1,4 L 0.5,-2 L 2,3 L 3.5,-5 L 5,1 L 7,-2',
];
