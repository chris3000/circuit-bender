import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import type { Component, Connection } from '@/types/circuit';
import { formatValue } from '@/utils/parameterParser';

export interface ExampleCircuit {
  name: string;
  description: string;
  build: () => { components: Component[]; connections: Connection[] };
}

function getDefinition(type: string) {
  const def = ComponentRegistry.getInstance().get(type);
  if (!def) throw new Error(`Component type "${type}" not found`);
  return def;
}

function connect(
  from: Component, fromPinIndex: number,
  to: Component, toPinIndex: number,
): Connection {
  return {
    id: generateConnectionId(),
    from: { componentId: from.id, pinId: from.pins[fromPinIndex].id },
    to: { componentId: to.id, pinId: to.pins[toPinIndex].id },
    net: generateNetId(),
  };
}

/**
 * A named switch. Every example has one, so its cover has something to flip;
 * each starts in the position that plays the example as described.
 */
function namedSwitch(name: string, x: number, y: number, closed: boolean): Component {
  const part = createComponentFromDefinition(getDefinition('switch'), { x, y });
  part.label = name;
  part.parameters = { ...part.parameters, closed: closed ? 1 : 0 };
  return part;
}

/** A part of the given kind at (x, y), turned and named if asked. */
function place(type: string, x: number, y: number, options: { rotation?: number; label?: string; parameters?: Component['parameters'] } = {}): Component {
  const part = createComponentFromDefinition(getDefinition(type), { x, y }, options.parameters);
  if (options.rotation) part.rotation = options.rotation;
  if (options.label) part.label = options.label;
  return part;
}

const resistor = (ohms: number, x: number, y: number, rotation = 0) =>
  place('resistor', x, y, { rotation, parameters: { resistance: ohms, value: formatValue(ohms, 'resistance') } });
const capacitor = (farads: number, x: number, y: number, rotation = 0) =>
  place('capacitor', x, y, { rotation, parameters: { capacitance: farads, value: formatValue(farads, 'capacitance') } });
const pot = (name: string, ohms: number, position: number, x: number, y: number) =>
  place('potentiometer', x, y, { label: name, parameters: { maxResistance: ohms, value: formatValue(ohms, 'resistance'), position } });
const ground = (x: number, y: number) => place('ground', x, y);

/** Pins of the chips by name, in the order their definitions (and models) have them. */
const NE555 = { TRIG: 0, THRES: 1, RESET: 2, CTRL: 3, DISCH: 4, OUT: 5, VCC: 6, GND: 7 };
const CD40106 = { A1: 0, A2: 1, Y1: 6, Y2: 7, VDD: 12, VSS: 13 };
const CD4093 = { A1: 0, B1: 1, Y1: 8, VDD: 12, VSS: 13 };
const CD4040 = { CLK: 0, RST: 1, Q1: 2, Q2: 3, Q3: 4, Q4: 5, VDD: 14, VSS: 15 };
const CD4017 = { CLK: 0, INH: 1, RST: 2, Q0: 3, Q4: 7, VDD: 14, VSS: 15 };
const LM386 = { IN_MINUS: 0, IN_PLUS: 1, GND: 2, OUT: 3, VS: 4 };

/** Input trim on the WSG's jack: its output is line level, a tenth of what a bare CMOS gate puts out. */
const WSG_INPUT_TRIM = 8;

