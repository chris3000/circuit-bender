/**
 * Examples for what a circuit runs on and is heard through: the supply, the
 * signal from outside, the piezo disc, the LM386 and the speaker it drives,
 * and the two parts that decide where a wire goes, the junction and the
 * changeover switch.
 */
import { capacitor, connect, ground, namedSwitch, place, resistor } from '@/examples/circuits';
import { LED, LM386, POWER } from '@/classes/kit';
import type { ExampleBuild, PartExample } from './types';

const SPDT = { COM: 0, A: 1, B: 2 };
/** The piezo disc and the speaker have their pins alike: + and −. */
const DISC = { PLUS: 0, MINUS: 1 };

// --- The supply: a loop of its own, with nothing in it but a resistor and an LED ---

function supplied(): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const limit = resistor(1000, 340, 200);
  const led = place('led', 460, 300, { rotation: 90 });
  const ledGround = ground(460, 400);
  return {
    components: [supply, supplyGround, limit, led, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
    featured: supply,
  };
}

// --- The amplifier: something small to listen to, an LM386, and what it is heard through ---

/** A weak signal, in volts at its peak: about what a guitar gives. Twenty times this is well inside what the amplifier can put out. */
export const WEAK_VOLTS = 0.1;

/** A weak tone from Audio In, made strong enough for a speaker: the LM386, and 220 µF to the speaker. */
function amplified(feature: 'input' | 'amplifier' | 'speaker'): ExampleBuild {
  const supply = place('power', 200, 140);
  const supplyGround = ground(200, 240);
  const input = place('audio-input', 300, 340, { label: 'LEVEL', parameters: { volts: WEAK_VOLTS } });
  const amp = place('lm386', 460, 271);
  const ampGround = ground(400, 380);
  const pass = capacitor(220e-6, 560, 280);
  const speaker = place('speaker', 680, 290);
  const speakerGround = ground(630, 380);
  return {
    components: [supply, supplyGround, input, amp, ampGround, pass, speaker, speakerGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, amp, LM386.VS),
      connect(input, 0, amp, LM386.IN_PLUS),
      connect(amp, LM386.IN_MINUS, ampGround, 0),
      connect(amp, LM386.GND, ampGround, 0),
      connect(amp, LM386.OUT, pass, 0),
      connect(pass, 1, speaker, DISC.PLUS),
      connect(speaker, DISC.MINUS, speakerGround, 0),
    ],
    featured: feature === 'input' ? input : feature === 'amplifier' ? amp : speaker,
  };
}

/** The piezo disc as a microphone: what a knock gives, through the LM386 to an Audio Out. */
function knocked(): ExampleBuild {
  const supply = place('power', 200, 140);
  const supplyGround = ground(200, 240);
  // Turned round, so that its legs face the amplifier
  const disc = place('piezo', 300, 270, { rotation: 180, label: 'KNOCK' });
  const amp = place('lm386', 460, 271);
  const ampGround = ground(400, 380);
  const out = place('audio-output', 580, 340);
  return {
    components: [supply, supplyGround, disc, amp, ampGround, out],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, amp, LM386.VS),
      connect(disc, DISC.PLUS, amp, LM386.IN_PLUS),
      connect(disc, DISC.MINUS, ampGround, 0),
      connect(amp, LM386.IN_MINUS, ampGround, 0),
      connect(amp, LM386.GND, ampGround, 0),
      connect(amp, LM386.OUT, out, 0),
    ],
    featured: disc,
  };
}

// --- Where a wire goes: to two places at once, or to one of two ---

/** One switch, and a dot after it where the wire divides for two LEDs. */
function divided(): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const both = namedSwitch('BOTH', 320, 200, false);
  const dot = place('junction', 400, 200);
  const upper = resistor(1000, 480, 140);
  const upperLed = place('led', 600, 140);
  const lower = resistor(1000, 480, 260);
  const lowerLed = place('led', 600, 260);
  const ledGround = ground(700, 340);
  return {
    components: [supply, supplyGround, both, dot, upper, upperLed, lower, lowerLed, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, both, 0),
      connect(both, 1, dot, 0),
      connect(dot, 0, upper, 0),
      connect(dot, 0, lower, 0),
      connect(upper, 1, upperLed, LED.A),
      connect(lower, 1, lowerLed, LED.A),
      connect(upperLed, LED.K, ledGround, 0),
      connect(lowerLed, LED.K, ledGround, 0),
    ],
    featured: dot,
  };
}

