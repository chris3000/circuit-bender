/**
 * Examples for the chips: the timer, the logic chips (the NAND gates, the
 * two counters, the plain inverters and the flip-flop) and the amplifiers
 * (the op-amps and the OTA).
 */
import type { Component, Connection } from '@/types/circuit';
import { capacitor, connect, ground, namedSwitch, place, pot, resistor } from '@/examples/circuits';
import { CD40106, CD4013, CD4017, CD4040, CD4093, LED, LM741, NE555, POT, POWER } from '@/classes/kit';
import type { ExampleBuild, PartExample } from './types';

/** The pins of the chips the kit has no table for. */
const CD4049 = { A: [0, 1, 2, 3, 4, 5], Y: [6, 7, 8, 9, 10, 11], VDD: 12, VSS: 13 };
const TL072 = { IN_MINUS: 0, IN_PLUS: 1, OUT: 2, V_PLUS: 6, V_MINUS: 7 };
const LM324 = { IN_MINUS: 0, IN_PLUS: 1, OUT: 2, V_PLUS: 12, V_MINUS: 13 };
const LM13700 = { IN_PLUS: 0, IN_MINUS: 1, IABC: 3, OUT: 4, V_PLUS: 14, V_MINUS: 15 };

interface Parts {
  components: Component[];
  connections: Connection[];
}

/** A list of parts and wires, added to as a circuit is laid out. */
function sheet(): Parts & { add: <T extends Component>(part: T) => T; wire: (a: Component, pa: number, b: Component, pb: number) => void } {
  const components: Component[] = [];
  const connections: Connection[] = [];
  return {
    components, connections,
    add: (part) => { components.push(part); return part; },
    wire: (a, pa, b, pb) => { connections.push(connect(a, pa, b, pb)); },
  };
}

// --- A slow clock: one gate of a CD40106, as in the oscillator of the basics ---

/** About two ticks a second: slow enough to watch a counter count. */
export const CLOCK_FARADS = 4.7e-6;

function slowClock(s: ReturnType<typeof sheet>, supply: Component, x: number, y: number) {
  const chip = s.add(place('cd40106', x, y));
  const timing = s.add(resistor(100e3, x, y + 140));
  const tank = s.add(capacitor(CLOCK_FARADS, x - 160, y + 40, 90));
  s.wire(supply, POWER.PLUS, chip, CD40106.VDD);
  s.wire(chip, CD40106.VSS, s.add(ground(x + 80, y - 120)), 0);
  s.wire(timing, 0, chip, CD40106.A[0]);
  s.wire(timing, 1, chip, CD40106.Y[0]);
  s.wire(tank, 0, chip, CD40106.A[0]);
  s.wire(tank, 1, s.add(ground(x - 160, y + 140)), 0);
  return chip;
}

/** The supply, at the top left, with its ground. */
function supplyAt(s: ReturnType<typeof sheet>, x: number, y: number) {
  const supply = s.add(place('power', x, y));
  s.wire(supply, POWER.MINUS, s.add(ground(x, y + 100)), 0);
  return supply;
}

/** An LED to ground through 1 kΩ, standing in a column below `(x, y)`. */
function lamp(s: ReturnType<typeof sheet>, from: Component, pin: number, x: number, y: number) {
  const limit = s.add(resistor(1000, x, y, 90));
  const led = s.add(place('led', x, y + 100, { rotation: 90 }));
  s.wire(from, pin, limit, 0);
  s.wire(limit, 1, led, LED.A);
  s.wire(led, LED.K, s.add(ground(x, y + 180)), 0);
  return led;
}

/** A button from + to a logic input, and 10 kΩ holding the input down while the button is up. */
function buttonInput(s: ReturnType<typeof sheet>, supply: Component, chip: Component, pin: number, name: string, x: number, y: number) {
  const button = s.add(place('pushbutton', x, y, { label: name }));
  const down = s.add(resistor(10e3, x + 80, y + 100, 90));
  s.wire(supply, POWER.PLUS, button, 0);
  s.wire(button, 1, chip, pin);
  s.wire(down, 0, chip, pin);
  s.wire(down, 1, s.add(ground(x + 80, y + 180)), 0);
  return button;
}

