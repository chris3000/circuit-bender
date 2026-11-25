/**
 * Examples for the parts every circuit starts with: the light and its
 * switch, the resistor, the capacitor, the pot, and the oscillator they are
 * all heard through.
 */
import type { Component, Connection } from '@/types/circuit';
import { capacitor, connect, ground, namedSwitch, place, pot, resistor } from '@/examples/circuits';
import { CD40106, LED, POT, POWER } from '@/classes/kit';
import { formatValue } from '@/utils/parameterParser';
import type { ExampleBuild, PartExample } from './types';

const ohmsText = (ohms: number) => formatValue(ohms, 'resistance');
const faradsText = (farads: number) => formatValue(farads, 'capacitance');

// --- The light: a supply, something to close the loop with, a resistor and an LED ---

function light(control: 'switch' | 'pushbutton', feature: 'led' | 'control' | 'ground'): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const hand = control === 'switch' ? namedSwitch('LIGHT', 320, 200, false) : place('pushbutton', 320, 200, { label: 'LIGHT' });
  const limit = resistor(470, 440, 200);
  const led = place('led', 540, 300, { rotation: 90 });
  const ledGround = ground(540, 400);
  return {
    components: [supply, supplyGround, hand, limit, led, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, hand, 0),
      connect(hand, 1, limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
    featured: feature === 'led' ? led : feature === 'control' ? hand : ledGround,
  };
}

// --- The oscillator: one gate of a CD40106, a resistor back to its input and a capacitor to ground ---

interface Oscillator {
  chip: Component;
  timing: Component;
  tank: Component;
  components: Component[];
  connections: Connection[];
}

function oscillator(ohms: number, farads: number): Oscillator {
  const chip = place('cd40106', 500, 260);
  const supply = place('power', 380, 100);
  const supplyGround = ground(380, 200);
  const chipGround = ground(580, 140);
  const timing = resistor(ohms, 500, 400);
  const tank = capacitor(farads, 320, 300, 90);
  const tankGround = ground(320, 400);
  return {
    chip, timing, tank,
    components: [supply, supplyGround, chipGround, chip, timing, tank, tankGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, chip, CD40106.VDD),
      connect(chip, CD40106.VSS, chipGround, 0),
      connect(timing, 0, chip, CD40106.A[0]),
      connect(timing, 1, chip, CD40106.Y[0]),
      connect(tank, 0, chip, CD40106.A[0]),
      connect(tank, 1, tankGround, 0),
    ],
  };
}

/** The oscillator heard: its output through a switch named SOUND to an Audio Out. */
function tone(ohms: number, farads: number, feature: 'chip' | 'output' | 'capacitor'): ExampleBuild {
  const osc = oscillator(ohms, farads);
  const sound = namedSwitch('SOUND', 640, 210, true);
  const out = place('audio-output', 740, 270);
  return {
    components: [...osc.components, sound, out],
    connections: [...osc.connections, connect(osc.chip, CD40106.Y[0], sound, 0), connect(sound, 1, out, 0)],
    featured: feature === 'chip' ? osc.chip : feature === 'output' ? out : osc.tank,
  };
}

/** Under this a capacitor needs 1 MΩ, not 100 kΩ, to give a note that can be heard. */
const SMALL_TIMING = 4e-9;
const timingFor = (farads: number) => (farads < SMALL_TIMING ? 1e6 : 100e3);

// --- The resistor ---

/** Under this the dimmer's LED gets more than a real one stands; over the other it barely glows. */
export const DIMMER_HOT = 220;
export const DIMMER_FAINT = 68e3;

function dimmer(ohms = 1000): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const on = namedSwitch('ON', 320, 200, false);
  const shown = resistor(ohms, 480, 140);
  const shownLed = place('led', 600, 140, { label: ohmsText(ohms) });
  const usual = resistor(1000, 480, 280);
  const usualLed = place('led', 600, 280, { label: ohmsText(1000) });
  const ledGround = ground(700, 360);
  return {
    components: [supply, supplyGround, on, shown, shownLed, usual, usualLed, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, on, 0),
      connect(on, 1, shown, 0),
      connect(on, 1, usual, 0),
      connect(shown, 1, shownLed, LED.A),
      connect(usual, 1, usualLed, LED.A),
      connect(shownLed, LED.K, ledGround, 0),
      connect(usualLed, LED.K, ledGround, 0),
    ],
    featured: shown,
  };
}