export const exampleCircuits: ExampleCircuit[] = [
  {
    name: 'Simple Oscillator',
    description: 'CD40106 + 27kΩ + 2.2kΩ + 100nF → A4 (440Hz). SOUND switches it on and off',
    build: () => {
      // Layout: IC top-center, feedback R1-R2 bridge below with wide spacing,
      // power/ground above IC, cap far-left below, audio right
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 260 });
      // Feedback bridge below: R1 under input, R2 under output, widely spaced
      const r1 = createComponentFromDefinition(getDefinition('resistor'), { x: 360, y: 400 });
      r1.parameters = { ...r1.parameters, resistance: 27000, value: '27kΩ' };
      const r2 = createComponentFromDefinition(getDefinition('resistor'), { x: 540, y: 400 });
      r2.parameters = { ...r2.parameters, resistance: 2200, value: '2.2kΩ' };
      // Capacitor vertical, far left
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 260, y: 340 });
      capacitor.rotation = 90;
      // Power aligned above VDD (x=490), ground2 aligned above VSS (x=510)
      const power = createComponentFromDefinition(getDefinition('power'), { x: 490, y: 60 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 260, y: 440 });
      const ground2 = createComponentFromDefinition(getDefinition('ground'), { x: 510, y: 130 });
      // SOUND: the gate's output reaches the jack through this switch
      const sound = namedSwitch('SOUND', 620, 210, true);
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 700, y: 250 });

      const components = [power, ground, ground2, r1, r2, capacitor, ic, sound, output];
      const connections = [
        // Power to IC VDD (pin 12)
        connect(power, 0, ic, 12),
        // Ground2 (near IC) to IC VSS (pin 13) — short wire
        connect(ground2, 0, ic, 13),
        // Power ground pin to ground2
        connect(power, 1, ground2, 0),
        // R1 to IC input 1A (pin 0)
        connect(r1, 0, ic, 0),
        // R1 to R2 in series
        connect(r1, 1, r2, 0),
        // R2 to IC output 1Y (pin 6)
        connect(r2, 1, ic, 6),
        // Capacitor pin 1 to IC input 1A (pin 0)
        connect(capacitor, 0, ic, 0),
        // Capacitor pin 2 to ground
        connect(capacitor, 1, ground, 0),
        // Connect both grounds to same net
        connect(ground, 0, ground2, 0),
        // IC output 1Y to audio output, through the SOUND switch
        connect(ic, 6, sound, 0),
        connect(sound, 1, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'Oscillator + Op-Amp',
    description: 'Simple oscillator through LM741 inverting amp. SOFT halves the volume',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const r1 = createComponentFromDefinition(getDefinition('resistor'), { x: 320, y: 200 });
      r1.parameters = { ...r1.parameters, resistance: 27000, value: '27k' };
      const r2 = createComponentFromDefinition(getDefinition('resistor'), { x: 420, y: 200 });
      r2.parameters = { ...r2.parameters, resistance: 2200, value: '2.2k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 550, y: 280 });

      // LM741 inverting amp: R_in=100k, R_fb=100k (unity gain), biased at 4.5V
      const opamp = createComponentFromDefinition(getDefinition('lm741'), { x: 850, y: 300 });
      const rIn = createComponentFromDefinition(getDefinition('resistor'), { x: 700, y: 280 });
      rIn.parameters = { ...rIn.parameters, resistance: 100000, value: '100k' };
      const rFb = createComponentFromDefinition(getDefinition('resistor'), { x: 850, y: 200 });
      rFb.parameters = { ...rFb.parameters, resistance: 100000, value: '100k' };
      // SOFT: 47k across the feedback resistor cuts the gain to a third. At
      // full gain the 741 runs into its output limits, so that is about half as loud.
      const rSoft = createComponentFromDefinition(getDefinition('resistor'), { x: 810, y: 120 });
      rSoft.parameters = { ...rSoft.parameters, resistance: 47000, value: '47k' };
      const soft = namedSwitch('SOFT', 910, 120, false);
      const rBias1 = createComponentFromDefinition(getDefinition('resistor'), { x: 750, y: 380 });
      rBias1.parameters = { ...rBias1.parameters, resistance: 100000, value: '100k' };
      const rBias2 = createComponentFromDefinition(getDefinition('resistor'), { x: 750, y: 450 });
      rBias2.parameters = { ...rBias2.parameters, resistance: 100000, value: '100k' };
      const rOut = createComponentFromDefinition(getDefinition('resistor'), { x: 950, y: 300 });
      rOut.parameters = { ...rOut.parameters, resistance: 1000, value: '1k' };
      const cOut = createComponentFromDefinition(getDefinition('capacitor'), { x: 1020, y: 300 });
      cOut.parameters = { ...cOut.parameters, capacitance: 1e-6, value: '1uF' };

      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 1100, y: 300 });

      const components = [
        power, ground, r1, r2, capacitor, ic,
        opamp, rIn, rFb, rSoft, soft, rBias1, rBias2, rOut, cOut,
        output,
      ];

      // LM741 DIP8: 0=NC, 1=IN-, 2=IN+, 3=V-, 4=NC, 5=OUT, 6=V+, 7=NC
      const connections = [
        // Power
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        // Oscillator (same as Simple Oscillator)
        connect(r1, 0, ic, 0),
        connect(r1, 1, r2, 0),
        connect(r2, 1, ic, 6),
        connect(capacitor, 0, ic, 0),
        connect(capacitor, 1, ground, 0),
        // Op-amp power (0=IN-, 1=IN+, 2=V-, 3=OUT, 4=V+)
        connect(power, 0, opamp, 4),      // V+
        connect(ground, 0, opamp, 2),     // V-
        // Oscillator → R_in → IN-
        connect(ic, 6, rIn, 0),
        connect(rIn, 1, opamp, 0),        // IN-
        // Feedback: OUT → R_fb → IN-
        connect(opamp, 3, rFb, 0),        // OUT
        connect(rFb, 1, opamp, 0),        // IN-
        // SOFT: OUT → R_soft → switch → IN-
        connect(rFb, 0, rSoft, 0),
        connect(rSoft, 1, soft, 0),
        connect(soft, 1, rFb, 1),
        // Bias: +9V → R1 → IN+ → R2 → GND (4.5V midpoint)
        connect(power, 0, rBias1, 0),
        connect(rBias1, 1, opamp, 1),     // IN+
        connect(opamp, 1, rBias2, 0),
        connect(rBias2, 1, ground, 0),
        // Output: OUT → R_out → C_out → audio
        connect(opamp, 3, rOut, 0),
        connect(rOut, 1, cOut, 0),
        connect(cOut, 1, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'Low Drone',
    description: 'CD40106 + 100kΩ + 100nF → ~130Hz bass tone. SUB drops it an octave',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 100000, value: '100k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      // SUB: a second 100nF beside the first doubles the capacitance, halving the pitch
      const cSub = createComponentFromDefinition(getDefinition('capacitor'), { x: 290, y: 430 });
      const sub = namedSwitch('SUB', 390, 430, false);
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 650, y: 280 });

      const components = [power, ground, resistor, capacitor, cSub, sub, ic, output];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        connect(resistor, 0, ic, 0),
        connect(resistor, 1, ic, 6),
        connect(capacitor, 0, ic, 0),
        connect(capacitor, 1, ground, 0),
        // SUB: IC input → switch → second capacitor → ground
        connect(sub, 1, ic, 0),
        connect(sub, 0, cSub, 1),
        connect(cSub, 0, ground, 0),
        connect(ic, 6, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'High Chirp',
    description: 'CD40106 + 10kΩ + 100nF → ~1.3kHz treble. HIGHER lifts it an octave',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 10000, value: '10k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      // HIGHER: a second 10k across the first halves the resistance, doubling the pitch
      const rHigher = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 130 });
      rHigher.parameters = { ...rHigher.parameters, resistance: 10000, value: '10k' };
      const higher = namedSwitch('HIGHER', 450, 130, false);
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 650, y: 280 });

      const components = [power, ground, resistor, rHigher, higher, capacitor, ic, output];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        connect(resistor, 0, ic, 0),
        connect(resistor, 1, ic, 6),
        // HIGHER: IC input → second resistor → switch → IC output
        connect(resistor, 0, rHigher, 0),
        connect(rHigher, 1, higher, 0),
        connect(higher, 1, ic, 6),
        connect(capacitor, 0, ic, 0),
        connect(capacitor, 1, ground, 0),
        connect(ic, 6, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'LED Blinker',
    description: 'Oscillator driving an LED. FAST makes it flicker',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 100000, value: '100k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      capacitor.parameters = { ...capacitor.parameters, capacitance: 10e-6, value: '10µF' };
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      // FAST: 22k across the 100k speeds the blink up about five times
      const rFast = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 130 });
      rFast.parameters = { ...rFast.parameters, resistance: 22000, value: '22k' };
      const fast = namedSwitch('FAST', 450, 130, false);
      const rLed = createComponentFromDefinition(getDefinition('resistor'), { x: 650, y: 200 });
      const led = createComponentFromDefinition(getDefinition('led'), { x: 650, y: 350 });

      const components = [power, ground, resistor, rFast, fast, capacitor, ic, rLed, led];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        // Oscillator
        connect(resistor, 0, ic, 0),
        connect(resistor, 1, ic, 6),
        // FAST: IC input → second resistor → switch → IC output
        connect(resistor, 0, rFast, 0),
        connect(rFast, 1, fast, 0),
        connect(fast, 1, ic, 6),
        connect(capacitor, 0, ic, 0),
        connect(capacitor, 1, ground, 0),
        // IC output to LED through resistor
        connect(ic, 6, rLed, 0),
        connect(rLed, 1, led, 0),
        connect(led, 1, ground, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'Pitch Control',
    description: '10kΩ + 100kΩ pot → 120Hz–1.3kHz. LOW moves the range down to 37–400Hz',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 540 });
      // Fixed 10kΩ resistor sets the ceiling frequency (~1.3kHz)
      const rFixed = createComponentFromDefinition(getDefinition('resistor'), { x: 300, y: 280 });
      rFixed.parameters = { ...rFixed.parameters, resistance: 10000, value: '10k' };
      // 100kΩ pot in series adds 0–100kΩ (floor frequency ~120Hz)
      const pot = createComponentFromDefinition(getDefinition('potentiometer'), { x: 420, y: 280 });
      pot.label = 'PITCH';
      pot.parameters = { ...pot.parameters, maxResistance: 100000, value: '100k', position: 0.5 };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 420 });
      // LOW: 220nF beside the 100nF makes every pitch 3.2 times lower
      const cLow = createComponentFromDefinition(getDefinition('capacitor'), { x: 290, y: 500 });
      cLow.parameters = { ...cLow.parameters, capacitance: 220e-9, value: '220nF' };
      const low = namedSwitch('LOW', 390, 500, false);
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 560, y: 300 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 700, y: 300 });

      const components = [power, ground, rFixed, pot, capacitor, cLow, low, ic, output];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        // Series chain: IC input → fixed R → pot wiper → IC output
        connect(rFixed, 0, ic, 0),
        connect(rFixed, 1, pot, 0),
        connect(pot, 1, ic, 6),   // wiper (pin 1) to output — rheostat wiring
        // Capacitor from IC input to ground
        connect(capacitor, 0, ic, 0),
        connect(capacitor, 1, ground, 0),
        // LOW: IC input → switch → second capacitor → ground
        connect(low, 1, ic, 0),
        connect(low, 0, cLow, 1),
        connect(cLow, 0, ground, 0),
        // IC output to audio
        connect(ic, 6, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'Atari Punk Console',
    description: 'Two 555 timers into a speaker: PITCH sets the first, WIDTH how many of its cycles the second swallows. DEEP drops it down',
    build: () => {
      const power = place('power', 100, 240);
      const gPower = ground(100, 340);

      // First 555, astable: 1k and 10k + PITCH charge the 10nF, 10k + PITCH empty it
      const r1 = resistor(1e3, 240, 170);
      const r2 = resistor(10e3, 240, 250);
      const pitch = pot('PITCH', 500e3, 0.5, 240, 340);
      const c1 = capacitor(10e-9, 330, 420, 90);
      const g1 = ground(330, 500);
      const u1 = place('ne555', 440, 280);
      const gU1 = ground(520, 180);

      // Second 555, one-shot: fired by the first, it stays high for as long as 10k + WIDTH take to charge 22nF
      const r3 = resistor(10e3, 570, 380);
      const width = pot('WIDTH', 500e3, 0.5, 570, 480);
      const c2 = capacitor(22e-9, 650, 560, 90);
      const g2 = ground(650, 640);
      const u2 = place('ne555', 720, 280);
      const gU2 = ground(800, 180);
      // DEEP: 100nF beside the 22nF makes each pulse five times longer
      const deep = namedSwitch('DEEP', 740, 480, false);
      const c3 = capacitor(100e-9, 810, 560, 90);
      const g3 = ground(810, 640);

      // A 555 is strong enough to drive a speaker through a capacitor
      const cOut = capacitor(100e-6, 850, 270);
      const speaker = place('speaker', 960, 280);
      const gOut = ground(930, 370);

      const components = [power, gPower, r1, r2, pitch, c1, g1, u1, gU1, r3, width, c2, g2, u2, gU2, deep, c3, g3, cOut, speaker, gOut];
      const connections = [
        connect(power, 1, gPower, 0),
        connect(power, 0, u1, NE555.VCC),
        connect(u1, NE555.VCC, u2, NE555.VCC),
        connect(u1, NE555.GND, gU1, 0),
        connect(u2, NE555.GND, gU2, 0),
        // Astable: VCC → 1k → DISCH → 10k → PITCH → THRES + TRIG → 10nF → ground
        connect(power, 0, r1, 0),
        connect(r1, 1, u1, NE555.DISCH),
        connect(r2, 1, u1, NE555.DISCH),
        connect(r2, 0, pitch, 2),   // the far end, so that turning PITCH up takes resistance out
        connect(pitch, 1, u1, NE555.THRES),
        connect(u1, NE555.THRES, u1, NE555.TRIG),
        connect(c1, 0, u1, NE555.TRIG),
        connect(c1, 1, g1, 0),
        // The first fires the second
        connect(u1, NE555.OUT, u2, NE555.TRIG),
        // One-shot: VCC → 10k → WIDTH → THRES + DISCH → 22nF → ground
        connect(u2, NE555.VCC, r3, 0),
        connect(r3, 1, width, 0),
        connect(width, 1, u2, NE555.THRES),
        connect(u2, NE555.THRES, u2, NE555.DISCH),
        connect(c2, 0, u2, NE555.THRES),
        connect(c2, 1, g2, 0),
        // DEEP: THRES → switch → 100nF → ground
        connect(deep, 0, u2, NE555.THRES),
        connect(deep, 1, c3, 0),
        connect(c3, 1, g3, 0),
        // Out through 100µF to the speaker
        connect(u2, NE555.OUT, cOut, 0),
        connect(cOut, 1, speaker, 0),
        connect(speaker, 1, gOut, 0),
      ];
      return { components, connections };
    },
  },
  {
    name: 'Light Theremin',
    description: 'A CD4093 gate that sings while it is let: LIGHT on the photocell sets the pitch, TOUCH bends it, PLAY sounds it. DRONE holds it on',
    build: () => {
      const power = place('power', 100, 200);
      const gPower = ground(100, 300);
      const chip = place('cd4093', 480, 320);
      const gChip = ground(560, 170);

      // Gate 1 runs only while its other input is high: PLAY, or DRONE to leave it on
      const play = place('pushbutton', 260, 190, { label: 'PLAY' });
      const drone = namedSwitch('DRONE', 260, 110, true);
      const rDown = resistor(100e3, 360, 330, 90);
      const gDown = ground(360, 430);

      // Its pitch: 4.7k and the photocell from output to input, 47nF to ground. A finger across the cell bends it
      const rMin = resistor(4.7e3, 560, 520);
      const cell = place('ldr', 430, 520, { label: 'LIGHT' });
      const touch = place('body-contact', 430, 600, { label: 'TOUCH' });
      const cTime = capacitor(47e-9, 280, 560, 90);
      const gTime = ground(280, 640);

      const output = place('audio-output', 680, 290);

      const components = [power, gPower, chip, gChip, play, drone, rDown, gDown, rMin, cell, touch, cTime, gTime, output];
      const connections = [
        connect(power, 1, gPower, 0),
        connect(power, 0, chip, CD4093.VDD),
        connect(chip, CD4093.VSS, gChip, 0),
        // Enable: VDD → PLAY (and DRONE beside it) → input A, held low by 100k when neither is on
        connect(power, 0, play, 0),
        connect(play, 1, chip, CD4093.A1),
        connect(drone, 0, play, 0),
        connect(drone, 1, play, 1),
        connect(rDown, 0, chip, CD4093.A1),
        connect(rDown, 1, gDown, 0),
        // Oscillator: output → 4.7k → photocell → input B → 47nF → ground
        connect(chip, CD4093.Y1, rMin, 1),
        connect(rMin, 0, cell, 1),
        connect(cell, 0, chip, CD4093.B1),
        connect(touch, 0, cell, 0),
        connect(touch, 1, cell, 1),
        connect(cTime, 0, chip, CD4093.B1),
        connect(cTime, 1, gTime, 0),
        connect(chip, CD4093.Y1, output, 0),
      ];
      return { components, connections };
    },
  },
  {
    name: 'Octave Organ',
    description: 'A CD4040 divides one oscillator into octaves; two of them go through an LM386 to a speaker. BASS adds the octave below',
    build: () => {
      const power = place('power', 100, 200);
      const gPower = ground(100, 300);

      // The oscillator everything is counted down from: 4.7k + PITCH and 10nF, about 2.4kHz half way
      const osc = place('cd40106', 300, 300);
      const gOsc = ground(380, 170);
      const rMin = resistor(4.7e3, 230, 450);
      const pitch = pot('PITCH', 100e3, 0.5, 340, 450);
      const cTime = capacitor(10e-9, 170, 360, 90);
      const gTime = ground(130, 450);

      const divider = place('cd4040', 540, 340);
      const gDivider = ground(620, 150);

      // Q2 and Q3 (a quarter and an eighth of the oscillator) mixed down to a quarter of a volt
      const rQ2 = resistor(100e3, 700, 220);
      const rQ3 = resistor(100e3, 700, 280);
      // BASS: Q4, an octave lower again and twice as strong
      const bass = namedSwitch('BASS', 660, 350, false);
      const rQ4 = resistor(47e3, 760, 350);
      const rMix = resistor(1e3, 840, 390, 90);
      const gMix = ground(840, 480);

      const cIn = capacitor(100e-9, 900, 280);
      const amp = place('lm386', 1000, 271);
      const gAmp = ground(940, 380);
      const cOut = capacitor(220e-6, 1090, 280);
      const speaker = place('speaker', 1200, 290);
      const gOut = ground(1170, 380);

      const components = [
        power, gPower, osc, gOsc, rMin, pitch, cTime, gTime, divider, gDivider,
        rQ2, rQ3, bass, rQ4, rMix, gMix, cIn, amp, gAmp, cOut, speaker, gOut,
      ];
      const connections = [
        connect(power, 1, gPower, 0),
        connect(power, 0, osc, CD40106.VDD),
        connect(osc, CD40106.VDD, divider, CD4040.VDD),
        connect(divider, CD4040.VDD, amp, LM386.VS),
        connect(osc, CD40106.VSS, gOsc, 0),
        connect(divider, CD4040.VSS, gDivider, 0),
        // Oscillator: input → 4.7k → PITCH → output, 10nF from input to ground
        connect(rMin, 0, osc, CD40106.A1),
        connect(rMin, 1, pitch, 2),   // the far end, so that turning PITCH up takes resistance out
        connect(pitch, 1, osc, CD40106.Y1),
        connect(cTime, 0, osc, CD40106.A1),
        connect(cTime, 1, gTime, 0),
        connect(osc, CD40106.Y1, divider, CD4040.CLK),
        // The mix: each octave through its resistor to 1k
        connect(divider, CD4040.Q2, rQ2, 0),
        connect(divider, CD4040.Q3, rQ3, 0),
        connect(divider, CD4040.Q4, bass, 0),
        connect(bass, 1, rQ4, 0),
        connect(rQ2, 1, rMix, 0),
        connect(rQ3, 1, rMix, 0),
        connect(rQ4, 1, rMix, 0),
        connect(rMix, 1, gMix, 0),
        // Amplifier: 100nF in, 220µF out to the speaker
        connect(rMix, 0, cIn, 0),
        connect(cIn, 1, amp, LM386.IN_PLUS),
        connect(amp, LM386.IN_MINUS, gAmp, 0),
        connect(amp, LM386.GND, gAmp, 0),
        connect(amp, LM386.OUT, cOut, 0),
        connect(cOut, 1, speaker, 0),
        connect(speaker, 1, gOut, 0),
      ];
      return { components, connections };
    },
  },
  {
    name: 'Step Sequencer',
    description: 'A CD4017 steps a 555 through four notes at the pace TEMPO sets. SHORT loops those four; without it there are six more steps of the top note',
    build: () => {
      const power = place('power', 100, 200);
      const gPower = ground(100, 300);

      // The clock: 47k + TEMPO and 1µF, a few steps a second
      const clock = place('cd40106', 300, 300);
      const gClock = ground(380, 170);
      const rClock = resistor(47e3, 320, 450);
      const tempo = pot('TEMPO', 500e3, 0.5, 210, 450);
      const cClock = capacitor(1e-6, 150, 380, 90);
      const gClockCap = ground(110, 460);

      const counter = place('cd4017', 520, 330);
      const gCounter = ground(600, 150);
      // SHORT: the fifth step resets the count, so it goes round the first four
      const short = namedSwitch('SHORT', 660, 520, true);
      const rReset = resistor(100e3, 440, 430, 90);
      const gReset = ground(440, 530);

      // Each of the first four outputs reaches the 555's control pin through a resistor. The one that is
      // high pulls the pin up and the rest pull it down: the smaller its resistor, the higher the pin,
      // the longer each cycle, the lower the note
      const steps = [4.7e3, 10e3, 6.8e3, 15e3].map((ohms, i) => resistor(ohms, 700, 200 + i * 50));
      // A light on the first step
      const rLed = resistor(2.2e3, 760, 440);
      const led = place('led', 860, 440, { label: 'STEP' });
      const gLed = ground(920, 500);

      // The voice: a 555 with 47k, 4.7k and 100nF
      const voice = place('ne555', 1000, 300);
      const gVoice = ground(1080, 190);
      const rA = resistor(47e3, 900, 150);
      const rB = resistor(4.7e3, 900, 560, 90);
      const cVoice = capacitor(100e-9, 980, 500, 90);
      const gVoiceCap = ground(980, 580);
      const output = place('audio-output', 1110, 310);

      const components = [
        power, gPower, clock, gClock, rClock, tempo, cClock, gClockCap, counter, gCounter, short, rReset, gReset,
        ...steps, rLed, led, gLed, voice, gVoice, rA, rB, cVoice, gVoiceCap, output,
      ];
      const connections = [
        connect(power, 1, gPower, 0),
        connect(power, 0, clock, CD40106.VDD),
        connect(clock, CD40106.VDD, counter, CD4017.VDD),
        connect(counter, CD4017.VDD, rA, 0),
        connect(rA, 0, voice, NE555.VCC),
        connect(clock, CD40106.VSS, gClock, 0),
        connect(counter, CD4017.VSS, gCounter, 0),
        connect(voice, NE555.GND, gVoice, 0),
        // Clock: input → TEMPO → 47k → output, 1µF from input to ground
        connect(tempo, 1, clock, CD40106.A1),
        connect(tempo, 2, rClock, 0),
        connect(rClock, 1, clock, CD40106.Y1),
        connect(cClock, 0, clock, CD40106.A1),
        connect(cClock, 1, gClockCap, 0),
        connect(clock, CD40106.Y1, counter, CD4017.CLK),
        // SHORT: Q4 → switch → RESET, which 100k otherwise holds low
        connect(counter, CD4017.Q4, short, 1),
        connect(short, 0, counter, CD4017.RST),
        connect(rReset, 0, counter, CD4017.RST),
        connect(rReset, 1, gReset, 0),
        // Steps: Q0–Q3 → resistor → the 555's control pin
        ...steps.flatMap((step, i) => [
          connect(counter, CD4017.Q0 + i, step, 0),
          connect(step, 1, voice, NE555.CTRL),
        ]),
        // The light on step one
        connect(counter, CD4017.Q0, rLed, 0),
        connect(rLed, 1, led, 0),
        connect(led, 1, gLed, 0),
        // Voice: VCC → 47k → DISCH → 4.7k → THRES + TRIG → 100nF → ground
        connect(rA, 1, voice, NE555.DISCH),
        connect(rB, 0, voice, NE555.DISCH),
        connect(rB, 1, voice, NE555.THRES),
        connect(voice, NE555.THRES, voice, NE555.TRIG),
        connect(cVoice, 0, voice, NE555.TRIG),
        connect(cVoice, 1, gVoiceCap, 0),
        connect(voice, NE555.OUT, output, 0),
      ];
      return { components, connections };
    },
  },
  {
    name: 'MFOS Weird Sound Generator',
    description: 'Original Recipe — Wacky gates Weird, Zany bends it, resonant Oddness filter',
    build: () => {
      // "Your First Wacky Electronic Noise Maker Thingy" (WSG Voice A, Original
      // Recipe) by Ray Wilson / Music From Outer Space, Aug 2007. Reference
      // designators and values follow the published schematic.
      //
      //   Wacky (U1-B)  square wave; through S2 + D1 it holds the Weird
      //                 oscillator's input low on its low half-cycles (gating)
      //   Zany  (U1-C)  slow square wave; through R18/R19/R33 it turns on Q1,
      //                 which shorts out the Weird frequency pot
      //   Weird (U1-A)  the voice: R7 + (R9 + R14, bypassed by Q1) and C5
      //   Oddness       U2 with a bridged-T (C2, C3, R3 + R8) in its feedback:
      //                 a resonant low-pass whose corner follows R3
      //
      // Pots are wired so that turning one up raises the pitch / amount / cutoff.
      const at = (type: string, x: number, y: number, rotation = 0) => {
        const c = createComponentFromDefinition(getDefinition(type), { x, y });
        c.rotation = rotation;
        return c;
      };
      const resistor = (x: number, y: number, resistance: number, value: string, rotation = 0) => {
        const c = at('resistor', x, y, rotation);
        c.parameters = { ...c.parameters, resistance, value };
        return c;
      };
      const capacitor = (x: number, y: number, capacitance: number, value: string, rotation = 0) => {
        const c = at('capacitor', x, y, rotation);
        c.parameters = { ...c.parameters, capacitance, value };
        return c;
      };
      const pot = (name: string, x: number, y: number, maxResistance: number, value: string, position: number, rotation = 0) => {
        const c = at('potentiometer', x, y, rotation);
        c.label = name;
        c.parameters = { ...c.parameters, maxResistance, value, position };
        return c;
      };

      const ground = (x: number, y: number) => at('ground', x, y);

      // The layout follows the signal: supply top left, the three
      // oscillators around the IC, the Weird oscillator's bending network to
      // its right, then the filter and the output. Wacky and Zany loop under
      // the IC (one inside the other) and Weird's feedback returns over the
      // top, which keeps wire crossings to a handful.

      // --- Supply ---
      const power = at('power', 240, 170);
      const c9 = capacitor(320, 170, 100e-9, '100nF', 90);  // bypass
      const gPower = ground(280, 270);

      const ic = at('cd40106', 500, 420);
      const gIc = ground(560, 300);

      // --- Zany oscillator (U1-C): the inner loop under the IC ---
      const r13 = pot('ZANY', 520, 580, 1e6, '1M', 0.6);    // Zany Frequency
      const r15 = resistor(420, 580, 4700, '4.7k');
      const c7 = capacitor(300, 470, 1e-6, '1uF', 90);
      const gZany = ground(300, 540);

      // --- Wacky oscillator (U1-B): the outer loop under the IC ---
      const r1 = pot('WACKY', 520, 730, 1e6, '1M', 0.35);   // Wacky Frequency
      const r6 = resistor(420, 730, 4700, '4.7k');
      const c4 = capacitor(200, 460, 22e-9, '22nF', 90);
      const gWacky = ground(200, 530);

      // --- Zany → Q1 base ---
      const r18 = pot('ZANINESS', 670, 570, 100e3, '100k', 0.7);  // Zaniness Amount
      const gZaniness = ground(620, 620);
      const r19 = resistor(670, 490, 47e3, '47k', 270);
      const r33 = resistor(740, 440, 47e3, '47k');

      // --- Weird oscillator (U1-A), right of the IC ---
      const r7 = resistor(640, 370, 4700, '4.7k');
      const q1 = at('2n3904', 860, 440);
      const r9 = pot('WEIRD', 960, 410, 1e6, '1M', 0.8, 90); // Weird Frequency
      const r14 = resistor(960, 500, 4700, '4.7k', 270);
      const c5 = capacitor(1040, 610, 22e-9, '22nF', 90);
      const gWeird = ground(1040, 690);

      // --- Wackiness gate ---
      const s2 = at('switch', 870, 620);                    // Wackiness
      s2.parameters = { ...s2.parameters, closed: 1 };
      s2.label = 'WACKINESS';
      const d1 = at('1n914', 950, 620, 180);                // cathode towards the switch

      // --- Oddness filter and output (U2) ---
      const r5 = resistor(1180, 300, 1e6, '1M');
      const r10 = resistor(1260, 380, 1000, '1k', 90);
      const gFilter = ground(1260, 470);
      const c1 = capacitor(1330, 300, 100e-9, '100nF');
      const r11 = resistor(1420, 300, 750e3, '750k');
      const opamp = at('lm741', 1580, 320);
      const gOpamp = ground(1520, 420);
      const r4 = resistor(1580, 220, 10e6, '10M');
      const c2 = capacitor(1530, 140, 470e-12, '470pF');
      const c3 = capacitor(1630, 140, 470e-12, '470pF');
      const r3 = pot('ODDNESS', 1580, 70, 1e6, '1M', 0.9, 180); // Oddness Cut Off Frequency
      const r8 = resistor(1460, 70, 1000, '1k');
      const r16 = resistor(1350, 440, 100e3, '100k');
      const r17 = resistor(1440, 520, 100e3, '100k', 90);
      const c8 = capacitor(1360, 520, 220e-6, '220uF', 90);
      const gBias = ground(1400, 620);
      const r12 = resistor(1690, 329, 1000, '1k');
      const c6 = capacitor(1780, 329, 1e-6, '1uF');
      const output = at('audio-output', 1870, 349);
      // The WSG puts out a few hundred millivolts (it is meant for an
      // amplifier input), so turn the jack's input trim up to match
      output.parameters = { ...output.parameters, gain: WSG_INPUT_TRIM };

      // Pots first, in panel order (the tests address them by position)
      const components = [
        r1, r13, r18, r9, r3,
        power, c9, gPower, ic, gIc,
        r6, c4, gWacky,
        r15, c7, gZany,
        gZaniness, r19, r33,
        s2, d1,
        r7, q1, r14, c5, gWeird,
        r5, r10, gFilter, c1, r11, opamp, gOpamp, r4, c2, c3, r8, r16, r17, c8, gBias, r12, c6, output,
      ];

      // CD40106: 0-5 = inputs 1A-6A, 6-11 = outputs 1Y-6Y, 12 = VDD, 13 = VSS
      const WEIRD_IN = 0, WACKY_IN = 1, ZANY_IN = 2;
      const WEIRD_OUT = 6, WACKY_OUT = 7, ZANY_OUT = 8;
      // LM741: 0 = IN-, 1 = IN+, 2 = V-, 3 = OUT, 4 = V+
      // Potentiometer: 0 and 2 = ends, 1 = wiper.  2N3904: 0 = B, 1 = C, 2 = E.
      // 1N914: 0 = anode, 1 = cathode.
      // Ground symbols are all one node; each block uses the nearest one.

      const connections = [
        // === Power ===
        connect(power, 0, ic, 12),
        connect(power, 1, gPower, 0),
        connect(gIc, 0, ic, 13),
        connect(power, 0, opamp, 4),
        connect(gOpamp, 0, opamp, 2),
        connect(power, 0, c9, 0),
        connect(c9, 1, gPower, 0),

        // === Wacky: output → R1 (rheostat) → R6 → input, C4 to ground ===
        connect(ic, WACKY_OUT, r1, 2),
        connect(r1, 0, r1, 1),
        connect(r1, 0, r6, 1),
        connect(r6, 0, ic, WACKY_IN),
        connect(c4, 0, ic, WACKY_IN),
        connect(c4, 1, gWacky, 0),

        // === Zany: output → R13 (rheostat) → R15 → input, C7 to ground ===
        connect(ic, ZANY_OUT, r13, 2),
        connect(r13, 0, r13, 1),
        connect(r13, 0, r15, 1),
        connect(r15, 0, ic, ZANY_IN),
        connect(c7, 0, ic, ZANY_IN),
        connect(c7, 1, gZany, 0),

        // === Zaniness: R18 divides the Zany output; wiper → R19 → R33 → Q1 base ===
        connect(ic, ZANY_OUT, r18, 2),
        connect(r18, 0, gZaniness, 0),
        connect(r18, 1, r19, 0),
        connect(r19, 1, r33, 0),
        connect(r33, 1, q1, 0),

        // === Wackiness: Wacky output → S2 → D1 cathode; D1 anode on the Weird input ===
        connect(ic, WACKY_OUT, s2, 0),
        connect(s2, 1, d1, 1),
        connect(d1, 0, ic, WEIRD_IN),

        // === Weird: output → R7 → (R9 + R14, with Q1 across them) → input, C5 to ground ===
        connect(ic, WEIRD_OUT, r7, 0),
        connect(r7, 1, q1, 1),
        connect(r7, 1, r9, 0),
        connect(r9, 0, r9, 1),
        connect(r9, 2, r14, 1),
        connect(r14, 0, q1, 2),
        connect(q1, 2, c5, 0),
        connect(c5, 0, ic, WEIRD_IN),
        connect(c5, 1, gWeird, 0),

        // === Filter input: R5 / R10 cut the 9V square down to millivolts, C1 → R11 → IN- ===
        connect(ic, WEIRD_OUT, r5, 0),
        connect(r5, 1, r10, 0),
        connect(r10, 1, gFilter, 0),
        connect(r5, 1, c1, 0),
        connect(c1, 1, r11, 0),
        connect(r11, 1, opamp, 0),

        // === Feedback: R4, bridged by C2 – C3 with R3 + R8 from their junction to the bias rail ===
        connect(opamp, 0, r4, 0),
        connect(r4, 1, opamp, 3),
        connect(opamp, 0, c2, 0),
        connect(c2, 1, c3, 0),
        connect(c3, 1, opamp, 3),
        connect(c2, 1, r3, 0),
        connect(r3, 0, r3, 1),
        connect(r3, 2, r8, 1),
        connect(r8, 0, opamp, 1),

        // === Bias: half supply from R16 / R17, held steady by C8 ===
        connect(power, 0, r16, 0),
        connect(r16, 1, opamp, 1),
        connect(r16, 1, r17, 0),
        connect(r17, 1, gBias, 0),
        connect(r16, 1, c8, 0),
        connect(c8, 1, gBias, 0),

        // === Output: R12 → C6 → jack ===
        connect(opamp, 3, r12, 0),
        connect(r12, 1, c6, 0),
        connect(c6, 1, output, 0),
      ];

      return { components, connections };
    },
  },
];
