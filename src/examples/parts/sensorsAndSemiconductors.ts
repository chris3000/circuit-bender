/**
 * Examples for the parts that steer a current and the parts that sense: the
 * two transistors, the diodes, the opto-coupler, the JFET, the photocell and
 * the body contacts.
 */
import { capacitor, connect, ground, namedSwitch, place, pot, resistor } from '@/examples/circuits';
import { CD40106, DIODE, LED, POT, POWER, TRANSISTOR } from '@/classes/kit';
import type { ExampleBuild, PartExample } from './types';

/** The opto-coupler: its LED's two legs, then the two legs of its cell. */
const OPTO = { A: 0, K: 1, CELL1: 2, CELL2: 3 };
const JFET = { G: 0, D: 1, S: 2 };

// --- The transistors: a button's small current into the base switches an LED's large one ---

/**
 * A base with nothing on it is not off: the little an open button leaks is
 * multiplied like any other base current, and the LED glows. So each
 * transistor has 1 MΩ from its base to its emitter, to hold it off.
 */
const REST_OHMS = 1e6;

/** NPN: the LED hangs from + into the collector, and the button feeds the base from +. */
function npnSwitch(): ExampleBuild {
  const supply = place('power', 200, 180);
  const supplyGround = ground(200, 280);
  const press = place('pushbutton', 340, 280, { label: 'PRESS' });
  const base = resistor(100e3, 460, 280);
  const rest = resistor(REST_OHMS, 540, 360, 90);
  const restGround = ground(540, 440);
  const limit = resistor(470, 480, 80);
  const led = place('led', 620, 160, { rotation: 90 });
  const q = place('2n3904', 620, 280);
  const qGround = ground(620, 380);
  return {
    components: [supply, supplyGround, press, base, rest, restGround, limit, led, q, qGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, limit, 0),
      connect(limit, 1, led, LED.A),
      connect(led, LED.K, q, TRANSISTOR.C),
      connect(q, TRANSISTOR.E, qGround, 0),
      connect(supply, POWER.PLUS, press, 0),
      connect(press, 1, base, 0),
      connect(base, 1, q, TRANSISTOR.B),
      connect(rest, 0, q, TRANSISTOR.B),
      connect(rest, 1, restGround, 0),
    ],
    featured: q,
  };
}

/**
 * PNP: the same circuit the other way up. The emitter is on +, the LED runs
 * from the collector to ground, and the button takes the base down to ground.
 * The transistor is turned round to put its emitter on top, which leaves its
 * base, and so the button, on the right.
 */
function pnpSwitch(): ExampleBuild {
  const supply = place('power', 280, 180);
  const supplyGround = ground(280, 280);
  const q = place('2n3906', 500, 200, { rotation: 180 });
  const led = place('led', 500, 280, { rotation: 90 });
  const limit = resistor(470, 500, 360, 90);
  const ledGround = ground(500, 440);
  const rest = resistor(REST_OHMS, 580, 130, 90);
  const base = resistor(100e3, 680, 200);
  const press = place('pushbutton', 800, 200, { label: 'PRESS' });
  const pressGround = ground(880, 280);
  return {
    components: [supply, supplyGround, q, led, limit, ledGround, rest, base, press, pressGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, q, TRANSISTOR.E),
      connect(q, TRANSISTOR.C, led, LED.A),
      connect(led, LED.K, limit, 0),
      connect(limit, 1, ledGround, 0),
      connect(supply, POWER.PLUS, rest, 0),
      connect(rest, 1, q, TRANSISTOR.B),
      connect(q, TRANSISTOR.B, base, 0),
      connect(base, 1, press, 0),
      connect(press, 1, pressGround, 0),
    ],
    featured: q,
  };
}

// --- The diodes: two LEDs behind one switch, a diode forwards in front of one and backwards in front of the other ---