function pullDown(): ExampleBuild {
  const supply = place('power', 200, 200);
  const supplyGround = ground(200, 300);
  const button = place('pushbutton', 320, 110, { label: 'PRESS' });
  const pull = resistor(10e3, 400, 300, 90);
  const pullGround = ground(400, 400);
  const chip = place('cd40106', 560, 260);
  const chipGround = ground(640, 140);
  const limit = resistor(1000, 700, 320);
  const led = place('led', 800, 320);
  const ledGround = ground(880, 400);
  return {
    components: [supply, supplyGround, button, pull, pullGround, chip, chipGround, limit, led, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, button, 0),
      connect(supply, POWER.PLUS, chip, CD40106.VDD),
      connect(chip, CD40106.VSS, chipGround, 0),
      connect(button, 1, chip, CD40106.A[0]),
      connect(pull, 0, chip, CD40106.A[0]),
      connect(pull, 1, pullGround, 0),
      // Twice upside down is the right way up: pressed is lit
      connect(chip, CD40106.Y[0], chip, CD40106.A[1]),
      connect(chip, CD40106.Y[1], limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
    featured: pull,
  };
}

// --- The capacitor, by size ---

/** So small that only the edges of a wave get through it. */
function thin(farads = 100e-12): ExampleBuild {
  const osc = oscillator(100e3, 47e-9);
  const shown = capacitor(farads, 660, 210);
  const full = namedSwitch('FULL', 660, 120, false);
  const out = place('audio-output', 780, 290);
  return {
    components: [...osc.components, shown, full, out],
    connections: [
      ...osc.connections,
      connect(osc.chip, CD40106.Y[0], shown, 0),
      connect(shown, 1, out, 0),
      connect(osc.chip, CD40106.Y[0], full, 0),
      connect(full, 1, out, 0),
    ],
    featured: shown,
  };
}

/** Slow enough to watch: the oscillator's second gate lights an LED. */
function blink(farads = 10e-6): ExampleBuild {
  const osc = oscillator(100e3, farads);
  const limit = resistor(1000, 660, 230);
  const led = place('led', 780, 230);
  const ledGround = ground(860, 310);
  return {
    components: [...osc.components, limit, led, ledGround],
    connections: [
      ...osc.connections,
      // The LED hangs on a gate of its own, so what it takes does not upset the timing
      connect(osc.chip, CD40106.Y[0], osc.chip, CD40106.A[1]),
      connect(osc.chip, CD40106.Y[1], limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
    featured: osc.tank,
  };
}

/** A tank of charge: filled through a button, emptied through an LED. */
function tank(farads = 100e-6): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const fill = place('pushbutton', 320, 200, { label: 'FILL' });
  const rush = resistor(100, 440, 200);
  const shown = capacitor(farads, 540, 300, 90);
  const shownGround = ground(540, 400);
  const drain = resistor(10e3, 660, 200);
  const led = place('led', 760, 300, { rotation: 90 });
  const ledGround = ground(760, 400);
  return {
    components: [supply, supplyGround, fill, rush, shown, shownGround, drain, led, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, fill, 0),
      connect(fill, 1, rush, 0),
      connect(rush, 1, shown, 0),
      connect(shown, 1, shownGround, 0),
      connect(rush, 1, drain, 0),
      connect(drain, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
    featured: shown,
  };
}

// --- The pot ---

function volume(ohms = 100e3): ExampleBuild {
  const osc = oscillator(100e3, 22e-9);
  const knob = pot('VOLUME', ohms, 0.5, 680, 300);
  knob.rotation = 90;
  const knobGround = ground(680, 420);
  const out = place('audio-output', 800, 360);
  return {
    components: [...osc.components, knob, knobGround, out],
    connections: [
      ...osc.connections,
      // Turned up, the wiper is at the oscillator's end
      connect(osc.chip, CD40106.Y[0], knob, POT.END3),
      connect(knob, POT.END1, knobGround, 0),
      connect(knob, POT.WIPER, out, 0),
    ],
    featured: knob,
  };
}

const PLAY = 'Press play';

export const BASICS: PartExample[] = [
  {
    id: 'led-light', part: 'led', name: 'A light',
    description: 'An LED lights when current runs through it, in at A and out at K. The resistor in front of it keeps that current small enough. '
      + `${PLAY} and flip LIGHT: the loop closes and the LED comes on.`,
    build: () => light('switch', 'led'),
  },
  {
    id: 'switch-light', part: 'switch', name: 'On and off',
    description: 'A switch is a gap in the wire that you can close. While it is open nothing runs anywhere in the loop. '
      + `${PLAY} and click the switch: the LED follows it.`,
    build: () => light('switch', 'control'),
  },
  {
    id: 'pushbutton-light', part: 'pushbutton', name: 'Lit while held',
    description: 'A push button closes the loop only while it is held down. '
      + `${PLAY}, then press and hold the button: the LED is lit for as long as you hold.`,
    build: () => light('pushbutton', 'control'),
  },
  {
    id: 'ground-return', part: 'ground', name: 'The way back',
    description: 'Current leaves the supply at + and must find its way back to the other end. Every ground symbol is the same point, '
      + 'so the LED and the supply are joined there with no wire drawn between them. '
      + `${PLAY} and flip LIGHT. Then delete one ground: the loop is broken and the LED stays dark.`,
    build: () => light('switch', 'ground'),
  },
  {
    id: 'resistor-pull-down', part: 'resistor', only: 10e3, name: 'Pull-down',
    description: 'The input of a logic chip must always be told something. This 10 kΩ holds it down at ground while the button is up, '
      + 'and the button lifts it to + when pressed. 10 kΩ is the usual value for the job. '
      + `${PLAY} and hold PRESS: the LED lights. Then delete the resistor and try again: nothing brings the input back down, and the LED stays lit.`,
    build: pullDown,
  },
  {
    id: 'resistor-dimmer', part: 'resistor', name: 'Dimmer',
    description: (ohms) => 'A resistor holds current back: the more ohms, the less gets through. Two LEDs share a supply. '
      + `The lower one has the usual 1 kΩ in front of it, the upper one has ${ohms > 0 ? ohmsText(ohms) : 'this resistor'}. `
      + `${PLAY} and flip ON, then click a resistor to read its current.`
      + (ohms > 0 && ohms <= DIMMER_HOT ? ' This value lets through more than a real LED stands, and the app marks the LED with a "!".' : '')
      + (ohms >= DIMMER_FAINT ? ' Through this value so little gets by that the LED barely glows.' : ''),
    build: dimmer,
  },
  {
    id: 'capacitor-thin', part: 'capacitor', to: 180e-12, name: 'Only the edges',
    description: 'A capacitor lets changes through and stops whatever stays the same. One this small passes only the sharp edges of the wave: '
      + `a thin, quiet buzz. ${PLAY}, then flip FULL to hear the whole wave go round it. The smaller the capacitor, the thinner the sound.`,
    build: thin,
  },
  {
    id: 'capacitor-pitch', part: 'capacitor', to: 800e-9, name: 'Sets the pitch',
    description: (farads) => 'A capacitor takes time to fill through a resistor, and here that time is the pitch of an oscillator. '
      + `${farads > 0 ? faradsText(farads) : 'This one'} fills through ${ohmsText(timingFor(farads))}. `
      + `${PLAY}. Then double-click the capacitor and put in a bigger one: it fills more slowly, and the note is lower.`,
    build: (farads = 100e-9) => tone(timingFor(farads), farads, 'capacitor'),
  },
  {
    id: 'capacitor-blink', part: 'capacitor', to: 30e-6, name: 'Slow enough to see',
    description: 'A capacitor takes time to fill through a resistor. With one this big the oscillator is slow enough to watch: '
      + `the LED shows each time it fills and empties. ${PLAY}. A bigger capacitor blinks more slowly.`,
    build: blink,
  },
  {
    id: 'capacitor-tank', part: 'capacitor', name: 'A tank of charge',
    description: 'A big capacitor is a small tank of charge. '
      + `${PLAY} and hold FILL: the tank fills and the LED lights. Let go: the LED lives on what the tank holds, and fades as it empties. `
      + 'A bigger capacitor fades more slowly.',
    build: tank,
  },
  {
    id: 'potentiometer-volume', part: 'potentiometer', name: 'Volume knob',
    description: 'A pot is a resistor with a contact that slides along it: the wiper, its middle leg. Here the whole resistor lies between '
      + `the oscillator and ground, and the wiper picks off a share of the signal. ${PLAY} and turn VOLUME.`,
    build: volume,
  },
  {
    id: 'cd40106-oscillator', part: 'cd40106', name: 'Oscillator',
    description: 'Each of its six gates turns its input upside down, and changes its mind at one level on the way up and a lower one on the way down. '
      + 'A resistor from output to input and a capacitor to ground are then enough to keep it swinging: an oscillator. '
      + `${PLAY}. SOUND switches what you hear on and off.`,
    build: () => tone(100e3, 22e-9, 'chip'),
  },
  {
    id: 'audio-output-hear', part: 'audio-output', name: 'Hear it',
    description: 'Audio Out is the way to your ears: you hear whatever voltage it is wired to. It takes next to no current, so it does not disturb the circuit. '
      + `${PLAY} and flip SOUND: the oscillator's square wave plays.`,
    build: () => tone(100e3, 22e-9, 'output'),
  },
];
