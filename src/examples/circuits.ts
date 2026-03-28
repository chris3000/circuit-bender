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
      resistor.parameters = { ...resistor.parameters, resistance: 19000, value: '19k' };
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
    name: 'Pitch Bender',
    description: 'Pot-controlled oscillator frequency',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 500 });
      const pot = createComponentFromDefinition(getDefinition('potentiometer'), { x: 300, y: 200 });
      const capacitor = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 350 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 650, y: 280 });

      const components = [power, ground, pot, capacitor, ic, output];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        // Pot pin 1 to IC input
        connect(pot, 0, ic, 0),
        // Pot pin 2 to IC output (feedback)
        connect(pot, 1, ic, 6),
        // Pot wiper to power (provides variable resistance)
        connect(pot, 2, power, 0),
        // Capacitor to IC input and ground
        connect(capacitor, 0, ic, 0),
        connect(capacitor, 1, ground, 0),
        // IC output to audio
        connect(ic, 6, output, 0),
      ];

      return { components, connections };
    },
  },
  {
    name: 'Dual Tone',
    description: 'Two oscillators mixed together',
    build: () => {
      const power = createComponentFromDefinition(getDefinition('power'), { x: 200, y: 80 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 200, y: 550 });
      // Oscillator 1
      const r1 = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 180 });
      r1.parameters = { ...r1.parameters, resistance: 10000, value: '10k' };
      const c1 = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 320 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 500, y: 280 });
      // Oscillator 2 (using gates 2A/2Y on same IC) — different R for a different pitch
      const r2 = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 420 });
      r2.parameters = { ...r2.parameters, resistance: 15000, value: '15k' };
      const c2 = createComponentFromDefinition(getDefinition('capacitor'), { x: 350, y: 500 });
      // Mix resistors
      const rMix1 = createComponentFromDefinition(getDefinition('resistor'), { x: 650, y: 220 });
      const rMix2 = createComponentFromDefinition(getDefinition('resistor'), { x: 650, y: 340 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 800, y: 280 });

      const components = [power, ground, r1, c1, ic, r2, c2, rMix1, rMix2, output];
      const connections = [
        connect(power, 0, ic, 12),
        connect(ground, 0, ic, 13),
        connect(power, 1, ground, 0),
        // Osc 1: R1 + C1 on gates 1A/1Y
        connect(r1, 0, ic, 0),
        connect(r1, 1, ic, 6),
        connect(c1, 0, ic, 0),
        connect(c1, 1, ground, 0),
        // Osc 2: R2 + C2 on gates 2A/2Y
        connect(r2, 0, ic, 1),
        connect(r2, 1, ic, 7),
        connect(c2, 0, ic, 1),
        connect(c2, 1, ground, 0),
        // Mix: each output through a resistor to audio out
        connect(ic, 6, rMix1, 0),
        connect(ic, 7, rMix2, 0),
        connect(rMix1, 1, output, 0),
        connect(rMix2, 1, output, 0),
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
];