function oneWay(type: '1n914' | '1n4004'): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const on = namedSwitch('ON', 320, 200, false);
  const forwards = place(type, 460, 140);
  const forwardsLimit = resistor(1000, 580, 140);
  const forwardsLed = place('led', 700, 140);
  const backwards = place(type, 460, 280, { rotation: 180 });
  const backwardsLimit = resistor(1000, 580, 280);
  const backwardsLed = place('led', 700, 280);
  const ledGround = ground(800, 360);
  return {
    components: [supply, supplyGround, on, forwards, forwardsLimit, forwardsLed, backwards, backwardsLimit, backwardsLed, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, on, 0),
      connect(on, 1, forwards, DIODE.A),
      connect(forwards, DIODE.K, forwardsLimit, 0),
      connect(forwardsLimit, 1, forwardsLed, LED.A),
      connect(forwardsLed, LED.K, ledGround, 0),
      // The same branch again, but for the diode: the switch meets its K
      connect(on, 1, backwards, DIODE.K),
      connect(backwards, DIODE.A, backwardsLimit, 0),
      connect(backwardsLimit, 1, backwardsLed, LED.A),
      connect(backwardsLed, LED.K, ledGround, 0),
    ],
    featured: forwards,
  };
}

// --- The opto-coupler: a button lights its LED, and its cell lets a second LED light ---

function lightLink(): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const press = place('pushbutton', 320, 220, { label: 'PRESS' });
  const limit = resistor(1000, 440, 220);
  const opto = place('optocoupler', 580, 230);
  const optoGround = ground(520, 340);
  const led = place('led', 720, 320, { rotation: 90 });
  const ledGround = ground(720, 420);
  return {
    components: [supply, supplyGround, press, limit, opto, optoGround, led, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      // One side: the LED inside
      connect(supply, POWER.PLUS, press, 0),
      connect(press, 1, limit, 0),
      connect(limit, 1, opto, OPTO.A),
      connect(opto, OPTO.K, optoGround, 0),
      // The other side: the cell, in line with an LED of its own
      connect(supply, POWER.PLUS, opto, OPTO.CELL1),
      connect(opto, OPTO.CELL2, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
    featured: opto,
  };
}

// --- The JFET: an LED in its drain, and a knob that takes its gate below its source ---

/** The small supply below ground that the gate's knob reaches down into. */
export const GATE_SUPPLY_VOLTS = 1.5;

function pinch(): ExampleBuild {
  const supply = place('power', 200, 160);
  const middle = ground(280, 280);
  const below = place('power', 200, 360, { parameters: { voltage: GATE_SUPPLY_VOLTS, value: `+${GATE_SUPPLY_VOLTS}V` } });
  // Turned up, the wiper is at the end on ground
  const gate = pot('GATE', 100e3, 1, 420, 340);
  const gateGround = ground(500, 420);
  const led = place('led', 620, 200, { rotation: 90 });
  const q = place('2n5457', 620, 300);
  const qGround = ground(620, 400);
  return {
    components: [supply, middle, below, gate, gateGround, led, q, qGround],
    connections: [
      // Two supplies in a row, ground between them
      connect(supply, POWER.MINUS, middle, 0),
      connect(below, POWER.PLUS, middle, 0),
      connect(supply, POWER.PLUS, led, LED.A),
      connect(led, LED.K, q, JFET.D),
      connect(q, JFET.S, qGround, 0),
      connect(below, POWER.MINUS, gate, POT.END1),
      connect(gate, POT.END3, gateGround, 0),
      connect(gate, POT.WIPER, q, JFET.G),
    ],
    featured: q,
  };
}

// --- The photocell: all there is between the supply and an LED ---

function lightForLight(): ExampleBuild {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const cell = place('ldr', 380, 200, { label: 'LIGHT' });
  const led = place('led', 540, 300, { rotation: 90 });
  const ledGround = ground(540, 400);
  return {
    components: [supply, supplyGround, cell, led, ledGround],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, cell, 0),
      connect(cell, 1, led, LED.A),
      connect(led, LED.K, ledGround, 0),
    ],
    featured: cell,
  };
}

// --- The body contacts: a finger where an oscillator has its resistor ---

function fingerNote(): ExampleBuild {
  const chip = place('cd40106', 500, 260);
  const supply = place('power', 380, 100);
  const supplyGround = ground(380, 200);
  const chipGround = ground(580, 140);
  const pads = place('body-contact', 500, 400, { label: 'TOUCH' });
  const tank = capacitor(10e-9, 320, 300, 90);
  const tankGround = ground(320, 400);
  const out = place('audio-output', 680, 290);
  return {
    components: [supply, supplyGround, chipGround, chip, pads, tank, tankGround, out],
    connections: [
      connect(supply, POWER.MINUS, supplyGround, 0),
      connect(supply, POWER.PLUS, chip, CD40106.VDD),
      connect(chip, CD40106.VSS, chipGround, 0),
      connect(pads, 0, chip, CD40106.A[0]),
      connect(pads, 1, chip, CD40106.Y[0]),
      connect(tank, 0, chip, CD40106.A[0]),
      connect(tank, 1, tankGround, 0),
      connect(chip, CD40106.Y[0], out, 0),
    ],
    featured: pads,
  };
}

