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

export const exampleCircuits: ExampleCircuit[] = [
  {
    name: 'Simple Oscillator',
    description: 'CD40106 + 27kΩ + 2.2kΩ + 100nF → A4 (440Hz)',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const r1 = createComponentFromDefinition(getDefinition('resistor'), { x: 320, y: 200 });
      r1.parameters = { ...r1.parameters, resistance: 27000, value: '27k' };
      const r2 = createComponentFromDefinition(getDefinition('resistor'), { x: 420, y: 200 });
      r2.parameters = { ...r2.parameters, resistance: 2200, value: '2.2k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 550, y: 280 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 700, y: 280 });

      const components = [power, ground, r1, r2, capacitor, ic, output];
      const connections = [
        // Power to IC VDD (pin 12)
        connect(power, 0, ic, 12),
        // Ground to IC VSS (pin 13)
        connect(ground, 0, ic, 13),
        // Power ground pin to ground
        connect(power, 1, ground, 0),
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
        // IC output 1Y to audio output
        connect(ic, 6, output, 0),
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
        // Series chain: IC input → fixed R → pot → IC output
        connect(rFixed, 0, ic, 0),
        connect(rFixed, 1, pot, 0),
        connect(pot, 2, ic, 6),
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
    description: 'Original Recipe — three cross-modulated CD40106 oscillators with LM741 output',
    build: () => {
      // MFOS WSG Voice A "Original Recipe" by Ray Wilson (Aug 2007)
      // Faithful to the schematic: asymmetric cross-coupling via D1+S2+Q1,
      // passive Oddness filter, LM741 inverting amp output stage.

      const power = createComponentFromDefinition(getDefinition('power'), { x: 100, y: 50 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 100, y: 850 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 550, y: 350 });
      const opamp = createComponentFromDefinition(getDefinition('lm741'), { x: 950, y: 500 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 1150, y: 500 });

      // --- Wacky Oscillator (U1-B: input pin 1, output pin 7) ---
      const potWacky = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 150 });
      potWacky.parameters = { ...potWacky.parameters, maxResistance: 1000000, value: '1M', position: 0.3 };
      const r6 = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 150 });
      r6.parameters = { ...r6.parameters, resistance: 4700, value: '4.7k' };
      const c4 = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 250 });
      c4.parameters = { ...c4.parameters, capacitance: 22e-9, value: '22nF' };

      // --- Weird Oscillator (U1-A: input pin 0, output pin 6) ---
      const potWeird = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 400 });
      potWeird.parameters = { ...potWeird.parameters, maxResistance: 1000000, value: '1M', position: 0.5 };
      const c5 = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 500 });
      c5.parameters = { ...c5.parameters, capacitance: 22e-9, value: '22nF' };

      // --- Zany Oscillator (U1-C: input pin 2, output pin 8) ---
      const potZany = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 650 });
      potZany.parameters = { ...potZany.parameters, maxResistance: 1000000, value: '1M', position: 0.7 };
      const r15 = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 650 });
      r15.parameters = { ...r15.parameters, resistance: 4700, value: '4.7k' };
      const c7 = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 750 });
      c7.parameters = { ...c7.parameters, capacitance: 1e-6, value: '1uF' };

      // --- Cross-coupling: Wacky → Weird via D1 + S2 + Q1 ---
      const d1 = createComponentFromDefinition(getDefinition('1n914'), { x: 650, y: 150 });
      const s2 = createComponentFromDefinition(getDefinition('switch'), { x: 720, y: 200 });
      s2.parameters = { ...s2.parameters, closed: 1 }; // Wackiness ON by default
      const q1 = createComponentFromDefinition(getDefinition('2n3904'), { x: 650, y: 350 });
      const r7 = createComponentFromDefinition(getDefinition('resistor'), { x: 650, y: 280 });
      r7.parameters = { ...r7.parameters, resistance: 4700, value: '4.7k' };
      const r14 = createComponentFromDefinition(getDefinition('resistor'), { x: 650, y: 450 });
      r14.parameters = { ...r14.parameters, resistance: 4700, value: '4.7k' };

      // --- Cross-coupling: Zany → Wacky ---
      const r13 = createComponentFromDefinition(getDefinition('resistor'), { x: 450, y: 650 });
      r13.parameters = { ...r13.parameters, resistance: 1000000, value: '1M' };

      // --- Zaniness Amount ---
      const potZaniness = createComponentFromDefinition(getDefinition('potentiometer'), { x: 450, y: 750 });
      potZaniness.parameters = { ...potZaniness.parameters, maxResistance: 100000, value: '100k', position: 0.5 };
      const r19 = createComponentFromDefinition(getDefinition('resistor'), { x: 520, y: 750 });
      r19.parameters = { ...r19.parameters, resistance: 47000, value: '47k' };

      // --- Oddness Filter ---
      const r5 = createComponentFromDefinition(getDefinition('resistor'), { x: 750, y: 500 });
      r5.parameters = { ...r5.parameters, resistance: 1000000, value: '1M' };
      const potOddness = createComponentFromDefinition(getDefinition('potentiometer'), { x: 820, y: 400 });
      potOddness.parameters = { ...potOddness.parameters, maxResistance: 1000000, value: '1M', position: 0.5 };
      const c1 = createComponentFromDefinition(getDefinition('capacitor'), { x: 850, y: 500 });
      c1.parameters = { ...c1.parameters, capacitance: 100e-9, value: '100nF' };

      // --- LM741 Output Stage ---
      const r4 = createComponentFromDefinition(getDefinition('resistor'), { x: 900, y: 450 });
      r4.parameters = { ...r4.parameters, resistance: 10000000, value: '10M' };
      const r11 = createComponentFromDefinition(getDefinition('resistor'), { x: 950, y: 420 });
      r11.parameters = { ...r11.parameters, resistance: 750000, value: '750k' };
      const r16 = createComponentFromDefinition(getDefinition('resistor'), { x: 900, y: 550 });
      r16.parameters = { ...r16.parameters, resistance: 100000, value: '100k' };
      const r17 = createComponentFromDefinition(getDefinition('resistor'), { x: 900, y: 620 });
      r17.parameters = { ...r17.parameters, resistance: 100000, value: '100k' };
      const r12 = createComponentFromDefinition(getDefinition('resistor'), { x: 1050, y: 500 });
      r12.parameters = { ...r12.parameters, resistance: 1000, value: '1k' };
      const c6 = createComponentFromDefinition(getDefinition('capacitor'), { x: 1100, y: 500 });
      c6.parameters = { ...c6.parameters, capacitance: 1e-6, value: '1uF' };

      // --- Bypass cap ---
      const c9 = createComponentFromDefinition(getDefinition('capacitor'), { x: 200, y: 850 });
      c9.parameters = { ...c9.parameters, capacitance: 100e-9, value: '100nF' };

      const components = [
        power, ground, ic, opamp, output,
        potWacky, r6, c4,
        potWeird, c5,
        potZany, r15, c7,
        d1, s2, q1, r7, r14,
        r13, potZaniness, r19,
        r5, potOddness, c1,
        r4, r11, r16, r17, r12, c6,
        c9,
      ];

      // LM741 pin mapping: 0=IN-, 1=IN+, 2=V-, 3=OUT, 4=V+
      // CD40106 pin mapping: 0-5=inputs(1A-6A), 6-11=outputs(1Y-6Y), 12=VDD, 13=VSS
      // 2N3904 pin mapping: 0=Base, 1=Collector, 2=Emitter
      // 1N914 pin mapping: 0=Anode, 1=Cathode

      const connections = [
        // === Power ===
        connect(power, 0, ic, 12),       // +9V to CD40106 VDD
        connect(power, 1, ground, 0),     // Power GND
        connect(ground, 0, ic, 13),       // CD40106 VSS to GND
        connect(power, 0, opamp, 4),      // +9V to LM741 V+
        connect(ground, 0, opamp, 2),     // GND to LM741 V-

        // === Wacky Oscillator (U1-B: input=pin1, output=pin7) ===
        connect(potWacky, 0, ic, 1),      // Pot terminal to input
        connect(potWacky, 2, ic, 7),      // Pot terminal to output
        connect(r6, 0, ic, 1),            // R6 to input (min R, parallel with pot)
        connect(r6, 1, ic, 7),            // R6 to output
        connect(c4, 0, ic, 1),            // C4 to input
        connect(c4, 1, ground, 0),        // C4 to GND

        // === Weird Oscillator (U1-A: input=pin0, output=pin6) ===
        connect(potWeird, 0, ic, 0),      // Pot terminal to input
        connect(potWeird, 2, ic, 6),      // Pot terminal to output
        connect(c5, 0, ic, 0),            // C5 to input
        connect(c5, 1, ground, 0),        // C5 to GND

        // === Zany Oscillator (U1-C: input=pin2, output=pin8) ===
        connect(potZany, 0, ic, 2),       // Pot terminal to input
        connect(potZany, 2, ic, 8),       // Pot terminal to output
        connect(r15, 0, ic, 2),           // R15 to input (min R)
        connect(r15, 1, ic, 8),           // R15 to output
        connect(c7, 0, ic, 2),            // C7 to input
        connect(c7, 1, ground, 0),        // C7 to GND

        // === Cross-coupling: Wacky → Weird (D1 + S2 + Q1) ===
        connect(ic, 7, d1, 0),            // Wacky output → D1 anode
        connect(d1, 1, s2, 0),            // D1 cathode → S2 switch pin 1
        connect(s2, 1, q1, 0),            // S2 pin 2 → Q1 base
        connect(q1, 1, r7, 0),            // Q1 collector → R7
        connect(r7, 1, ic, 6),            // R7 → Weird output (pin 6)
        connect(q1, 2, r14, 0),           // Q1 emitter → R14
        connect(r14, 1, ic, 0),           // R14 → Weird input (pin 0)

        // === Cross-coupling: Zany → Wacky ===
        connect(ic, 8, potZaniness, 0),   // Zany output → Zaniness pot
        connect(potZaniness, 1, r19, 0),  // Zaniness wiper → R19
        connect(r19, 1, r13, 0),          // R19 → R13
        connect(r13, 1, ic, 1),           // R13 → Wacky input

        // === Oddness Filter ===
        connect(ic, 6, r5, 0),            // Weird output → R5 (filter input)
        connect(r5, 1, potOddness, 0),    // R5 → COF1 / Oddness pot
        connect(potOddness, 1, ground, 0),// Oddness wiper → GND (variable shunt)
        connect(r5, 1, c1, 0),            // COF1 → C1
        connect(c1, 1, r4, 0),            // C1 → COF2 → R4 (op-amp input)

        // === LM741 Output Stage ===
        connect(r4, 1, opamp, 0),         // R4 → IN- (inverting input)
        connect(opamp, 3, r11, 0),        // OUT → R11 (feedback)
        connect(r11, 1, opamp, 0),        // R11 → IN- (feedback to inverting)
        connect(power, 0, r16, 0),        // +9V → R16
        connect(r16, 1, opamp, 1),        // R16 → IN+ (bias)
        connect(opamp, 1, r17, 0),        // IN+ → R17
        connect(r17, 1, ground, 0),       // R17 → GND (bias divider = 4.5V)
        connect(opamp, 3, r12, 0),        // OUT → R12 (output resistor)
        connect(r12, 1, c6, 0),           // R12 → C6 (coupling cap)
        connect(c6, 1, output, 0),        // C6 → audio output

        // === Bypass ===
        connect(power, 0, c9, 0),         // +9V → C9
        connect(c9, 1, ground, 0),        // C9 → GND
      ];

      return { components, connections };
    },
  },
];