// --- The 555: the classic blinker ---

function blinker(): ExampleBuild {
  const s = sheet();
  const supply = supplyAt(s, 160, 300);
  const on = s.add(namedSwitch('ON', 260, 140, true));
  const timer = s.add(place('ne555', 500, 300));
  const ra = s.add(resistor(10e3, 360, 200, 90));
  const rb = s.add(resistor(100e3, 360, 300, 90));
  const tank = s.add(capacitor(4.7e-6, 360, 420, 90));
  s.wire(supply, POWER.PLUS, on, 0);
  s.wire(on, 1, ra, 0);
  s.wire(on, 1, timer, NE555.VCC);
  s.wire(timer, NE555.GND, s.add(ground(580, 200)), 0);
  s.wire(ra, 1, timer, NE555.DISCH);
  s.wire(rb, 0, timer, NE555.DISCH);
  s.wire(rb, 1, timer, NE555.THRES);
  s.wire(timer, NE555.THRES, timer, NE555.TRIG);
  s.wire(tank, 0, timer, NE555.TRIG);
  s.wire(tank, 1, s.add(ground(360, 500)), 0);
  lamp(s, timer, NE555.OUT, 640, 300);
  return { ...s, featured: timer };
}

// --- The CD4093: an oscillator that only runs while its other input is high ---

function gatedBeep(): ExampleBuild {
  const s = sheet();
  const supply = supplyAt(s, 160, 300);
  const chip = s.add(place('cd4093', 600, 320));
  s.wire(supply, POWER.PLUS, chip, CD4093.VDD);
  s.wire(chip, CD4093.VSS, s.add(ground(680, 180)), 0);
  buttonInput(s, supply, chip, CD4093.A[0], 'PRESS', 300, 200);
  // The oscillator: 1Y back to 1B through 100 kΩ, and 1B to ground through 10 nF
  const timing = s.add(resistor(100e3, 600, 480));
  const tank = s.add(capacitor(10e-9, 480, 400, 90));
  s.wire(timing, 0, chip, CD4093.B[0]);
  s.wire(timing, 1, chip, CD4093.Y[0]);
  s.wire(tank, 0, chip, CD4093.B[0]);
  s.wire(tank, 1, s.add(ground(480, 500)), 0);
  s.wire(chip, CD4093.Y[0], s.add(place('audio-output', 760, 300)), 0);
  return { ...s, featured: chip };
}

// --- The CD4040: counting the clock in binary on three lights ---

function binary(): ExampleBuild {
  const s = sheet();
  const supply = supplyAt(s, 160, 120);
  const clock = slowClock(s, supply, 420, 300);
  const count = s.add(place('cd4040', 720, 340));
  s.wire(supply, POWER.PLUS, count, CD4040.VDD);
  s.wire(count, CD4040.VSS, s.add(ground(800, 160)), 0);
  s.wire(clock, CD40106.Y[0], count, CD4040.CLK);
  buttonInput(s, supply, count, CD4040.RST, 'ZERO', 560, 270);
  [0, 1, 2].forEach((q) => lamp(s, count, CD4040.Q[q], 860 + q * 80, 360));
  return { ...s, featured: count };
}

// --- The CD4017: four lights that chase round ---

function chase(): ExampleBuild {
  const s = sheet();
  const supply = supplyAt(s, 160, 120);
  const clock = slowClock(s, supply, 420, 300);
  const count = s.add(place('cd4017', 720, 340));
  s.wire(supply, POWER.PLUS, count, CD4017.VDD);
  s.wire(count, CD4017.VSS, s.add(ground(800, 160)), 0);
  s.wire(clock, CD40106.Y[0], count, CD4017.CLK);
  // INH high holds the count where it is; down, it counts
  buttonInput(s, supply, count, CD4017.INH, 'HOLD', 560, 280);
  // The fifth step starts it again at the first
  s.wire(count, CD4017.Q[4], count, CD4017.RST);
  // Only one light is ever on, so the four can share one resistor
  const share = s.add(resistor(1000, 970, 560, 90));
  s.wire(share, 1, s.add(ground(970, 640)), 0);
  [0, 1, 2, 3].forEach((q) => {
    const led = s.add(place('led', 860 + q * 60, 440, { rotation: 90 }));
    s.wire(count, CD4017.Q[q], led, LED.A);
    s.wire(led, LED.K, share, 0);
  });
  return { ...s, featured: count };
}

