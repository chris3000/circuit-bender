import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import type { Component, Connection } from '@/types/circuit';

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

/** Input trim on the WSG's jack: its output is line level, a tenth of what a bare CMOS gate puts out. */
const WSG_INPUT_TRIM = 8;

export const exampleCircuits: ExampleCircuit[] = [
  {
    name: 'Simple Oscillator',
    description: 'CD40106 + 27kΩ + 2.2kΩ + 100nF → A4 (440Hz)',
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
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 700, y: 210 });

      const components = [power, ground, ground2, r1, r2, capacitor, ic, output];
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
        // IC output 1Y to audio output
        connect(ic, 6, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'Oscillator + Op-Amp',
    description: 'Simple oscillator through LM741 inverting amp',
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
        opamp, rIn, rFb, rBias1, rBias2, rOut, cOut,
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
    description: 'CD40106 + 100kΩ + 100nF → ~130Hz bass tone',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 100000, value: '100k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 650, y: 280 });

      const components = [power, ground, resistor, capacitor, ic, output];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        connect(resistor, 0, ic, 0),
        connect(resistor, 1, ic, 6),
        connect(capacitor, 0, ic, 0),
        connect(capacitor, 1, ground, 0),
        connect(ic, 6, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'High Chirp',
    description: 'CD40106 + 10kΩ + 100nF → ~1.3kHz treble',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 10000, value: '10k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 650, y: 280 });

      const components = [power, ground, resistor, capacitor, ic, output];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        connect(resistor, 0, ic, 0),
        connect(resistor, 1, ic, 6),
        connect(capacitor, 0, ic, 0),
        connect(capacitor, 1, ground, 0),
        connect(ic, 6, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'LED Blinker',
    description: 'Oscillator driving an LED',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 100000, value: '100k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      capacitor.parameters = { ...capacitor.parameters, capacitance: 10e-6, value: '10µF' };
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      const rLed = createComponentFromDefinition(getDefinition('resistor'), { x: 650, y: 200 });
      const led = createComponentFromDefinition(getDefinition('led'), { x: 650, y: 350 });

      const components = [power, ground, resistor, capacitor, ic, rLed, led];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        // Oscillator
        connect(resistor, 0, ic, 0),
        connect(resistor, 1, ic, 6),
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
    description: '10kΩ + 100kΩ pot → 120Hz–1.3kHz',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      // Fixed 10kΩ resistor sets the ceiling frequency (~1.3kHz)
      const rFixed = createComponentFromDefinition(getDefinition('resistor'), { x: 300, y: 280 });
      rFixed.parameters = { ...rFixed.parameters, resistance: 10000, value: '10k' };
      // 100kΩ pot in series adds 0–100kΩ (floor frequency ~120Hz)
      const pot = createComponentFromDefinition(getDefinition('potentiometer'), { x: 420, y: 280 });
      pot.parameters = { ...pot.parameters, maxResistance: 100000, value: '100k', position: 0.5 };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 420 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 560, y: 300 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 700, y: 300 });

      const components = [power, ground, rFixed, pot, capacitor, ic, output];
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
        // IC output to audio
        connect(ic, 6, output, 0),
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
      const pot = (x: number, y: number, maxResistance: number, value: string, position: number, rotation = 0) => {
        const c = at('potentiometer', x, y, rotation);
        c.parameters = { ...c.parameters, maxResistance, value, position };
        return c;
      };

      const ground = (x: number, y: number) => at('ground', x, y);

      // --- Supply ---
      const power = at('power', 120, 150);
      const c9 = capacitor(220, 150, 100e-9, '100nF', 90);  // bypass
      const gPower = ground(170, 260);

      const ic = at('cd40106', 520, 430);
      const gIc = ground(620, 330);

      // --- Wacky oscillator (U1-B), above the IC ---
      const r6 = resistor(400, 230, 4700, '4.7k');
      const r1 = pot(520, 230, 1e6, '1M', 0.35);            // Wacky Frequency
      const c4 = capacitor(310, 320, 22e-9, '22nF', 90);
      const gWacky = ground(310, 400);

      // --- Zany oscillator (U1-C), below the IC ---
      const r15 = resistor(400, 630, 4700, '4.7k');
      const r13 = pot(520, 630, 1e6, '1M', 0.6);            // Zany Frequency
      const c7 = capacitor(310, 540, 1e-6, '1uF', 90);
      const gZany = ground(310, 620);

      // --- Zany → Q1 base ---
      const r18 = pot(700, 680, 100e3, '100k', 0.7);        // Zaniness Amount
      const gZaniness = ground(640, 750);
      const r19 = resistor(790, 620, 47e3, '47k');
      const r33 = resistor(890, 620, 47e3, '47k');

      // --- Wackiness gate ---
      const s2 = at('switch', 700, 250);                    // Wackiness
      s2.parameters = { ...s2.parameters, closed: 1 };
      const d1 = at('1n914', 800, 250, 180);                // cathode towards the switch

      // --- Weird oscillator (U1-A), right of the IC ---
      const r7 = resistor(700, 380, 4700, '4.7k');
      const q1 = at('2n3904', 810, 450);
      const r9 = pot(930, 380, 1e6, '1M', 0.8);             // Weird Frequency
      const r14 = resistor(930, 500, 4700, '4.7k');
      const c5 = capacitor(700, 520, 22e-9, '22nF', 90);
      const gWeird = ground(700, 600);

      // --- Oddness filter and output (U2) ---
      const r5 = resistor(1080, 300, 1e6, '1M');
      const r10 = resistor(1160, 380, 1000, '1k', 90);
      const gFilter = ground(1160, 470);
      const c1 = capacitor(1230, 300, 100e-9, '100nF');
      const r11 = resistor(1320, 300, 750e3, '750k');
      const opamp = at('lm741', 1480, 320);
      const gOpamp = ground(1420, 420);
      const r4 = resistor(1480, 220, 10e6, '10M');
      const c2 = capacitor(1430, 140, 470e-12, '470pF');
      const c3 = capacitor(1530, 140, 470e-12, '470pF');
      const r3 = pot(1480, 70, 1e6, '1M', 0.9, 180);        // Oddness Cut Off Frequency
      const r8 = resistor(1360, 70, 1000, '1k');
      const r16 = resistor(1250, 440, 100e3, '100k');
      const r17 = resistor(1340, 520, 100e3, '100k', 90);
      const c8 = capacitor(1260, 520, 220e-6, '220uF', 90);
      const gBias = ground(1300, 620);
      const r12 = resistor(1590, 329, 1000, '1k');
      const c6 = capacitor(1680, 329, 1e-6, '1uF');
      const output = at('audio-output', 1770, 349);
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
