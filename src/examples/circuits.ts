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
      // MFOS WSG Voice A by Ray Wilson. Three CD40106 oscillators with
      // resistive cross-coupling, mixed through an LM741 inverting amp.

      const power = createComponentFromDefinition(getDefinition('power'), { x: 100, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 100, y: 700 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 400 });
      const opamp = createComponentFromDefinition(getDefinition('lm741'), { x: 820, y: 400 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 1020, y: 400 });

      // Wacky oscillator (U1-B: 2A/2Y)
      const potWacky = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 200 });
      potWacky.parameters = { ...potWacky.parameters, maxResistance: 1000000, value: '1M', position: 0.3 };
      const rWacky = createComponentFromDefinition(getDefinition('resistor'), { x: 340, y: 200 });
      rWacky.parameters = { ...rWacky.parameters, resistance: 4700, value: '4.7k' };
      const cWacky = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 300 });
      cWacky.parameters = { ...cWacky.parameters, capacitance: 22e-9, value: '22nF' };

      // Weird oscillator (U1-A: 1A/1Y)
      const potWeird = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 420 });
      potWeird.parameters = { ...potWeird.parameters, maxResistance: 1000000, value: '1M', position: 0.5 };
      const rWeird = createComponentFromDefinition(getDefinition('resistor'), { x: 340, y: 420 });
      rWeird.parameters = { ...rWeird.parameters, resistance: 4700, value: '4.7k' };
      const cWeird = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 520 });
      cWeird.parameters = { ...cWeird.parameters, capacitance: 10e-9, value: '10nF' };

      // Zany oscillator (U1-C: 3A/3Y) — slow LFO
      const potZany = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 620 });
      potZany.parameters = { ...potZany.parameters, maxResistance: 1000000, value: '1M', position: 0.7 };
      const rZany = createComponentFromDefinition(getDefinition('resistor'), { x: 340, y: 620 });
      rZany.parameters = { ...rZany.parameters, resistance: 4700, value: '4.7k' };
      const cZany = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 720 });
      cZany.parameters = { ...cZany.parameters, capacitance: 1e-6, value: '1µF' };

      // Cross-coupling resistors
      const rCross1 = createComponentFromDefinition(getDefinition('resistor'), { x: 660, y: 200 });
      rCross1.parameters = { ...rCross1.parameters, resistance: 100000, value: '100k' };
      const rCross2 = createComponentFromDefinition(getDefinition('resistor'), { x: 660, y: 420 });
      rCross2.parameters = { ...rCross2.parameters, resistance: 100000, value: '100k' };
      const rCross3 = createComponentFromDefinition(getDefinition('resistor'), { x: 660, y: 620 });
      rCross3.parameters = { ...rCross3.parameters, resistance: 100000, value: '100k' };

      // Bypass cap
      const c9 = createComponentFromDefinition(getDefinition('capacitor'), { x: 600, y: 700 });
      c9.parameters = { ...c9.parameters, capacitance: 100e-9, value: '100nF' };

      const components = [
        power, ground, ic, output,
        potWacky, rWacky, cWacky,
        potWeird, rWeird, cWeird,
        potZany, rZany, cZany,
        rCross1, rCross2, rCross3,
        c9,
      ];

      const connections = [
        // Power
        connect(power, 0, ic, 12),
        connect(power, 1, ground, 0),
        connect(ground, 0, ic, 13),

        // Wacky Oscillator (U1-B: pin1=2A, pin7=2Y)
        connect(potWacky, 0, ic, 1),
        connect(potWacky, 2, ic, 7),
        connect(rWacky, 0, ic, 1),
        connect(rWacky, 1, ic, 7),
        connect(cWacky, 0, ic, 1),
        connect(cWacky, 1, ground, 0),

        // Weird Oscillator (U1-A: pin0=1A, pin6=1Y)
        connect(potWeird, 0, ic, 0),
        connect(potWeird, 2, ic, 6),
        connect(rWeird, 0, ic, 0),
        connect(rWeird, 1, ic, 6),
        connect(cWeird, 0, ic, 0),
        connect(cWeird, 1, ground, 0),

        // Zany Oscillator (U1-C: pin2=3A, pin8=3Y)
        connect(potZany, 0, ic, 2),
        connect(potZany, 2, ic, 8),
        connect(rZany, 0, ic, 2),
        connect(rZany, 1, ic, 8),
        connect(cZany, 0, ic, 2),
        connect(cZany, 1, ground, 0),

        // Cross-coupling ring
        connect(ic, 8, rCross1, 0),      // Zany → Wacky
        connect(rCross1, 1, ic, 1),
        connect(ic, 7, rCross2, 0),      // Wacky → Weird
        connect(rCross2, 1, ic, 0),
        connect(ic, 6, rCross3, 0),      // Weird → Zany
        connect(rCross3, 1, ic, 2),

        // Output: direct from Weird oscillator (1Y)
        connect(ic, 6, output, 0),

        // Bypass cap
        connect(power, 0, c9, 0),
        connect(c9, 1, ground, 0),
      ];

      return { components, connections };
    },
  },
];