// --- The CD4049: an inverter biased as an amplifier ---

/** What Audio In gives at the bottom of LEVEL... */
export const PREAMP_VOLTS = 1;
/** ...and where LEVEL starts: a tenth of a volt, which comes out clean. */
export const PREAMP_LEVEL = 0.1;

function preamp(): ExampleBuild {
  const s = sheet();
  const supply = supplyAt(s, 160, 120);
  const input = s.add(place('audio-input', 220, 420, { label: 'LEVEL', parameters: { volts: PREAMP_VOLTS, level: PREAMP_LEVEL } }));
  const chip = s.add(place('cd4049', 580, 340));
  const coupling = s.add(capacitor(100e-9, 340, 290));
  const into = s.add(resistor(10e3, 460, 290));
  const feedback = s.add(resistor(100e3, 580, 160));
  const out = s.add(capacitor(10e-6, 700, 290));
  s.wire(supply, POWER.PLUS, chip, CD4049.VDD);
  s.wire(chip, CD4049.VSS, s.add(ground(660, 200)), 0);
  s.wire(input, 0, coupling, 0);
  s.wire(coupling, 1, into, 0);
  s.wire(into, 1, chip, CD4049.A[0]);
  s.wire(feedback, 0, chip, CD4049.A[0]);
  s.wire(feedback, 1, chip, CD4049.Y[0]);
  s.wire(chip, CD4049.Y[0], out, 0);
  s.wire(out, 1, s.add(place('audio-output', 800, 360)), 0);
  return { ...s, featured: chip };
}

// --- The CD4013: one press on, the next press off ---

function toggle(): ExampleBuild {
  const s = sheet();
  const supply = supplyAt(s, 160, 300);
  const chip = s.add(place('cd4013', 600, 320));
  s.wire(supply, POWER.PLUS, chip, CD4013.VDD);
  s.wire(chip, CD4013.VSS, s.add(ground(680, 180)), 0);
  buttonInput(s, supply, chip, CD4013.CLK[0], 'PRESS', 300, 200);
  // Its opposite back to its data: each rising clock takes the other state
  s.wire(chip, CD4013.NOT_Q[0], chip, CD4013.D[0]);
  lamp(s, chip, CD4013.Q[0], 760, 300);
  return { ...s, featured: chip };
}

// --- The op-amps: an amplifier of eleven on two batteries ---

/** Audio In's level at its peak: a tenth of a volt, eleven times that is about a volt. */
export const OP_AMP_VOLTS = 0.1;

/** + and − around ground: two supplies in a row, the + of the lower one on ground. */
function twoRails(s: ReturnType<typeof sheet>, x: number, y: number) {
  const upper = s.add(place('power', x, y));
  const lower = s.add(place('power', x, y + 160));
  const middle = s.add(ground(x + 80, y + 120));
  s.wire(upper, POWER.MINUS, middle, 0);
  s.wire(lower, POWER.PLUS, middle, 0);
  return { upper, lower };
}

function amplifier(type: 'lm741' | 'tl072'): ExampleBuild {
  const s = sheet();
  const { upper, lower } = twoRails(s, 160, 120);
  const input = s.add(place('audio-input', 340, 460, { label: 'LEVEL', parameters: { volts: OP_AMP_VOLTS } }));
  const amp = s.add(place(type, 560, 320));
  const pins = type === 'lm741' ? LM741 : TL072;
  const feedback = s.add(resistor(100e3, 560, 180));
  const share = s.add(resistor(10e3, 420, 260, 90));
  s.wire(upper, POWER.PLUS, amp, pins.V_PLUS);
  s.wire(lower, POWER.MINUS, amp, pins.V_MINUS);
  s.wire(input, 0, amp, pins.IN_PLUS);
  s.wire(feedback, 1, amp, pins.OUT);
  s.wire(feedback, 0, amp, pins.IN_MINUS);
  s.wire(share, 0, amp, pins.IN_MINUS);
  s.wire(share, 1, s.add(ground(420, 360)), 0);
  s.wire(amp, pins.OUT, s.add(place('audio-output', 720, 380)), 0);
  return { ...s, featured: amp };
}

