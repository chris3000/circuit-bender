import { connect, ground, place, resistor } from '@/examples/circuits';
import { formatAmps, formatVolts } from '@/utils/readings';
import type { BenchRun } from '@/simulation/measure/bench';
import type { Built, ClassDefinition } from './types';
import { GROUND, type Work } from './Work';

// --- What this class asks of the learner's circuit ---

/** The run with every switch one way: what the circuit does when the loop is made, or broken. */
function withSwitches(work: Work, closed: 0 | 1): BenchRun {
  return work.run(work.parts('switch').map((part) => ({ componentId: part.id, parameter: 'closed', value: closed })));
}

/** The most current any LED carries, in amps. */
function ledAmps(work: Work, run: BenchRun): number {
  return Math.max(0, ...work.parts('led').map((led) => run.amps(led.id)));
}

/** Visibly lit: a tenth of a milliamp. */
const LIT = 1e-4;
/** Dark: under a microamp. */
const DARK = 1e-6;

/** A light with a switch that works, however it was wired. */
function loopWorks(work: Work): boolean {
  return work.parts('switch').length > 0
    && ledAmps(work, withSwitches(work, 1)) > LIT
    && ledAmps(work, withSwitches(work, 0)) < DARK;
}

const near = (value: unknown, target: number) => Math.abs(Number(value) - target) <= target * 0.01;

/** The nets that are not a place for two parts to meet each other: the supply's two ends. */
function rails(work: Work): string[] {
  return [GROUND, ...work.parts('power').map((supply) => work.net(supply, 0))];
}

/** The resistor (of about `ohms`) that the lit LED's current goes through. */
function inLineResistor(work: Work, ohms: number): boolean {
  const run = withSwitches(work, 1);
  const amps = ledAmps(work, run);
  return amps > DARK && work.parts('resistor').some((r) =>
    near(r.parameters.resistance, ohms) && Math.abs(Math.abs(run.amps(r.id)) - amps) <= amps * 0.01);
}

/** The light as the class builds it: a loop from the supply through a switch, 470 Ω and an LED. `name` is the switch's. */
function light(name?: string): Built {
  const supply = place('power', 200, 300);
  const supplyGround = ground(200, 400);
  const toggle = place('switch', 320, 200, name ? { label: name } : {});
  const limit = resistor(470, 440, 200);
  const led = place('led', 540, 300, { rotation: 90 });
  const ledGround = ground(540, 400);
  return {
    components: [supply, supplyGround, toggle, limit, led, ledGround],
    connections: [
      connect(supply, 1, supplyGround, 0),
      connect(supply, 0, toggle, 0),
      connect(toggle, 1, limit, 0),
      connect(limit, 1, led, 0),
      connect(led, 1, ledGround, 0),
    ],
  };
}

/** What the class keeps: the light, its switch named LIGHT. Class 3 starts from it. */
export const theLoopKept = (): Built => light('LIGHT');