/** A changeover switch that sends the supply to LED A or to LED B. */
function chosen(): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const limit = resistor(1000, 340, 200);
  const select = place('spdt', 460, 200, { label: 'SELECT' });
  const ledA = place('led', 600, 140, { label: 'A' });
  const ledB = place('led', 600, 260, { label: 'B' });
  const ledGround = ground(700, 340);
  return {
    components: [supply, supplyGround, limit, select, ledA, ledB, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, limit, 0),
      connect(limit, 1, select, SPDT.COM),
      connect(select, SPDT.A, ledA, LED.A),
      connect(select, SPDT.B, ledB, LED.A),
      connect(ledA, LED.K, ledGround, 0),
      connect(ledB, LED.K, ledGround, 0),
    ],
    featured: select,
  };
}

const PLAY = 'Press play';

export const SUPPLY_AND_SOUND: PartExample[] = [
  {
    id: 'power-loop', part: 'power', name: 'The supply',
    description: 'The supply is the battery of the circuit. It holds its + end 9 volts above its − end, pushes current out at + and takes it back at −, '
      + 'which is wired to ground. '
      + `${PLAY}: current runs round the loop and the LED is lit. Then turn STARVE, the small knob beside the supply. `
      + 'It puts resistance in the way, like a battery going flat, and the LED dims until it is almost out.',
    build: supplied,
  },
  {
    id: 'audio-input-tone', part: 'audio-input', name: 'A signal from outside',
    description: 'Audio In stands for whatever you might plug in: a guitar, a microphone, a player. Here it plays a steady tone, '
      + 'too weak to move a speaker, and the amplifier makes it strong enough. '
      + `${PLAY}, then turn LEVEL, the small knob beside it, to turn the tone down. `
      + 'The inspector at the top right changes its Signal (a square wave, a plucked string, noise) and its Pitch.',
    build: () => amplified('input'),
  },
  {
    id: 'piezo-knock', part: 'piezo', name: 'Knock on it',
    description: 'A piezo disc is a contact microphone: knock on it and it makes a small voltage that rings for a moment and dies away. '
      + 'The LM386 is an amplifier that makes the knock big enough to hear. '
      + `${PLAY}, then press the disc. Each press is one knock: holding it down gives nothing more until you let go and press again.`,
    build: knocked,
  },
  {
    id: 'lm386-speaker-amp', part: 'lm386', name: 'Speaker amplifier',
    description: 'The LM386 is a small power amplifier. It makes the signal at its + input about 20 times bigger, and it can give the current a speaker takes. '
      + 'Its output rests at half the supply, so a big capacitor stands between it and the speaker: the tone gets through, the steady voltage does not. '
      + `${PLAY}, then turn LEVEL down: the amplifier is fed less, and the speaker is quieter.`,
    build: () => amplified('amplifier'),
  },
  {
    id: 'speaker-driven', part: 'speaker', name: 'Moving a speaker',
    description: 'A speaker turns current into sound, and it takes a lot of current: far more than Audio In gives by itself. '
      + 'So it needs an amplifier to move it, here the LM386. The big capacitor keeps the steady voltage of the amplifier off its coil. '
      + `${PLAY} to hear the tone, and turn LEVEL to push the speaker less.`,
    build: () => amplified('speaker'),
  },
  {
    id: 'junction-divide', part: 'junction', name: 'One wire into two',
    description: 'A junction is a dot where wires are joined: everything wired to it is one point. '
      + 'Here the wire from the switch divides at the dot, and each LED has a branch of its own. '
      + `${PLAY} and flip BOTH: the two LEDs light together, and each takes the same current. `
      + 'Delete the dot and its wires go with it: both stay dark.',
    build: divided,
  },
  {
    id: 'spdt-either', part: 'spdt', name: 'One or the other',
    description: 'A changeover switch has three legs. The common one, COM, is joined to A or to B and never to both. '
      + 'Here COM comes from the supply, and each of the other legs has an LED. '
      + `${PLAY}: LED A is lit. Click SELECT and the current goes the other way: A goes dark and B lights.`,
    build: chosen,
  },
];