// --- The LM324: one of its four as a comparator ---

function comparator(): ExampleBuild {
  const s = sheet();
  const supply = supplyAt(s, 160, 160);
  const chip = s.add(place('lm324', 560, 320));
  const knob = s.add(pot('KNOB', 100e3, 0.25, 360, 420));
  const top = s.add(resistor(10e3, 420, 160, 90));
  const bottom = s.add(resistor(10e3, 420, 260, 90));
  s.wire(supply, POWER.PLUS, chip, LM324.V_PLUS);
  s.wire(chip, LM324.V_MINUS, s.add(ground(640, 180)), 0);
  // Half the supply on the − input
  s.wire(supply, POWER.PLUS, top, 0);
  s.wire(top, 1, bottom, 0);
  s.wire(bottom, 1, s.add(ground(320, 300)), 0);
  s.wire(top, 1, chip, LM324.IN_MINUS);
  // The knob across the supply, its wiper on the + input: turned up, the wiper is at the + end
  s.wire(knob, POT.END1, s.add(ground(300, 500)), 0);
  s.wire(knob, POT.END3, supply, POWER.PLUS);
  s.wire(knob, POT.WIPER, chip, LM324.IN_PLUS);
  lamp(s, chip, LM324.OUT, 700, 300);
  return { ...s, featured: chip };
}

// --- The LM13700: a VCA, an amplifier whose gain a knob's current sets ---

function vca(): ExampleBuild {
  const s = sheet();
  const { upper, lower } = twoRails(s, 160, 120);
  const ota = s.add(place('lm13700', 620, 340));
  s.wire(upper, POWER.PLUS, ota, LM13700.V_PLUS);
  s.wire(lower, POWER.MINUS, ota, LM13700.V_MINUS);
  // The tone, divided down to the hundredth of a volt the inputs want
  const input = s.add(place('audio-input', 300, 480));
  const down = s.add(resistor(100e3, 420, 420));
  const inGround = s.add(resistor(1000, 520, 480, 90));
  const minusGround = s.add(resistor(1000, 460, 280, 90));
  s.wire(input, 0, down, 0);
  s.wire(down, 1, ota, LM13700.IN_PLUS);
  s.wire(inGround, 0, ota, LM13700.IN_PLUS);
  s.wire(inGround, 1, s.add(ground(520, 560)), 0);
  s.wire(minusGround, 0, ota, LM13700.IN_MINUS);
  s.wire(minusGround, 1, s.add(ground(460, 360)), 0);
  // LOUDNESS: a voltage between the two rails, and from it a current into the bias pin
  const loudness = s.add(pot('LOUDNESS', 100e3, 1, 400, 160));
  const bias = s.add(resistor(100e3, 520, 160));
  s.wire(loudness, POT.END3, upper, POWER.PLUS);
  s.wire(loudness, POT.END1, lower, POWER.MINUS);
  s.wire(loudness, POT.WIPER, bias, 0);
  s.wire(bias, 1, ota, LM13700.IABC);
  // The output is a current: 47 kΩ to ground turns it into a voltage
  const load = s.add(resistor(47e3, 760, 380, 90));
  s.wire(ota, LM13700.OUT, load, 0);
  s.wire(load, 1, s.add(ground(760, 460)), 0);
  s.wire(ota, LM13700.OUT, s.add(place('audio-output', 860, 340)), 0);
  return { ...s, featured: ota };
}

const PLAY = 'Press play';

