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
    description: 'CD40106 + R + C → A4 (440Hz)',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 16000, value: '16k' };
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 650, y: 280 });

      const components = [power, ground, resistor, capacitor, ic, output];
      const connections = [
        // Power to IC VDD (pin 12)
        connect(power, 0, ic, 12),
        // Ground to IC VSS (pin 13)
        connect(ground, 0, ic, 13),
        // Power ground pin to ground
        connect(power, 1, ground, 0),
        // Resistor pin 1 to IC input 1A (pin 0)
        connect(resistor, 0, ic, 0),
        // Resistor pin 2 to IC output 1Y (pin 6)
        connect(resistor, 1, ic, 6),
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
    description: 'CD40106 + 47kΩ + 100nF → ~177Hz bass tone',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 47000, value: '47k' };
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
    description: 'CD40106 + 4.7kΩ + 100nF → ~1.77kHz treble',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const resistor = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 200 });
      resistor.parameters = { ...resistor.parameters, resistance: 4700, value: '4.7k' };
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
    description: '4.7kΩ + 100kΩ pot → 80Hz–1.8kHz',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      // Fixed 4.7kΩ resistor sets the ceiling frequency (~1.8kHz)
      const rFixed = createComponentFromDefinition(getDefinition('resistor'), { x: 300, y: 280 });
      rFixed.parameters = { ...rFixed.parameters, resistance: 4700, value: '4.7k' };
      // 100kΩ pot in series adds 0–100kΩ (floor frequency ~80Hz)
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
    description: 'Three cross-modulated CD40106 oscillators → LM741 mixer',
    build: () => {
      // MFOS WSG Voice A "Original Recipe" by Ray Wilson.
      // Three CD40106 oscillators cross-modulated via 2N3904/1N914,
      // mixed through LM741 inverting amplifier.

      const power = createComponentFromDefinition(getDefinition('power'), { x: 100, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 100, y: 700 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 400 });
      const opamp = createComponentFromDefinition(getDefinition('lm741'), { x: 820, y: 400 });
      const q1 = createComponentFromDefinition(getDefinition('2n3904'), { x: 420, y: 240 });
      const d1 = createComponentFromDefinition(getDefinition('1n914'), { x: 340, y: 160 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 1020, y: 400 });

      // Wacky oscillator (U1-B, pins 1=2A / 7=2Y)
      const potWacky = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 200 });
      potWacky.parameters = { ...potWacky.parameters, maxResistance: 1000000, value: '1M', position: 0.5 };
      const r6 = createComponentFromDefinition(getDefinition('resistor'), { x: 340, y: 320 });
      r6.parameters = { ...r6.parameters, resistance: 4700, value: '4.7k' };
      const c4 = createComponentFromDefinition(getDefinition('capacitor'), { x: 340, y: 500 });
      c4.parameters = { ...c4.parameters, capacitance: 22e-9, value: '22nF' };

      // Weird oscillator (U1-A, pins 0=1A / 6=1Y)
      const potWeird = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 420 });
      potWeird.parameters = { ...potWeird.parameters, maxResistance: 1000000, value: '1M', position: 0.5 };
      const r7 = createComponentFromDefinition(getDefinition('resistor'), { x: 340, y: 420 });
      r7.parameters = { ...r7.parameters, resistance: 4700, value: '4.7k' };
      const c5 = createComponentFromDefinition(getDefinition('capacitor'), { x: 200, y: 560 });
      c5.parameters = { ...c5.parameters, capacitance: 22e-9, value: '22nF' };

      // Zany oscillator (U1-C, pins 2=3A / 8=3Y)
      const potZany = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 620 });
      potZany.parameters = { ...potZany.parameters, maxResistance: 1000000, value: '1M', position: 0.7 };
      const r15 = createComponentFromDefinition(getDefinition('resistor'), { x: 340, y: 620 });
      r15.parameters = { ...r15.parameters, resistance: 4700, value: '4.7k' };
      const c7 = createComponentFromDefinition(getDefinition('capacitor'), { x: 200, y: 740 });
      c7.parameters = { ...c7.parameters, capacitance: 1e-6, value: '1µF' };

      // Op-amp circuit
      const r10 = createComponentFromDefinition(getDefinition('resistor'), { x: 680, y: 340 });
      r10.parameters = { ...r10.parameters, resistance: 1000, value: '1k' };
      const r11 = createComponentFromDefinition(getDefinition('resistor'), { x: 820, y: 280 });
      r11.parameters = { ...r11.parameters, resistance: 750000, value: '750k' };
      const r16 = createComponentFromDefinition(getDefinition('resistor'), { x: 720, y: 480 });
      r16.parameters = { ...r16.parameters, resistance: 100000, value: '100k' };
      const r17 = createComponentFromDefinition(getDefinition('resistor'), { x: 720, y: 560 });
      r17.parameters = { ...r17.parameters, resistance: 100000, value: '100k' };
      const c6 = createComponentFromDefinition(getDefinition('capacitor'), { x: 940, y: 400 });
      c6.parameters = { ...c6.parameters, capacitance: 1e-6, value: '1µF' };
      const c9 = createComponentFromDefinition(getDefinition('capacitor'), { x: 600, y: 620 });
      c9.parameters = { ...c9.parameters, capacitance: 100e-9, value: '100nF' };

      // Load resistor on audio output (discharge path for coupling cap)
      const rLoad = createComponentFromDefinition(getDefinition('resistor'), { x: 1020, y: 520 });
      rLoad.parameters = { ...rLoad.parameters, resistance: 10000, value: '10k' };

      const components = [
        power, ground, ic, opamp, q1, d1, output,
        potWacky, r6, c4,
        potWeird, r7, c5,
        potZany, r15, c7,
        r10, r11, r16, r17, c6, c9, rLoad,
      ];

      const connections = [
        // --- Power ---
        connect(power, 0, ic, 12),       // +9V to CD40106 VDD
        connect(power, 0, opamp, 6),     // +9V to LM741 V+
        connect(power, 1, ground, 0),    // Battery GND
        connect(ground, 0, ic, 13),      // GND to CD40106 VSS
        connect(ground, 0, opamp, 3),    // GND to LM741 V-

        // --- Wacky Oscillator (U1-B: pin1=2A, pin7=2Y) ---
        connect(potWacky, 0, ic, 1),     // Pot pin 1 to 2A input
        connect(potWacky, 2, ic, 7),     // Pot pin 3 to 2Y output (feedback)
        connect(r6, 0, ic, 1),           // R6 to 2A input
        connect(r6, 1, d1, 0),           // R6 to diode D1 anode (cross-mod path)
        connect(c4, 0, ic, 1),           // C4 to 2A input
        connect(c4, 1, ground, 0),       // C4 to GND

        // --- Weird Oscillator (U1-A: pin0=1A, pin6=1Y) ---
        connect(potWeird, 0, ic, 0),     // Pot pin 1 to 1A input
        connect(potWeird, 2, ic, 6),     // Pot pin 3 to 1Y output (feedback)
        connect(r7, 0, ic, 0),           // R7 to 1A input
        connect(r7, 1, q1, 1),           // R7 to Q1 collector (cross-mod)
        connect(c5, 0, ic, 0),           // C5 to 1A input
        connect(c5, 1, ground, 0),       // C5 to GND

        // --- Zany Oscillator (U1-C: pin2=3A, pin8=3Y) ---
        connect(potZany, 0, ic, 2),      // Pot pin 1 to 3A input
        connect(potZany, 2, ic, 8),      // Pot pin 3 to 3Y output (feedback)
        connect(r15, 0, ic, 2),          // R15 to 3A input
        connect(r15, 1, q1, 0),          // R15 to Q1 base (cross-mod drive)
        connect(c7, 0, ic, 2),           // C7 to 3A input
        connect(c7, 1, ground, 0),       // C7 to GND

        // --- Cross-modulation ---
        connect(d1, 1, q1, 1),           // D1 cathode to Q1 collector
        connect(q1, 2, ground, 0),       // Q1 emitter to GND

        // --- Op-amp mixer (LM741) ---
        connect(ic, 6, r10, 0),          // 1Y output to R10
        connect(r10, 1, opamp, 1),       // R10 to LM741 IN-
        connect(r11, 0, opamp, 1),       // R11 feedback from IN-
        connect(r11, 1, opamp, 5),       // R11 to LM741 OUT

        // Bias voltage divider for non-inverting input
        connect(power, 0, r16, 0),       // +9V to R16
        connect(r16, 1, opamp, 2),       // R16 to LM741 IN+
        connect(r17, 0, opamp, 2),       // R17 from IN+
        connect(r17, 1, ground, 0),      // R17 to GND

        // --- Output ---
        connect(opamp, 5, c6, 0),        // LM741 OUT to coupling cap
        connect(c6, 1, output, 0),       // Coupling cap to audio output

        // --- Bypass cap ---
        connect(power, 0, c9, 0),
        connect(c9, 1, ground, 0),

        // --- Load resistor (discharge path for coupling cap) ---
        connect(output, 0, rLoad, 0),
        connect(rLoad, 1, ground, 0),
      ];

      return { components, connections };
    },
  },
];