const PLAY = 'Press play';

export const SENSORS_AND_SEMICONDUCTORS: PartExample[] = [
  {
    id: '2n3904-switch', part: '2n3904', name: 'Small controls big',
    description: 'A transistor lets a small current control a big one. The button sends a trickle through 100 kΩ into the base, B. '
      + 'That opens the way from collector to emitter, C to E, and the LED gets its current through there: over a hundred times as much. '
      + `${PLAY} and hold PRESS: the LED lights. Let go and it is dark again.`,
    build: npnSwitch,
  },
  {
    id: '2n3906-switch', part: '2n3906', name: 'The other way up',
    description: 'The 2N3906 is the 2N3904 the other way up. Its emitter, E, is on + and the LED is below it, between the collector and ground. '
      + 'It turns on when a small current is drawn out of its base, B, and the button draws one down to ground through 100 kΩ. '
      + `${PLAY} and hold PRESS: the LED lights, on over a hundred times the current the button carries.`,
    build: pnpSwitch,
  },
  {
    id: '1n914-one-way', part: '1n914', name: 'One way only',
    description: 'A diode lets current through one way only: in at A and out at K, the way its arrow points. '
      + 'Two LEDs share a switch. The upper one has its diode forwards and the lower one has it backwards. '
      + `${PLAY} and flip ON: only the upper LED lights. The 1N914 is the small, fast diode, the one for signals. It stands 0.2 A.`,
    build: () => oneWay('1n914'),
  },
  {
    id: '1n4004-one-way', part: '1n4004', name: 'One way only',
    description: 'A diode lets current through one way only: in at A and out at K. The 1N4004 is the power diode: it stands 1 A. '
      + 'In line with a battery, it is the usual guard against one put in backwards. '
      + 'Here two LEDs share a switch. The upper one has its diode forwards and the lower one has it backwards. '
      + `${PLAY} and flip ON: only the upper LED lights.`,
    build: () => oneWay('1n4004'),
  },
  {
    id: 'optocoupler-light-link', part: 'optocoupler', name: 'Joined by light',
    description: 'Inside are an LED and a photocell, facing each other in the dark. The button lights the LED inside. '
      + 'Its light lowers the resistance of the cell, and the LED outside gets current through the cell. '
      + 'The two sides share the supply and nothing else: what passes between them is light. '
      + `${PLAY} and hold PRESS: the LED outside comes on. Let go: it fades instead of going out at once, because a photocell is slow to forget light.`,
    build: lightLink,
  },
  {
    id: '2n5457-pinch', part: '2n5457', name: 'Pinched off',
    description: 'A JFET is a path from drain to source, D to S, that a voltage on its gate, G, pinches shut. '
      + 'With the gate level with the source the path is open. With the gate 1.4 V below the source it is shut. '
      + `The small second supply reaches ${GATE_SUPPLY_VOLTS} V below ground, and GATE picks a voltage between the two. `
      + `${PLAY} and turn GATE down: the LED dims and goes out. The gate itself takes no current.`,
    build: pinch,
  },
  {
    id: 'ldr-light', part: 'ldr', name: 'Light for light',
    description: 'A photocell is a resistor that light sets: 1 MΩ in the dark, 1 kΩ in bright light. Its small dial stands for the light falling on it. '
      + 'Here it is all there is between the supply and the LED. '
      + `${PLAY} and turn the dial up: more light on the cell, less resistance, and more light from the LED.`,
    build: lightForLight,
  },
  {
    id: 'body-contact-note', part: 'body-contact', name: 'Played by a finger',
    description: 'Two contacts for a finger to bridge. Skin is a resistor, and the harder you press, the less it resists. '
      + 'Here the finger is the resistor of an oscillator. Untouched, nothing joins the gate\'s output to its input, and there is no note. '
      + `${PLAY} and hold the contacts: a note. On the cover TOUCH is a pad: higher up is a firmer press, and a higher note.`,
    build: fingerNote,
  },
];