export const CHIPS: PartExample[] = [
  {
    id: 'ne555-blinker', part: 'ne555', name: 'Blinker',
    description: 'The 555 fills its capacitor through both resistors and empties it through the lower one, over and over. '
      + 'Its output, OUT, is high while the capacitor fills and low while it empties. '
      + `${PLAY}: the LED blinks. ON switches it all off. A smaller capacitor blinks faster, and a small enough one makes a note.`,
    build: blinker,
  },
  {
    id: 'cd4093-gated', part: 'cd4093', name: 'Beep while held',
    description: 'A NAND gate puts out low only while both its inputs are high. Wired as an oscillator on one input, it runs only while the other is high: '
      + 'the other input is a gate in the way of the note. '
      + `${PLAY} and hold PRESS: a note. Let go and the 10 kΩ pulls the input down, and the note stops.`,
    build: gatedBeep,
  },
  {
    id: 'cd4040-binary', part: 'cd4040', name: 'Counting in binary',
    description: 'The counter adds one each time its clock falls, and shows the count in binary on its outputs. '
      + 'Q1 changes on every tick, Q2 on every second, Q3 on every fourth: each light blinks at half the speed of the one before. '
      + `${PLAY} and watch it count. Hold ZERO to put the count back to nothing.`,
    build: binary,
  },
  {
    id: 'cd4017-chase', part: 'cd4017', name: 'Four lights chase',
    description: 'Each tick of the clock moves the counter on one step, and each step has an output of its own, Q0 to Q9. Only one is high at a time. '
      + 'Here Q4 is wired to RST, so the fifth step is the first again: four lights chase round. '
      + `${PLAY}. Hold HOLD and they stop where they are.`,
    build: chase,
  },
  {
    id: 'cd4049-preamp', part: 'cd4049', name: 'Inverter as amplifier',
    description: 'A plain inverter with 100 kΩ from its output back to its input settles half way, and then it is an amplifier. '
      + 'What comes in through 10 kΩ goes out bigger and upside down. '
      + `${PLAY}: Audio In plays a small tone, and it comes out several times bigger. Turn LEVEL up and the tops are rounded off: a soft distortion.`,
    build: preamp,
  },
  {
    id: 'cd4013-toggle', part: 'cd4013', name: 'Press on, press off',
    description: 'A flip-flop remembers what is on its D input at the moment its clock rises. Here its opposite output, /Q, is wired back to D, '
      + 'so each rise of the clock turns it over. '
      + `${PLAY} and press PRESS: the LED comes on. Press again: it goes off. It stays as you left it in between.`,
    build: toggle,
  },
  {
    id: 'lm741-amplifier', part: 'lm741', name: 'An amplifier of eleven',
    description: 'The op-amp drives its output until its − input stands level with its + input. 100 kΩ and 10 kΩ give − a share of the output, '
      + 'so the output has to be eleven times what is on +. Two supplies in a row give a rail above ground and a rail below. '
      + `${PLAY}: a small tone goes in and eleven times as much comes out. The 741 is the classic single op-amp.`,
    build: () => amplifier('lm741'),
  },
  {
    id: 'tl072-amplifier', part: 'tl072', name: 'An amplifier of eleven',
    description: 'The TL072 is two op-amps in one chip, fast and quiet: the usual choice for audio. Each drives its output until its − input stands level with its + input. '
      + '100 kΩ and 10 kΩ give − a share of the output, so the output is eleven times what is on +. '
      + `${PLAY}: a small tone goes in and eleven times as much comes out. Turn LEVEL to change how much goes in.`,
    build: () => amplifier('tl072'),
  },
  {
    id: 'lm324-comparator', part: 'lm324', name: 'Which is higher',
    description: 'An op-amp with no feedback is a comparator: its output goes high when its + input is above its − input, and low when it is below. '
      + 'Two 10 kΩ put − at half the supply, and KNOB sets +. The LM324 has four op-amps that run from one supply. '
      + `${PLAY} and turn KNOB past half way: the LED lights. Turn it back and the LED goes out.`,
    build: comparator,
  },
  {
    id: 'lm13700-vca', part: 'lm13700', name: 'A knob for loudness',
    description: 'Each half of the LM13700 is an amplifier whose gain is set by a current into its bias pin, IABC. No current, no sound. '
      + 'LOUDNESS sets a voltage between the two rails, and 100 kΩ turns it into that current. '
      + `${PLAY} and turn LOUDNESS down: the tone gets quieter, and at the bottom it is gone. A voltage from anywhere could set it instead of a knob.`,
    build: vca,
  },
];