/** Class 1: a light with a switch, and why it needs every part it has. */
export const theLoop: ClassDefinition = {
  id: 'the-loop',
  number: 1,
  unit: 'Light',
  title: 'The loop',
  promise: 'A light with a switch, and the reason it needs every part it has.',
  startsFrom: 'An empty canvas.',

  build: [
    {
      id: 'supply',
      text: 'Put a power supply on the canvas.',
      how: 'The parts are on the shelf at the left. Find Power near the top, or type "supply" into the search box, and drag it onto the canvas. It gives 9 volts, like a 9 V battery.',
      done: (work) => work.parts('power').length > 0,
    },
    {
      id: 'ground',
      text: 'Add a ground, below the supply.',
      how: 'Ground is beside Power on the shelf. It is the point that every voltage in a circuit is measured from.',
      done: (work) => work.parts('ground').length > 0,
    },
    {
      id: 'return',
      text: 'Wire the supply\'s − pin to the ground.',
      how: 'Press on the − pin at the bottom of the supply, drag to the pin on top of the ground, and let go. The app draws the wire. To take a wire off again, click it and press Delete.',
      done: (work) => work.parts('power').some((supply) => work.grounded(supply, 1)),
    },
    {
      id: 'switch',
      text: 'Add a switch.',
      how: 'Under Controls on the shelf, or search for "switch". Put it to the right of the supply, level with its top.',
      done: (work) => work.parts('switch').length > 0,
    },
    {
      id: 'resistor',
      text: 'Add a 470 Ω resistor.',
      how: 'Type 470 into the search box and drag the resistor it finds. Any resistor can be changed later: double-click it and pick another value, or type one.',
      done: (work) => work.parts('resistor').some((r) => near(r.parameters.resistance, 470)),
    },
    {
      id: 'led',
      text: 'Add an LED.',
      how: 'Under Semiconductors on the shelf, or search for "LED". It has two legs, A and K. Hold the pointer over a pin to see which it is.',
      done: (work) => work.parts('led').length > 0,
    },
    {
      id: 'wire-switch',
      text: 'Wire the supply\'s + pin to one side of the switch.',
      done: (work) => work.wired('power', [0], 'switch', [0, 1]) || loopWorks(work),
    },
    {
      id: 'wire-resistor',
      text: 'Wire the other side of the switch to one end of the resistor.',
      done: (work) => work.wired('switch', [0, 1], 'resistor', [0, 1], rails(work)) || loopWorks(work),
    },
    {
      id: 'wire-led',
      text: 'Wire the other end of the resistor to the LED\'s A leg.',
      how: 'A is the anode: the leg the current goes in by. K, the cathode, is the leg it comes out of.',
      done: (work) => work.wired('resistor', [0, 1], 'led', [0], rails(work)) || loopWorks(work),
    },
    {
      id: 'wire-ground',
      text: 'Wire the LED\'s K leg to ground.',
      how: 'Run a wire back to the ground you have, or drop a second ground beside the LED: every ground symbol is the same point.',
      done: (work) => work.parts('led').some((led) => work.grounded(led, 1)) || loopWorks(work),
    },
    {
      id: 'play',
      text: 'Press play: ▶ at the top right, or the space bar.',
      how: 'Nothing happens in a circuit until it runs. This one makes light, not sound, so there is nothing to hear.',
      done: (work) => work.situation.playing,
    },
    {
      id: 'light',
      text: 'Close the switch: click it. The LED lights.',
      how: 'Click it again to open it. If the LED stays dark, look at the list above: an unticked step is where the loop is broken.',
      done: (work) => work.situation.playing && ledAmps(work, work.run()) > LIT,
    },
    {
      id: 'meter',
      text: 'Click the LED. The panel at the top right reads it like a meter.',
      how: 'While the circuit plays, a selected part shows the current through it and the voltage across it. A selected wire shows its voltage.',
      done: (work) => work.situation.playing && work.parts('led').some((led) => work.situation.selected.includes(led.id)),
    },
  ],

  why: [
    {
      title: 'A loop',
      text: 'Current only flows round a complete loop: out of the supply at +, through the switch, the resistor and the LED, and back in at −. Open the switch and the loop is broken everywhere at once, so the LED goes dark. Ground is the way back: anything wired to a ground symbol is wired to the supply\'s −.',
    },
    {
      title: 'Voltage',
      text: 'Voltage is the push. It is always between two points, and ground is the point everything is measured from: "9 V" means 9 volts above ground. Click a wire while the circuit plays to read its voltage.',
    },
    {
      title: 'Current',
      text: 'Current is the flow, measured in amps (A). An amp is a lot: this circuit runs on thousandths of one, milliamps (mA). In a single loop the current is the same at every point. Click the resistor, then the LED: both read 14.5 mA.',
    },
    {
      title: 'Resistance',
      text: 'A resistor holds the flow back. Resistance is measured in ohms (Ω), and a thousand ohms is a kilohm (kΩ). Ohm\'s law says how much flows: current = voltage ÷ resistance.',
    },
    {
      title: 'The LED',
      text: 'An LED lets current through one way only, and takes about 2 V for itself while it is lit. The resistor gets what is left: 9 − 2.2 = 6.8 V. By Ohm\'s law, 6.8 V ÷ 470 Ω = 0.0145 A. That is the 14.5 mA on the meter.',
    },
  ],

  tries: [
    {
      id: 'backwards',
      title: 'Turn the LED round',
      question: 'The LED lets current through one way only. Wired backwards, it will…',
      options: ['Light just the same', 'Glow dimly', 'Stay dark'],
      answer: 2,
      change: 'Swap its two wires. Click a wire and press Delete to take it off, then wire the resistor to K and A to ground.',
      made: (work) => {
        const run = withSwitches(work, 1);
        return work.parts('switch').length > 0 && ledAmps(work, run) < DARK
          && work.parts('led').some((led) => run.across(led.id) < -1);
      },
      result: (work) => {
        const run = withSwitches(work, 1);
        const volts = Math.max(...work.parts('led').map((led) => -run.across(led.id)));
        return `Dark. The whole ${formatVolts(volts)} of the supply sits across the LED, pushing the wrong way, and no current flows. Click the LED while the circuit plays to read both numbers. Then turn it back round.`;
      },
    },
    {
      id: 'ten-times',
      title: 'Ten times the resistance',
      question: 'Change the 470 Ω resistor for 4.7 kΩ, ten times as much. The current will be…',
      options: ['About ten times more', 'About the same', 'About a tenth'],
      answer: 2,
      change: 'Click the resistor and type 4.7k into Resistance, at the top right. Keep the switch closed and watch the LED.',
      made: (work) => inLineResistor(work, 4700),
      result: (work) => `${formatAmps(ledAmps(work, withSwitches(work, 1)))}, down from 14.5 mA: a tenth, near enough, and the LED is dimmer. Try 1 kΩ (6.9 mA) and 47 kΩ (0.15 mA) too. The LED's own voltage hardly moves, from 2.2 V down to 1.9 V, so it is the resistor that decides the current. Put 470 Ω back before going on.`,
    },
    {
      id: 'second-led',
      title: 'A second LED',
      question: 'Put a second LED in line with the first, between it and ground. The current will…',
      options: ['Go up', 'Stay the same', 'Go down'],
      answer: 2,
      change: 'Take off the wire from K to ground. Add another LED and wire the first one\'s K to its A, and its K to ground.',
      made: (work) => {
        const run = withSwitches(work, 1);
        const lit = work.parts('led').map((led) => run.amps(led.id)).filter((amps) => amps > LIT);
        return lit.length >= 2 && Math.max(...lit) - Math.min(...lit) <= Math.max(...lit) * 0.01;
      },
      result: (work) => `${formatAmps(ledAmps(work, withSwitches(work, 1)))} through both. Each LED takes its 2 V, so less is left for the resistor (4.8 V where it had 6.8 V with one LED and 470 Ω) and less current flows. It is one loop, so both LEDs carry the same current and are equally bright.`,
    },
    {
      id: 'no-resistor',
      title: 'No resistor',
      question: 'Take the resistor out, so the switch goes straight to the LED. What happens?',
      options: ['Nothing changes', 'The LED is a little brighter', 'Far too much current flows'],
      answer: 2,
      change: 'Delete the resistor: click it and press Delete. The app closes the wire up behind it, so the switch now goes straight to the LED. Close the switch.',
      made: (work) => {
        const run = withSwitches(work, 1);
        return work.parts('led').some((led) => run.strain(led.id) > 1);
      },
      result: (work) => `${formatAmps(ledAmps(work, withSwitches(work, 1)))}, where the LED is built for 0.02 A. The ! beside it is the app being kind: a real LED would burn out in an instant. The rule for the whole course: an LED always has a resistor in line. Put a 470 Ω back: drag one onto the wire between the switch and the LED, and it goes into the wire.`,
    },
  ],

  check: {
    goal: 'Make the LED run at 2 mA. Anywhere from 1.8 to 2.2 mA will do.',
    reading: (work) => {
      if (work.parts('led').length === 0) return null;
      return `Your LED: ${formatAmps(ledAmps(work, withSwitches(work, 1)))}`;
    },
    passed: (work) => {
      const amps = ledAmps(work, withSwitches(work, 1));
      return amps >= 1.8e-3 && amps <= 2.2e-3;
    },
    hint: 'Calculated, not measured: the LED keeps about 2 V, which leaves the resistor about 7 V. For 0.002 A it needs 7 V ÷ 0.002 A = 3,500 Ω. The nearest value on the shelf is 3.3 kΩ.',
  },

  keep: [
    {
      id: 'name',
      text: 'Name the switch LIGHT.',
      how: 'Click the switch and type LIGHT into Name, at the top right. A named control is what makes a circuit a thing: every circuit you keep in this course has one.',
      done: (work) => work.parts('switch').some((part) => (part.label ?? '').trim().toUpperCase() === 'LIGHT'),
    },
    {
      id: 'cover',
      text: 'Look at the cover: the COVER tab at the top left, or the Tab key.',
      how: 'The same circuit three ways. SCHEMATIC is the diagram, BOARD is the parts as they look, COVER is the finished thing: one switch, one lamp. It all still works there.',
      done: (work) => work.situation.view === 'cover',
    },
    {
      id: 'save',
      text: 'Save it: the Save button at the top.',
      how: 'Saved circuits stay in this browser. Load brings them back.',
      done: (work) => work.situation.saved && work.parts('led').length > 0,
    },
  ],

  words: [
    { word: 'Circuit', meaning: 'Parts wired into one or more loops that current can flow round.' },
    { word: 'Voltage', meaning: 'The push between two points, in volts (V).' },
    { word: 'Ground', meaning: 'The point voltages are measured from: 0 V. Here, the supply\'s −.' },
    { word: 'Current', meaning: 'The flow, in amps (A). A milliamp (mA) is a thousandth of an amp.' },
    { word: 'Resistance', meaning: 'How much a part holds current back, in ohms (Ω). A kilohm (kΩ) is a thousand ohms.' },
    { word: 'Ohm\'s law', meaning: 'Current = voltage ÷ resistance.' },
    { word: 'LED', meaning: 'Light-emitting diode: lights when current flows through it from A to K, and passes none the other way.' },
    { word: 'Anode, cathode', meaning: 'An LED\'s two legs: A, where current goes in, and K, where it comes out.' },
    { word: 'Open, closed', meaning: 'A switch that is open breaks the loop. Closed, it completes it.' },
  ],

  // Laid out as the loop it is: up from the supply, along the top through the
  // switch and the resistor, down through the LED, and back along the ground
  circuit: () => light(),
};
