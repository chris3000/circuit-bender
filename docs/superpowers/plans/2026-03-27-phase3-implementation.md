# Phase 3: Simulation, Audio & Breadboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time simulation engine, audio output to PC speakers, breadboard view, oscilloscope panel, undo/redo, interactive controls, and 4 new components (2N3904, 1N914, Audio Output Jack, LED)

**Architecture:** Hybrid-activation simulation engine (idle until output component connected, then 48kHz continuous), AudioWorklet via PostMessage, Canvas 2D breadboard view with auto-placement, immutable Circuit snapshot undo stack, oscilloscope with rolling sample buffers

**Tech Stack:** React 18, TypeScript 5, Web Audio API, AudioWorklet, Canvas 2D, existing dnd-kit/Circuit model

---

## File Structure Overview

```
src/
├── simulation/
│   ├── SimulationEngine.ts          # Core simulation loop + activation logic
│   └── NetAnalyzer.ts               # Union-find net grouping
├── audio/
│   ├── AudioEngine.ts               # AudioContext lifecycle + master controls
│   ├── AudioBridge.ts               # Voltage → audio sample conversion + buffering
│   └── audio-worklet-processor.ts   # AudioWorkletProcessor (runs in audio thread)
├── components/definitions/
│   ├── Transistor2N3904.tsx          # NPN transistor
│   ├── Diode1N914.tsx               # Signal diode
│   ├── AudioOutputJack.tsx          # Audio output → speakers
│   └── LED.tsx                      # Visual output
├── views/
│   ├── BreadboardView/
│   │   ├── BreadboardView.tsx       # Canvas-based breadboard rendering
│   │   ├── BreadboardView.module.css
│   │   ├── BreadboardRenderer.ts    # Canvas drawing logic
│   │   └── autoPlace.ts             # Auto-placement algorithm
│   ├── Oscilloscope/
│   │   ├── OscilloscopePanel.tsx    # Bottom panel container
│   │   ├── OscilloscopePanel.module.css
│   │   ├── WaveformCanvas.tsx       # Canvas waveform rendering
│   │   └── ProbeManager.ts         # Probe state + rolling buffers
│   └── SchematicView/
│       └── ParameterEditor.tsx      # Inline popover for value editing
├── context/
│   └── CircuitContext.tsx           # (modify) Add undo/redo
├── utils/
│   ├── parameterParser.ts          # "10k" → 10000 parsing
│   └── componentFactory.ts         # (modify) Auto-place breadboard position
├── main.tsx                         # (modify) Register new components
└── App.tsx                          # (modify) Add breadboard view + oscilloscope
```

```
tests/
├── simulation/
│   ├── SimulationEngine.test.ts
│   └── NetAnalyzer.test.ts
├── audio/
│   ├── AudioBridge.test.ts
│   └── AudioEngine.test.ts
├── components/definitions/
│   ├── Transistor2N3904.test.ts
│   ├── Diode1N914.test.ts
│   ├── AudioOutputJack.test.ts
│   └── LED.test.ts
├── views/
│   ├── BreadboardView.test.tsx
│   └── Oscilloscope.test.tsx
├── context/
│   └── UndoRedo.test.ts
└── utils/
    └── parameterParser.test.ts
```

---

## Task 1: Net Analyzer

**Files:**
- Create: `src/simulation/NetAnalyzer.ts`
- Test: `tests/simulation/NetAnalyzer.test.ts`

- [ ] **Step 1: Write NetAnalyzer test**

Create: `tests/simulation/NetAnalyzer.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { NetAnalyzer } from '@/simulation/NetAnalyzer';
import type { Connection, ComponentId, PinId, ConnectionId, NetId } from '@/types/circuit';

const makeConnection = (
  fromComp: string,
  fromPin: string,
  toComp: string,
  toPin: string,
  id: string = `conn_${fromComp}_${toComp}`
): Connection => ({
  id: id as ConnectionId,
  from: { componentId: fromComp as ComponentId, pinId: fromPin as PinId },
  to: { componentId: toComp as ComponentId, pinId: toPin as PinId },
  net: `net_${id}` as NetId,
});

describe('NetAnalyzer', () => {
  it('should return empty nets for no connections', () => {
    const analyzer = new NetAnalyzer([]);
    expect(analyzer.getNets()).toEqual([]);
  });

  it('should group directly connected pins into a net', () => {
    const connections = [
      makeConnection('comp1', 'pin_0', 'comp2', 'pin_1'),
    ];
    const analyzer = new NetAnalyzer(connections);
    const nets = analyzer.getNets();

    expect(nets).toHaveLength(1);
    expect(nets[0].pins).toHaveLength(2);
    expect(nets[0].pins).toContainEqual({ componentId: 'comp1', pinId: 'pin_0' });
    expect(nets[0].pins).toContainEqual({ componentId: 'comp2', pinId: 'pin_1' });
  });

  it('should merge transitively connected pins into one net', () => {
    const connections = [
      makeConnection('comp1', 'pin_0', 'comp2', 'pin_0', 'c1'),
      makeConnection('comp2', 'pin_0', 'comp3', 'pin_0', 'c2'),
    ];
    const analyzer = new NetAnalyzer(connections);
    const nets = analyzer.getNets();

    expect(nets).toHaveLength(1);
    expect(nets[0].pins).toHaveLength(3);
  });

  it('should keep separate nets for unconnected groups', () => {
    const connections = [
      makeConnection('comp1', 'pin_0', 'comp2', 'pin_0', 'c1'),
      makeConnection('comp3', 'pin_0', 'comp4', 'pin_0', 'c2'),
    ];
    const analyzer = new NetAnalyzer(connections);
    const nets = analyzer.getNets();

    expect(nets).toHaveLength(2);
  });

  it('should find the net for a specific pin', () => {
    const connections = [
      makeConnection('comp1', 'pin_0', 'comp2', 'pin_1'),
    ];
    const analyzer = new NetAnalyzer(connections);
    const net = analyzer.getNetForPin('comp1' as ComponentId, 'pin_0' as PinId);

    expect(net).toBeDefined();
    expect(net!.pins).toHaveLength(2);
  });

  it('should return undefined for unconnected pin', () => {
    const analyzer = new NetAnalyzer([]);
    const net = analyzer.getNetForPin('comp1' as ComponentId, 'pin_0' as PinId);

    expect(net).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/simulation/NetAnalyzer.test.ts`
Expected: FAIL - Cannot find module '@/simulation/NetAnalyzer'

- [ ] **Step 3: Implement NetAnalyzer**

Create: `src/simulation/NetAnalyzer.ts`

```typescript
import type { Connection, ComponentId, PinId } from '@/types/circuit';

export interface NetPin {
  componentId: string;
  pinId: string;
}

export interface Net {
  id: number;
  pins: NetPin[];
}

export class NetAnalyzer {
  private parent: Map<string, string>;
  private rank: Map<string, number>;
  private nets: Net[] | null = null;

  constructor(private connections: Connection[]) {
    this.parent = new Map();
    this.rank = new Map();
    this.build();
  }

  private pinKey(componentId: string, pinId: string): string {
    return `${componentId}::${pinId}`;
  }

  private find(key: string): string {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
    let root = key;
    while (this.parent.get(root) !== root) {
      // Path compression
      this.parent.set(root, this.parent.get(this.parent.get(root)!)!);
      root = this.parent.get(root)!;
    }
    return root;
  }

  private union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  private build(): void {
    for (const conn of this.connections) {
      const fromKey = this.pinKey(conn.from.componentId, conn.from.pinId);
      const toKey = this.pinKey(conn.to.componentId, conn.to.pinId);
      this.union(fromKey, toKey);
    }
  }

  getNets(): Net[] {
    if (this.nets !== null) return this.nets;

    const groups = new Map<string, NetPin[]>();

    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      const [componentId, pinId] = key.split('::');
      groups.get(root)!.push({ componentId, pinId });
    }

    this.nets = Array.from(groups.values()).map((pins, index) => ({
      id: index,
      pins,
    }));

    return this.nets;
  }

  getNetForPin(componentId: ComponentId, pinId: PinId): Net | undefined {
    const key = this.pinKey(componentId, pinId);
    if (!this.parent.has(key)) return undefined;

    const root = this.find(key);
    const nets = this.getNets();
    return nets.find(net =>
      net.pins.some(p => this.find(this.pinKey(p.componentId, p.pinId)) === root)
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/simulation/NetAnalyzer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/simulation/NetAnalyzer.ts tests/simulation/NetAnalyzer.test.ts
git commit -m "feat: add NetAnalyzer with union-find net grouping"
```

---

## Task 2: Simulation Engine

**Files:**
- Create: `src/simulation/SimulationEngine.ts`
- Test: `tests/simulation/SimulationEngine.test.ts`

- [ ] **Step 1: Write SimulationEngine test**

Create: `tests/simulation/SimulationEngine.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimulationEngine } from '@/simulation/SimulationEngine';
import { Circuit } from '@/models/Circuit';
import type { Component, ComponentId, PinId, Connection, ConnectionId, NetId } from '@/types/circuit';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { powerSupplyDefinition } from '@/components/definitions/PowerSupply';
import { groundDefinition } from '@/components/definitions/Ground';

// Minimal output component definition for testing
const testOutputDefinition = {
  type: 'test-output',
  metadata: { name: 'Test Output', category: 'power' as const, description: 'Test output' },
  pins: [{ id: 'pin_0' as PinId, label: 'IN', type: 'input' as const, position: { x: 0, y: 0 } }],
  defaultParameters: {},
  schematic: { symbol: { width: 20, height: 20, render: () => null }, dimensions: { width: 20, height: 20 } },
  breadboard: { renderer: () => {}, dimensions: { rows: 1, columns: 1 } },
  simulate: (inputs: any) => inputs,
  isOutput: true,
};

const makeComponent = (id: string, type: string): Component => ({
  id: id as ComponentId,
  type,
  position: { schematic: { x: 0, y: 0 }, breadboard: { row: 0, column: 0 } },
  rotation: 0,
  parameters: type === 'resistor' ? { resistance: 1000, value: '1k' } :
              type === 'power' ? { voltage: 9, value: '+9V' } : {},
  pins: ComponentRegistry.getInstance().get(type)?.pins.map(p => ({ ...p })) || [],
  state: { voltages: new Map(), currents: new Map() },
});

const makeConnection = (
  fromComp: string, fromPin: string,
  toComp: string, toPin: string,
  id: string = `conn_${fromComp}_${toComp}`
): Connection => ({
  id: id as ConnectionId,
  from: { componentId: fromComp as ComponentId, pinId: fromPin as PinId },
  to: { componentId: toComp as ComponentId, pinId: toPin as PinId },
  net: `net_${id}` as NetId,
});

describe('SimulationEngine', () => {
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = ComponentRegistry.getInstance();
    registry.clear();
    registry.register(resistorDefinition);
    registry.register(powerSupplyDefinition);
    registry.register(groundDefinition);
    registry.register(testOutputDefinition as any);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should start inactive', () => {
    const engine = new SimulationEngine();
    expect(engine.isActive()).toBe(false);
  });

  it('should remain inactive when circuit has no output components', () => {
    let circuit = new Circuit('test');
    circuit = circuit.addComponent(makeComponent('r1', 'resistor'));
    circuit = circuit.addComponent(makeComponent('pwr', 'power'));

    const engine = new SimulationEngine();
    engine.updateCircuit(circuit);

    expect(engine.isActive()).toBe(false);
  });

  it('should activate when output component is connected to a net', () => {
    let circuit = new Circuit('test');
    const output = makeComponent('out1', 'test-output');
    const pwr = makeComponent('pwr', 'power');
    circuit = circuit.addComponent(output);
    circuit = circuit.addComponent(pwr);
    circuit = circuit.addConnection(
      makeConnection('pwr', 'pin_0', 'out1', 'pin_0')
    );

    const engine = new SimulationEngine();
    engine.updateCircuit(circuit);

    expect(engine.isActive()).toBe(true);
  });

  it('should deactivate when output components are removed', () => {
    let circuit = new Circuit('test');
    const output = makeComponent('out1', 'test-output');
    const pwr = makeComponent('pwr', 'power');
    circuit = circuit.addComponent(output);
    circuit = circuit.addComponent(pwr);
    circuit = circuit.addConnection(
      makeConnection('pwr', 'pin_0', 'out1', 'pin_0')
    );

    const engine = new SimulationEngine();
    engine.updateCircuit(circuit);
    expect(engine.isActive()).toBe(true);

    circuit = circuit.removeComponent('out1' as ComponentId);
    engine.updateCircuit(circuit);
    expect(engine.isActive()).toBe(false);
  });

  it('should compute net voltages from power supply', () => {
    let circuit = new Circuit('test');
    const pwr = makeComponent('pwr', 'power');
    const output = makeComponent('out1', 'test-output');
    circuit = circuit.addComponent(pwr);
    circuit = circuit.addComponent(output);
    circuit = circuit.addConnection(
      makeConnection('pwr', 'pin_0', 'out1', 'pin_0')
    );

    const engine = new SimulationEngine();
    engine.updateCircuit(circuit);
    engine.step();

    const voltage = engine.getNetVoltage('pwr' as ComponentId, 'pin_0' as PinId);
    expect(voltage).toBe(9);
  });

  it('should expose probeSample for oscilloscope', () => {
    let circuit = new Circuit('test');
    const pwr = makeComponent('pwr', 'power');
    const output = makeComponent('out1', 'test-output');
    circuit = circuit.addComponent(pwr);
    circuit = circuit.addComponent(output);
    circuit = circuit.addConnection(
      makeConnection('pwr', 'pin_0', 'out1', 'pin_0')
    );

    const engine = new SimulationEngine();
    engine.updateCircuit(circuit);
    engine.step();

    const sample = engine.probeSample('pwr' as ComponentId, 'pin_0' as PinId);
    expect(sample).toBe(9);
  });

  it('should return supply voltage from circuit', () => {
    let circuit = new Circuit('test');
    const pwr = makeComponent('pwr', 'power');
    circuit = circuit.addComponent(pwr);

    const engine = new SimulationEngine();
    engine.updateCircuit(circuit);

    expect(engine.getSupplyVoltage()).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/simulation/SimulationEngine.test.ts`
Expected: FAIL - Cannot find module '@/simulation/SimulationEngine'

- [ ] **Step 3: Implement SimulationEngine**

Create: `src/simulation/SimulationEngine.ts`

```typescript
import { NetAnalyzer } from './NetAnalyzer';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component, ComponentId, PinId, PinStates } from '@/types/circuit';
import { Circuit } from '@/models/Circuit';

// Component types that trigger simulation activation
const OUTPUT_COMPONENT_TYPES = new Set(['audio-output', 'led', 'test-output']);

export class SimulationEngine {
  private circuit: Circuit | null = null;
  private netAnalyzer: NetAnalyzer | null = null;
  private netVoltages: Map<string, number> = new Map();
  private active = false;
  private registry = ComponentRegistry.getInstance();
  private animationFrameId: number | null = null;
  private sampleCallback: ((samples: Float32Array) => void) | null = null;
  private readonly sampleRate = 48000;
  private readonly samplesPerBatch = 128;

  isActive(): boolean {
    return this.active;
  }

  getSupplyVoltage(): number {
    if (!this.circuit) return 9;
    const components = this.circuit.getComponents();
    const powerSupply = components.find(c => c.type === 'power');
    return (powerSupply?.parameters.voltage as number) || 9;
  }

  updateCircuit(circuit: Circuit): void {
    this.circuit = circuit;
    this.netAnalyzer = new NetAnalyzer(circuit.getConnections());
    this.checkActivation();
  }

  setSampleCallback(callback: ((samples: Float32Array) => void) | null): void {
    this.sampleCallback = callback;
  }

  private checkActivation(): void {
    if (!this.circuit) {
      this.deactivate();
      return;
    }

    const components = this.circuit.getComponents();
    const connections = this.circuit.getConnections();

    const hasConnectedOutput = components.some(comp => {
      if (!OUTPUT_COMPONENT_TYPES.has(comp.type)) return false;
      // Check if any pin is connected
      return connections.some(
        conn =>
          conn.from.componentId === comp.id ||
          conn.to.componentId === comp.id
      );
    });

    if (hasConnectedOutput && !this.active) {
      this.activate();
    } else if (!hasConnectedOutput && this.active) {
      this.deactivate();
    }
  }

  private activate(): void {
    this.active = true;
  }

  private deactivate(): void {
    this.active = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  start(): void {
    if (!this.active) return;
    this.runLoop();
  }

  stop(): void {
    this.deactivate();
  }

  private runLoop = (): void => {
    if (!this.active) return;

    const samples = new Float32Array(this.samplesPerBatch);

    for (let i = 0; i < this.samplesPerBatch; i++) {
      this.step();

      // Get audio output sample if audio output jack exists
      const audioSample = this.getAudioOutputSample();
      samples[i] = audioSample;
    }

    if (this.sampleCallback) {
      this.sampleCallback(samples);
    }

    this.animationFrameId = requestAnimationFrame(this.runLoop);
  };

  private getAudioOutputSample(): number {
    if (!this.circuit) return 0;

    const components = this.circuit.getComponents();
    const audioOutput = components.find(c => c.type === 'audio-output');
    if (!audioOutput || audioOutput.pins.length === 0) return 0;

    const voltage = this.getNetVoltage(audioOutput.id, audioOutput.pins[0].id);
    const supply = this.getSupplyVoltage();

    // Convert voltage to audio range: 0V → -1, supply/2 → 0, supply → +1
    return (voltage / supply) * 2 - 1;
  }

  step(): void {
    if (!this.circuit || !this.netAnalyzer) return;

    const components = this.circuit.getComponents();
    const nets = this.netAnalyzer.getNets();

    // Clear voltages
    this.netVoltages.clear();

    // Phase 1: Resolve power sources and ground
    for (const comp of components) {
      const def = this.registry.get(comp.type);
      if (!def) continue;

      if (comp.type === 'power') {
        const voltage = (comp.parameters.voltage as number) || 9;
        for (const pin of comp.pins) {
          this.setNetVoltage(comp.id, pin.id, voltage);
        }
      } else if (comp.type === 'ground') {
        for (const pin of comp.pins) {
          this.setNetVoltage(comp.id, pin.id, 0);
        }
      }
    }

    // Phase 2: Propagate known voltages across nets
    this.propagateNetVoltages();

    // Phase 3: Simulate each component
    for (const comp of components) {
      if (comp.type === 'power' || comp.type === 'ground') continue;

      const def = this.registry.get(comp.type);
      if (!def) continue;

      // Build inputs from net voltages
      const inputs: PinStates = {};
      for (const pin of comp.pins) {
        const voltage = this.getNetVoltage(comp.id, pin.id);
        inputs[pin.id] = { voltage, current: 0 };
      }

      // Run component simulation
      const outputs = def.simulate(inputs, comp.parameters);

      // Write outputs back to nets
      for (const [pinId, state] of Object.entries(outputs)) {
        if (state.voltage !== undefined) {
          this.setNetVoltage(comp.id, pinId as PinId, state.voltage);
        }
      }
    }

    // Phase 4: Final propagation
    this.propagateNetVoltages();
  }

  private setNetVoltage(componentId: ComponentId, pinId: PinId, voltage: number): void {
    const key = `${componentId}::${pinId}`;
    this.netVoltages.set(key, voltage);
  }

  private propagateNetVoltages(): void {
    if (!this.netAnalyzer) return;

    const nets = this.netAnalyzer.getNets();
    for (const net of nets) {
      // Find any pin in this net that has a known voltage
      let knownVoltage: number | undefined;
      for (const pin of net.pins) {
        const key = `${pin.componentId}::${pin.pinId}`;
        const v = this.netVoltages.get(key);
        if (v !== undefined) {
          knownVoltage = v;
          break;
        }
      }

      // Propagate to all pins in the net
      if (knownVoltage !== undefined) {
        for (const pin of net.pins) {
          const key = `${pin.componentId}::${pin.pinId}`;
          this.netVoltages.set(key, knownVoltage);
        }
      }
    }
  }

  getNetVoltage(componentId: ComponentId, pinId: PinId): number {
    const key = `${componentId}::${pinId}`;
    return this.netVoltages.get(key) ?? 0;
  }

  probeSample(componentId: ComponentId, pinId: PinId): number {
    return this.getNetVoltage(componentId, pinId);
  }

  getComponentState(componentId: ComponentId): Map<string, number> {
    const voltages = new Map<string, number>();
    if (!this.circuit) return voltages;

    const comp = this.circuit.getComponent(componentId);
    if (!comp) return voltages;

    for (const pin of comp.pins) {
      voltages.set(pin.id, this.getNetVoltage(componentId, pin.id));
    }
    return voltages;
  }

  static registerOutputType(type: string): void {
    OUTPUT_COMPONENT_TYPES.add(type);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/simulation/SimulationEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/simulation/SimulationEngine.ts tests/simulation/SimulationEngine.test.ts
git commit -m "feat: add SimulationEngine with hybrid activation and voltage propagation"
```

---

## Task 3: Audio Engine

**Files:**
- Create: `src/audio/AudioBridge.ts`
- Create: `src/audio/AudioEngine.ts`
- Create: `public/audio-worklet-processor.js`
- Test: `tests/audio/AudioBridge.test.ts`
- Test: `tests/audio/AudioEngine.test.ts`

- [ ] **Step 1: Write AudioBridge test**

Create: `tests/audio/AudioBridge.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AudioBridge } from '@/audio/AudioBridge';

describe('AudioBridge', () => {
  it('should convert voltage to audio sample with default supply', () => {
    const bridge = new AudioBridge();

    // 0V → -1.0
    expect(bridge.voltageToSample(0, 9)).toBeCloseTo(-1.0);
    // 4.5V → 0.0
    expect(bridge.voltageToSample(4.5, 9)).toBeCloseTo(0.0);
    // 9V → 1.0
    expect(bridge.voltageToSample(9, 9)).toBeCloseTo(1.0);
  });

  it('should handle configurable supply voltage', () => {
    const bridge = new AudioBridge();

    // 5V supply: 2.5V → 0.0
    expect(bridge.voltageToSample(2.5, 5)).toBeCloseTo(0.0);
    // 5V supply: 5V → 1.0
    expect(bridge.voltageToSample(5, 5)).toBeCloseTo(1.0);
  });

  it('should clamp audio samples to [-1, 1]', () => {
    const bridge = new AudioBridge();

    expect(bridge.voltageToSample(20, 9)).toBe(1.0);
    expect(bridge.voltageToSample(-5, 9)).toBe(-1.0);
  });

  it('should buffer samples and flush at batch size', () => {
    const bridge = new AudioBridge();
    const onFlush = vi.fn();
    bridge.onBufferReady(onFlush);

    // Add 127 samples — should not flush yet
    for (let i = 0; i < 127; i++) {
      bridge.pushSample(0.5);
    }
    expect(onFlush).not.toHaveBeenCalled();

    // Add one more — should flush 128 samples
    bridge.pushSample(0.5);
    expect(onFlush).toHaveBeenCalledTimes(1);
    const buffer = onFlush.mock.calls[0][0];
    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(128);
  });

  it('should apply master volume', () => {
    const bridge = new AudioBridge();
    bridge.setVolume(0.5);

    // 9V on 9V supply = sample 1.0, but volume 0.5 → 0.5
    expect(bridge.voltageToSample(9, 9) * bridge.getVolume()).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/audio/AudioBridge.test.ts`
Expected: FAIL - Cannot find module '@/audio/AudioBridge'

- [ ] **Step 3: Implement AudioBridge**

Create: `src/audio/AudioBridge.ts`

```typescript
export class AudioBridge {
  private buffer: Float32Array;
  private bufferIndex = 0;
  private flushCallback: ((samples: Float32Array) => void) | null = null;
  private volume = 1.0;
  private muted = false;

  static readonly BATCH_SIZE = 128;

  constructor() {
    this.buffer = new Float32Array(AudioBridge.BATCH_SIZE);
  }

  voltageToSample(voltage: number, supplyVoltage: number): number {
    if (supplyVoltage === 0) return 0;
    const sample = (voltage / supplyVoltage) * 2 - 1;
    return Math.max(-1, Math.min(1, sample));
  }

  pushSample(sample: number): void {
    const finalSample = this.muted ? 0 : sample * this.volume;
    this.buffer[this.bufferIndex] = finalSample;
    this.bufferIndex++;

    if (this.bufferIndex >= AudioBridge.BATCH_SIZE) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.flushCallback) {
      // Send a copy so the buffer can be reused
      this.flushCallback(new Float32Array(this.buffer));
    }
    this.bufferIndex = 0;
  }

  onBufferReady(callback: (samples: Float32Array) => void): void {
    this.flushCallback = callback;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/audio/AudioBridge.test.ts`
Expected: PASS

- [ ] **Step 5: Write AudioEngine test**

Create: `tests/audio/AudioEngine.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioEngine } from '@/audio/AudioEngine';

// Mock AudioContext and AudioWorklet
const mockAudioContext = {
  state: 'suspended',
  resume: vi.fn().mockResolvedValue(undefined),
  suspend: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  audioWorklet: {
    addModule: vi.fn().mockResolvedValue(undefined),
  },
  sampleRate: 48000,
};

const mockWorkletNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  port: {
    postMessage: vi.fn(),
  },
};

vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));
vi.stubGlobal('AudioWorkletNode', vi.fn(() => mockWorkletNode));

describe('AudioEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioContext.state = 'suspended';
  });

  it('should create in suspended state', () => {
    const engine = new AudioEngine();
    expect(engine.getState()).toBe('suspended');
  });

  it('should resume audio context', async () => {
    const engine = new AudioEngine();
    await engine.resume();
    expect(mockAudioContext.resume).toHaveBeenCalled();
  });

  it('should suspend audio context', async () => {
    const engine = new AudioEngine();
    await engine.suspend();
    expect(mockAudioContext.suspend).toHaveBeenCalled();
  });

  it('should send samples to worklet via postMessage', async () => {
    const engine = new AudioEngine();
    await engine.initialize();

    const samples = new Float32Array(128);
    engine.sendSamples(samples);

    expect(mockWorkletNode.port.postMessage).toHaveBeenCalledWith({
      type: 'samples',
      samples,
    });
  });
});
```

- [ ] **Step 6: Implement AudioEngine**

Create: `src/audio/AudioEngine.ts`

```typescript
export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private initialized = false;

  constructor() {
    this.audioContext = new AudioContext();
  }

  getState(): AudioContextState {
    return this.audioContext?.state ?? 'closed';
  }

  getSampleRate(): number {
    return this.audioContext?.sampleRate ?? 48000;
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.audioContext) return;

    await this.audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
    this.workletNode = new AudioWorkletNode(this.audioContext, 'circuit-audio-processor');
    this.workletNode.connect(this.audioContext.destination);
    this.initialized = true;
  }

  async resume(): Promise<void> {
    await this.audioContext?.resume();
  }

  async suspend(): Promise<void> {
    await this.audioContext?.suspend();
  }

  sendSamples(samples: Float32Array): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'samples', samples });
  }

  async close(): Promise<void> {
    this.workletNode?.disconnect();
    await this.audioContext?.close();
    this.audioContext = null;
    this.workletNode = null;
    this.initialized = false;
  }
}
```

- [ ] **Step 7: Create AudioWorkletProcessor**

Create: `public/audio-worklet-processor.js`

```javascript
class CircuitAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleQueue = [];
    this.port.onmessage = (event) => {
      if (event.data.type === 'samples') {
        this.sampleQueue.push(...event.data.samples);
        // Keep queue from growing unbounded
        if (this.sampleQueue.length > 48000) {
          this.sampleQueue = this.sampleQueue.slice(-48000);
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];

    for (let i = 0; i < channel.length; i++) {
      if (this.sampleQueue.length > 0) {
        channel[i] = this.sampleQueue.shift();
      } else {
        // Buffer underrun — output silence
        channel[i] = 0;
      }
    }

    // Copy to all output channels (stereo)
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel);
    }

    return true;
  }
}

registerProcessor('circuit-audio-processor', CircuitAudioProcessor);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- tests/audio/`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/audio/ public/audio-worklet-processor.js tests/audio/
git commit -m "feat: add AudioEngine and AudioBridge with worklet-based playback"
```

---

## Task 4: New Component Definitions (2N3904, 1N914, Audio Output Jack, LED)

**Files:**
- Create: `src/components/definitions/Transistor2N3904.tsx`
- Create: `src/components/definitions/Diode1N914.tsx`
- Create: `src/components/definitions/AudioOutputJack.tsx`
- Create: `src/components/definitions/LED.tsx`
- Test: `tests/components/definitions/Transistor2N3904.test.ts`
- Test: `tests/components/definitions/Diode1N914.test.ts`
- Test: `tests/components/definitions/AudioOutputJack.test.ts`
- Test: `tests/components/definitions/LED.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write 2N3904 transistor test**

Create: `tests/components/definitions/Transistor2N3904.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { transistor2N3904Definition } from '@/components/definitions/Transistor2N3904';

describe('2N3904 Transistor', () => {
  it('has correct metadata', () => {
    expect(transistor2N3904Definition.type).toBe('2n3904');
    expect(transistor2N3904Definition.metadata.name).toBe('2N3904');
    expect(transistor2N3904Definition.metadata.category).toBe('active');
  });

  it('has three pins: Base, Collector, Emitter', () => {
    expect(transistor2N3904Definition.pins).toHaveLength(3);
    expect(transistor2N3904Definition.pins[0].label).toBe('B');
    expect(transistor2N3904Definition.pins[1].label).toBe('C');
    expect(transistor2N3904Definition.pins[2].label).toBe('E');
  });

  it('conducts when base-emitter voltage exceeds 0.7V', () => {
    const inputs = {
      pin_0: { voltage: 1.5, current: 0 }, // Base
      pin_1: { voltage: 9, current: 0 },   // Collector
      pin_2: { voltage: 0, current: 0 },   // Emitter
    };

    const outputs = transistor2N3904Definition.simulate(inputs, { beta: 100 });

    // Vbe = 1.5 - 0 = 1.5V > 0.7V → conducting
    // Collector should be pulled toward emitter voltage
    expect(outputs.pin_1.voltage).toBeLessThan(9);
  });

  it('blocks when base-emitter voltage is below 0.7V', () => {
    const inputs = {
      pin_0: { voltage: 0.3, current: 0 }, // Base
      pin_1: { voltage: 9, current: 0 },   // Collector
      pin_2: { voltage: 0, current: 0 },   // Emitter
    };

    const outputs = transistor2N3904Definition.simulate(inputs, { beta: 100 });

    // Vbe = 0.3V < 0.7V → not conducting
    // Collector stays at its input voltage
    expect(outputs.pin_1.voltage).toBe(9);
  });

  it('schematic symbol renders without errors', () => {
    const { container } = render(
      <svg>{transistor2N3904Definition.schematic.symbol.render({ beta: 100 })}</svg>
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/definitions/Transistor2N3904.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement 2N3904 transistor**

Create: `src/components/definitions/Transistor2N3904.tsx`

```tsx
import type { ComponentDefinition, PinId } from '@/types/circuit';

export const transistor2N3904Definition: ComponentDefinition = {
  type: '2n3904',
  metadata: {
    name: '2N3904',
    category: 'active',
    description: 'NPN transistor — general purpose amplifier/switch',
  },
  pins: [
    { id: 'pin_0' as PinId, label: 'B', type: 'input', position: { x: -25, y: 0 } },
    { id: 'pin_1' as PinId, label: 'C', type: 'bidirectional', position: { x: 0, y: -25 } },
    { id: 'pin_2' as PinId, label: 'E', type: 'bidirectional', position: { x: 0, y: 25 } },
  ],
  defaultParameters: { beta: 100 },
  schematic: {
    symbol: {
      width: 50,
      height: 60,
      render: () => (
        <g>
          {/* Vertical base line */}
          <line x1="-5" y1="-15" x2="-5" y2="15" stroke="currentColor" strokeWidth="2" />
          {/* Base lead */}
          <line x1="-25" y1="0" x2="-5" y2="0" stroke="currentColor" strokeWidth="2" />
          {/* Collector line */}
          <line x1="-5" y1="-8" x2="0" y2="-25" stroke="currentColor" strokeWidth="2" />
          {/* Emitter line with arrow */}
          <line x1="-5" y1="8" x2="0" y2="25" stroke="currentColor" strokeWidth="2" />
          {/* Arrow on emitter */}
          <path d="M -2,18 L 0,25 L -6,20" fill="currentColor" />
          {/* Label */}
          <text x="10" y="0" fontSize="10" fill="currentColor">2N3904</text>
        </g>
      ),
    },
    dimensions: { width: 50, height: 60 },
  },
  breadboard: {
    renderer: (ctx) => {
      // TO-92 package: black semicircle with flat side
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(0, 0, 8, Math.PI, 0);
      ctx.lineTo(8, 5);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fill();
      // Pin markers
      ctx.fillStyle = '#c0c0c0';
      for (const x of [-5, 0, 5]) {
        ctx.fillRect(x - 0.5, 5, 1, 4);
      }
    },
    dimensions: { rows: 1, columns: 3 },
  },
  simulate: (inputs, params) => {
    const vBase = inputs.pin_0?.voltage ?? 0;
    const vCollector = inputs.pin_1?.voltage ?? 0;
    const vEmitter = inputs.pin_2?.voltage ?? 0;
    const vbe = vBase - vEmitter;

    const outputs = { ...inputs };

    if (vbe > 0.7) {
      // Conducting: collector pulled to near emitter voltage (saturation)
      outputs.pin_1 = { voltage: vEmitter + 0.2, current: 0 };
      outputs.pin_2 = { voltage: vEmitter, current: 0 };
    } else {
      // Not conducting: collector floats at its current voltage
      outputs.pin_1 = { voltage: vCollector, current: 0 };
    }

    return outputs;
  },
};
```

- [ ] **Step 4: Run 2N3904 test to verify it passes**

Run: `npm test -- tests/components/definitions/Transistor2N3904.test.ts`
Expected: PASS

- [ ] **Step 5: Write 1N914 diode test**

Create: `tests/components/definitions/Diode1N914.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { diode1N914Definition } from '@/components/definitions/Diode1N914';

describe('1N914 Diode', () => {
  it('has correct metadata', () => {
    expect(diode1N914Definition.type).toBe('1n914');
    expect(diode1N914Definition.metadata.name).toBe('1N914');
    expect(diode1N914Definition.metadata.category).toBe('active');
  });

  it('has two pins: Anode and Cathode', () => {
    expect(diode1N914Definition.pins).toHaveLength(2);
    expect(diode1N914Definition.pins[0].label).toBe('A');
    expect(diode1N914Definition.pins[1].label).toBe('K');
  });

  it('conducts with 0.7V forward drop when forward biased', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0 },   // Anode
      pin_1: { voltage: 0, current: 0 },   // Cathode
    };

    const outputs = diode1N914Definition.simulate(inputs, { forwardVoltage: 0.7 });

    // Forward biased: cathode = anode - 0.7V
    expect(outputs.pin_1.voltage).toBeCloseTo(4.3);
  });

  it('blocks when reverse biased', () => {
    const inputs = {
      pin_0: { voltage: 0, current: 0 },   // Anode
      pin_1: { voltage: 5, current: 0 },   // Cathode
    };

    const outputs = diode1N914Definition.simulate(inputs, { forwardVoltage: 0.7 });

    // Reverse biased: no conduction, cathode stays
    expect(outputs.pin_1.voltage).toBe(5);
  });

  it('schematic symbol renders without errors', () => {
    const { container } = render(
      <svg>{diode1N914Definition.schematic.symbol.render({ forwardVoltage: 0.7 })}</svg>
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Implement 1N914 diode**

Create: `src/components/definitions/Diode1N914.tsx`

```tsx
import type { ComponentDefinition, PinId } from '@/types/circuit';

export const diode1N914Definition: ComponentDefinition = {
  type: '1n914',
  metadata: {
    name: '1N914',
    category: 'active',
    description: 'Signal diode — 0.7V forward voltage drop',
  },
  pins: [
    { id: 'pin_0' as PinId, label: 'A', type: 'bidirectional', position: { x: -20, y: 0 } },
    { id: 'pin_1' as PinId, label: 'K', type: 'bidirectional', position: { x: 20, y: 0 } },
  ],
  defaultParameters: { forwardVoltage: 0.7 },
  schematic: {
    symbol: {
      width: 50,
      height: 30,
      render: () => (
        <g>
          {/* Triangle (anode side) */}
          <path d="M -8,-10 L -8,10 L 8,0 Z" fill="none" stroke="currentColor" strokeWidth="2" />
          {/* Bar (cathode side) */}
          <line x1="8" y1="-10" x2="8" y2="10" stroke="currentColor" strokeWidth="2" />
          {/* Leads */}
          <line x1="-20" y1="0" x2="-8" y2="0" stroke="currentColor" strokeWidth="2" />
          <line x1="8" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="2" />
          {/* Label */}
          <text x="0" y="-16" fontSize="10" textAnchor="middle" fill="currentColor">1N914</text>
        </g>
      ),
    },
    dimensions: { width: 50, height: 30 },
  },
  breadboard: {
    renderer: (ctx) => {
      // Glass body (orange)
      ctx.fillStyle = '#FF8C00';
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cathode band (black)
      ctx.fillStyle = '#000';
      ctx.fillRect(5, -4, 2, 8);
      // Leads
      ctx.strokeStyle = '#c0c0c0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-8, 0);
      ctx.moveTo(8, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 3 },
  },
  simulate: (inputs, params) => {
    const vAnode = inputs.pin_0?.voltage ?? 0;
    const vCathode = inputs.pin_1?.voltage ?? 0;
    const vForward = (params.forwardVoltage as number) ?? 0.7;

    const outputs = { ...inputs };

    if (vAnode - vCathode > vForward) {
      // Forward biased: cathode = anode - forward drop
      outputs.pin_1 = { voltage: vAnode - vForward, current: 0 };
    }
    // Reverse biased: no change

    return outputs;
  },
};
```

- [ ] **Step 7: Run 1N914 test to verify it passes**

Run: `npm test -- tests/components/definitions/Diode1N914.test.ts`
Expected: PASS

- [ ] **Step 8: Write Audio Output Jack test**

Create: `tests/components/definitions/AudioOutputJack.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { audioOutputJackDefinition } from '@/components/definitions/AudioOutputJack';

describe('Audio Output Jack', () => {
  it('has correct metadata', () => {
    expect(audioOutputJackDefinition.type).toBe('audio-output');
    expect(audioOutputJackDefinition.metadata.name).toBe('Audio Output');
    expect(audioOutputJackDefinition.metadata.category).toBe('power');
  });

  it('has one input pin', () => {
    expect(audioOutputJackDefinition.pins).toHaveLength(1);
    expect(audioOutputJackDefinition.pins[0].label).toBe('IN');
    expect(audioOutputJackDefinition.pins[0].type).toBe('input');
  });

  it('passes through input voltage (routing handled by AudioBridge)', () => {
    const inputs = {
      pin_0: { voltage: 4.5, current: 0 },
    };

    const outputs = audioOutputJackDefinition.simulate(inputs, {});
    expect(outputs.pin_0.voltage).toBe(4.5);
  });

  it('schematic symbol renders without errors', () => {
    const { container } = render(
      <svg>{audioOutputJackDefinition.schematic.symbol.render({})}</svg>
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Implement Audio Output Jack**

Create: `src/components/definitions/AudioOutputJack.tsx`

```tsx
import type { ComponentDefinition, PinId } from '@/types/circuit';

export const audioOutputJackDefinition: ComponentDefinition = {
  type: 'audio-output',
  metadata: {
    name: 'Audio Output',
    category: 'power',
    description: 'Routes circuit signal to PC speakers/headphones',
  },
  pins: [
    { id: 'pin_0' as PinId, label: 'IN', type: 'input', position: { x: 0, y: -20 } },
  ],
  defaultParameters: {},
  schematic: {
    symbol: {
      width: 40,
      height: 50,
      render: () => (
        <g>
          {/* Speaker icon */}
          <rect x="-6" y="-8" width="12" height="16" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M 6,-14 L 14,-20 L 14,20 L 6,14" fill="none" stroke="currentColor" strokeWidth="2" />
          {/* Sound waves */}
          <path d="M 17,-8 Q 22,0 17,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M 20,-12 Q 27,0 20,12" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {/* Lead */}
          <line x1="0" y1="-8" x2="0" y2="-20" stroke="currentColor" strokeWidth="2" />
          {/* Label */}
          <text x="0" y="30" fontSize="10" textAnchor="middle" fill="currentColor">Audio Out</text>
        </g>
      ),
    },
    dimensions: { width: 40, height: 50 },
  },
  breadboard: {
    renderer: (ctx) => {
      // 3.5mm jack connector
      ctx.fillStyle = '#333';
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = '#c0c0c0';
      ctx.beginPath();
      ctx.arc(4, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    },
    dimensions: { rows: 1, columns: 2 },
  },
  simulate: (inputs) => {
    // Pass-through — AudioBridge reads this component's net voltage
    return { ...inputs };
  },
};
```

- [ ] **Step 10: Run Audio Output Jack test**

Run: `npm test -- tests/components/definitions/AudioOutputJack.test.ts`
Expected: PASS

- [ ] **Step 11: Write LED test**

Create: `tests/components/definitions/LED.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ledDefinition } from '@/components/definitions/LED';

describe('LED', () => {
  it('has correct metadata', () => {
    expect(ledDefinition.type).toBe('led');
    expect(ledDefinition.metadata.name).toBe('LED');
    expect(ledDefinition.metadata.category).toBe('active');
  });

  it('has two pins: Anode and Cathode', () => {
    expect(ledDefinition.pins).toHaveLength(2);
    expect(ledDefinition.pins[0].label).toBe('A');
    expect(ledDefinition.pins[1].label).toBe('K');
  });

  it('reports ON state when forward voltage exceeds 2V', () => {
    const inputs = {
      pin_0: { voltage: 5, current: 0 },   // Anode
      pin_1: { voltage: 0, current: 0 },   // Cathode
    };

    const outputs = ledDefinition.simulate(inputs, { color: 'red', forwardVoltage: 2.0 });

    // Forward biased > 2V: LED is on, cathode shows voltage drop
    expect(outputs.pin_1.voltage).toBeCloseTo(3.0);
  });

  it('reports OFF state when forward voltage is below threshold', () => {
    const inputs = {
      pin_0: { voltage: 1.5, current: 0 }, // Anode
      pin_1: { voltage: 0, current: 0 },   // Cathode
    };

    const outputs = ledDefinition.simulate(inputs, { color: 'red', forwardVoltage: 2.0 });

    // Below threshold: no conduction
    expect(outputs.pin_1.voltage).toBe(0);
  });

  it('has default color parameter', () => {
    expect(ledDefinition.defaultParameters.color).toBe('red');
    expect(ledDefinition.defaultParameters.forwardVoltage).toBe(2.0);
  });

  it('schematic symbol renders without errors', () => {
    const { container } = render(
      <svg>{ledDefinition.schematic.symbol.render({ color: 'red', forwardVoltage: 2.0 })}</svg>
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Implement LED**

Create: `src/components/definitions/LED.tsx`

```tsx
import type { ComponentDefinition, PinId } from '@/types/circuit';

export const ledDefinition: ComponentDefinition = {
  type: 'led',
  metadata: {
    name: 'LED',
    category: 'active',
    description: 'Light-emitting diode — visual output indicator',
  },
  pins: [
    { id: 'pin_0' as PinId, label: 'A', type: 'bidirectional', position: { x: -20, y: 0 } },
    { id: 'pin_1' as PinId, label: 'K', type: 'bidirectional', position: { x: 20, y: 0 } },
  ],
  defaultParameters: { color: 'red', forwardVoltage: 2.0 },
  schematic: {
    symbol: {
      width: 50,
      height: 40,
      render: (params) => (
        <g>
          {/* Diode triangle */}
          <path d="M -8,-10 L -8,10 L 8,0 Z" fill="none" stroke="currentColor" strokeWidth="2" />
          {/* Cathode bar */}
          <line x1="8" y1="-10" x2="8" y2="10" stroke="currentColor" strokeWidth="2" />
          {/* Leads */}
          <line x1="-20" y1="0" x2="-8" y2="0" stroke="currentColor" strokeWidth="2" />
          <line x1="8" y1="0" x2="20" y2="0" stroke="currentColor" strokeWidth="2" />
          {/* Light emission arrows */}
          <line x1="2" y1="-12" x2="6" y2="-18" stroke="currentColor" strokeWidth="1.5" />
          <path d="M 4,-19 L 6,-18 L 5,-16" fill="currentColor" />
          <line x1="6" y1="-10" x2="10" y2="-16" stroke="currentColor" strokeWidth="1.5" />
          <path d="M 8,-17 L 10,-16 L 9,-14" fill="currentColor" />
          {/* Label */}
          <text x="0" y="22" fontSize="10" textAnchor="middle" fill="currentColor">LED</text>
        </g>
      ),
    },
    dimensions: { width: 50, height: 40 },
  },
  breadboard: {
    renderer: (ctx, params) => {
      const color = (params.color as string) || 'red';
      // LED dome
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, -2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      // Rim
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Leads
      ctx.strokeStyle = '#c0c0c0';
      ctx.beginPath();
      ctx.moveTo(-3, 6);
      ctx.lineTo(-3, 12);
      ctx.moveTo(3, 6);
      ctx.lineTo(3, 12);
      ctx.stroke();
    },
    dimensions: { rows: 1, columns: 2 },
  },
  simulate: (inputs, params) => {
    const vAnode = inputs.pin_0?.voltage ?? 0;
    const vCathode = inputs.pin_1?.voltage ?? 0;
    const vForward = (params.forwardVoltage as number) ?? 2.0;

    const outputs = { ...inputs };

    if (vAnode - vCathode > vForward) {
      // Forward biased: conducting with forward voltage drop
      outputs.pin_1 = { voltage: vAnode - vForward, current: 0 };
    }

    return outputs;
  },
};
```

- [ ] **Step 13: Run LED test**

Run: `npm test -- tests/components/definitions/LED.test.ts`
Expected: PASS

- [ ] **Step 14: Register new components in main.tsx**

Modify: `src/main.tsx` — Add imports and registrations:

```typescript
// Add these imports
import { transistor2N3904Definition } from './components/definitions/Transistor2N3904';
import { diode1N914Definition } from './components/definitions/Diode1N914';
import { audioOutputJackDefinition } from './components/definitions/AudioOutputJack';
import { ledDefinition } from './components/definitions/LED';
import { SimulationEngine } from './simulation/SimulationEngine';

// Add these registrations after existing ones
registry.register(transistor2N3904Definition);
registry.register(diode1N914Definition);
registry.register(audioOutputJackDefinition);
registry.register(ledDefinition);

// Register output types for simulation activation
SimulationEngine.registerOutputType('audio-output');
SimulationEngine.registerOutputType('led');
```

- [ ] **Step 15: Run all component tests**

Run: `npm test -- tests/components/`
Expected: All PASS

- [ ] **Step 16: Commit**

```bash
git add src/components/definitions/Transistor2N3904.tsx src/components/definitions/Diode1N914.tsx src/components/definitions/AudioOutputJack.tsx src/components/definitions/LED.tsx tests/components/definitions/ src/main.tsx
git commit -m "feat: add 2N3904 transistor, 1N914 diode, Audio Output Jack, and LED components"
```

---

## Task 5: Undo/Redo System

**Files:**
- Modify: `src/context/CircuitContext.tsx`
- Test: `tests/context/UndoRedo.test.ts`

- [ ] **Step 1: Write undo/redo test**

Create: `tests/context/UndoRedo.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import type { Component, ComponentId } from '@/types/circuit';

const makeComponent = (id: string): Component => ({
  id: id as ComponentId,
  type: 'resistor',
  position: { schematic: { x: 0, y: 0 }, breadboard: { row: 0, column: 0 } },
  rotation: 0,
  parameters: { resistance: 1000 },
  pins: [],
  state: { voltages: new Map(), currents: new Map() },
});

describe('Undo/Redo', () => {
  it('should undo adding a component', () => {
    const { result } = renderHook(() => useCircuit(), { wrapper: CircuitProvider });

    act(() => {
      result.current.addComponent(makeComponent('comp1'));
    });
    expect(result.current.circuit.getComponents()).toHaveLength(1);

    act(() => {
      result.current.undo();
    });
    expect(result.current.circuit.getComponents()).toHaveLength(0);
  });

  it('should redo after undo', () => {
    const { result } = renderHook(() => useCircuit(), { wrapper: CircuitProvider });

    act(() => {
      result.current.addComponent(makeComponent('comp1'));
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.circuit.getComponents()).toHaveLength(0);

    act(() => {
      result.current.redo();
    });
    expect(result.current.circuit.getComponents()).toHaveLength(1);
  });

  it('should clear redo stack on new mutation', () => {
    const { result } = renderHook(() => useCircuit(), { wrapper: CircuitProvider });

    act(() => {
      result.current.addComponent(makeComponent('comp1'));
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.addComponent(makeComponent('comp2'));
    });
    act(() => {
      result.current.redo();
    });

    // Redo should do nothing — stack was cleared
    expect(result.current.circuit.getComponents()).toHaveLength(1);
    expect(result.current.circuit.getComponent('comp2' as ComponentId)).toBeDefined();
  });

  it('should report canUndo and canRedo correctly', () => {
    const { result } = renderHook(() => useCircuit(), { wrapper: CircuitProvider });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.addComponent(makeComponent('comp1'));
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.undo();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('should cap undo stack at 50 entries', () => {
    const { result } = renderHook(() => useCircuit(), { wrapper: CircuitProvider });

    for (let i = 0; i < 55; i++) {
      act(() => {
        result.current.addComponent(makeComponent(`comp${i}`));
      });
    }

    // Should be able to undo 50 times but not 55
    let undoCount = 0;
    while (result.current.canUndo) {
      act(() => {
        result.current.undo();
      });
      undoCount++;
    }

    expect(undoCount).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/context/UndoRedo.test.ts`
Expected: FAIL - result.current.undo is not a function

- [ ] **Step 3: Add undo/redo to CircuitContext**

Modify: `src/context/CircuitContext.tsx`

Add to the `CircuitContextType` interface:

```typescript
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
```

Add to `CircuitProvider` implementation:

```typescript
const MAX_UNDO_STACK = 50;

// Inside CircuitProvider:
const [undoStack, setUndoStack] = useState<Circuit[]>([]);
const [redoStack, setRedoStack] = useState<Circuit[]>([]);

const pushUndo = useCallback((currentCircuit: Circuit) => {
  setUndoStack(prev => {
    const next = [...prev, currentCircuit];
    return next.length > MAX_UNDO_STACK ? next.slice(-MAX_UNDO_STACK) : next;
  });
  setRedoStack([]);
}, []);

// Wrap each existing mutation to call pushUndo before setCircuit:
const addComponent = useCallback((component: Component) => {
  setCircuit(prev => {
    pushUndo(prev);
    return prev.addComponent(component);
  });
}, [pushUndo]);

// (Same pattern for removeComponent, updateComponent, addConnection, removeConnection)

const undo = useCallback(() => {
  setUndoStack(prev => {
    if (prev.length === 0) return prev;
    const restored = prev[prev.length - 1];
    setRedoStack(redo => [...redo, circuit]);
    setCircuit(restored);
    return prev.slice(0, -1);
  });
}, [circuit]);

const redo = useCallback(() => {
  setRedoStack(prev => {
    if (prev.length === 0) return prev;
    const restored = prev[prev.length - 1];
    setUndoStack(undo => [...undo, circuit]);
    setCircuit(restored);
    return prev.slice(0, -1);
  });
}, [circuit]);

const canUndo = undoStack.length > 0;
const canRedo = redoStack.length > 0;
```

Add `undo`, `redo`, `canUndo`, `canRedo` to the context value and memoization deps.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/context/UndoRedo.test.ts`
Expected: PASS

- [ ] **Step 5: Add keyboard shortcuts for undo/redo**

Modify: `src/views/SchematicView.tsx` — In the existing `handleKeyDown` handler, add:

```typescript
// Ctrl+Z / Cmd+Z for undo
if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
  e.preventDefault();
  undo();
  return;
}
// Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y for redo
if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
    ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
  e.preventDefault();
  redo();
  return;
}
```

Destructure `undo` and `redo` from `useCircuit()`.

- [ ] **Step 6: Run all context tests**

Run: `npm test -- tests/context/`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/context/CircuitContext.tsx src/views/SchematicView.tsx tests/context/UndoRedo.test.ts
git commit -m "feat: add undo/redo system with Ctrl+Z/Ctrl+Shift+Z shortcuts"
```

---

## Task 6: Parameter Parser & Interactive Controls

**Files:**
- Create: `src/utils/parameterParser.ts`
- Create: `src/views/SchematicView/ParameterEditor.tsx`
- Test: `tests/utils/parameterParser.test.ts`
- Modify: `src/views/SchematicView/DraggableComponent.tsx`

- [ ] **Step 1: Write parameter parser test**

Create: `tests/utils/parameterParser.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { parseValue, formatValue } from '@/utils/parameterParser';

describe('parameterParser', () => {
  describe('parseValue', () => {
    it('parses plain numbers', () => {
      expect(parseValue('1000')).toBe(1000);
      expect(parseValue('47')).toBe(47);
    });

    it('parses k suffix (kilo)', () => {
      expect(parseValue('10k')).toBe(10000);
      expect(parseValue('4.7k')).toBe(4700);
      expect(parseValue('4.7K')).toBe(4700);
    });

    it('parses M suffix (mega)', () => {
      expect(parseValue('1M')).toBe(1000000);
      expect(parseValue('4.7M')).toBe(4700000);
    });

    it('parses n suffix (nano)', () => {
      expect(parseValue('100n')).toBeCloseTo(0.0000001);
      expect(parseValue('47n')).toBeCloseTo(0.000000047);
    });

    it('parses u suffix (micro)', () => {
      expect(parseValue('1u')).toBeCloseTo(0.000001);
      expect(parseValue('10u')).toBeCloseTo(0.00001);
    });

    it('parses p suffix (pico)', () => {
      expect(parseValue('100p')).toBeCloseTo(0.0000000001);
    });

    it('parses m suffix (milli)', () => {
      expect(parseValue('100m')).toBeCloseTo(0.1);
    });

    it('returns NaN for invalid input', () => {
      expect(parseValue('')).toBeNaN();
      expect(parseValue('abc')).toBeNaN();
    });
  });

  describe('formatValue', () => {
    it('formats resistor values', () => {
      expect(formatValue(1000, 'resistance')).toBe('1k');
      expect(formatValue(4700, 'resistance')).toBe('4.7k');
      expect(formatValue(1000000, 'resistance')).toBe('1M');
      expect(formatValue(47, 'resistance')).toBe('47');
    });

    it('formats capacitor values', () => {
      expect(formatValue(0.0000001, 'capacitance')).toBe('100n');
      expect(formatValue(0.000001, 'capacitance')).toBe('1u');
      expect(formatValue(0.000000047, 'capacitance')).toBe('47n');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/utils/parameterParser.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement parameter parser**

Create: `src/utils/parameterParser.ts`

```typescript
const SUFFIXES: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
};

export function parseValue(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return NaN;

  // Check for suffix
  const lastChar = trimmed[trimmed.length - 1];
  if (SUFFIXES[lastChar]) {
    const numPart = trimmed.slice(0, -1);
    const num = parseFloat(numPart);
    if (isNaN(num)) return NaN;
    return num * SUFFIXES[lastChar];
  }

  return parseFloat(trimmed);
}

export function formatValue(value: number, type: 'resistance' | 'capacitance'): string {
  if (type === 'resistance') {
    if (value >= 1e6) return `${value / 1e6}M`;
    if (value >= 1e3) return `${value / 1e3}k`;
    return `${value}`;
  }

  if (type === 'capacitance') {
    if (value >= 1e-6) return `${Math.round(value / 1e-6)}u`;
    if (value >= 1e-9) return `${Math.round(value / 1e-9)}n`;
    if (value >= 1e-12) return `${Math.round(value / 1e-12)}p`;
    return `${value}`;
  }

  return `${value}`;
}
```

- [ ] **Step 4: Run parser test**

Run: `npm test -- tests/utils/parameterParser.test.ts`
Expected: PASS

- [ ] **Step 5: Create ParameterEditor component**

Create: `src/views/SchematicView/ParameterEditor.tsx`

```tsx
import { useState, useRef, useEffect } from 'react';
import { parseValue, formatValue } from '@/utils/parameterParser';

interface ParameterEditorProps {
  value: string;
  parameterKey: 'resistance' | 'capacitance';
  position: { x: number; y: number };
  onConfirm: (rawValue: number, displayValue: string) => void;
  onCancel: () => void;
}

export const ParameterEditor: React.FC<ParameterEditorProps> = ({
  value,
  parameterKey,
  position,
  onConfirm,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const parsed = parseValue(inputValue);
      if (!isNaN(parsed)) {
        const display = formatValue(parsed, parameterKey);
        onConfirm(parsed, display);
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
    e.stopPropagation();
  };

  return (
    <foreignObject x={position.x - 40} y={position.y - 12} width={80} height={24}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        style={{
          width: '100%',
          padding: '2px 6px',
          fontSize: '12px',
          border: '2px solid #4CAF50',
          borderRadius: '4px',
          outline: 'none',
          textAlign: 'center',
          background: 'white',
        }}
      />
    </foreignObject>
  );
};
```

- [ ] **Step 6: Add double-click handling to DraggableComponent**

Modify: `src/views/SchematicView/DraggableComponent.tsx`

Add double-click handler that opens ParameterEditor for resistors and capacitors. The handler should:
- Check if component type is 'resistor' or 'capacitor'
- Set editing state with component id and parameter key
- Render ParameterEditor as overlay on the component
- On confirm: call `updateComponent` with new parameter values
- On cancel: clear editing state

```typescript
// In DraggableComponent, add:
const handleDoubleClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  if (component.type === 'resistor' || component.type === 'capacitor') {
    onEditParameter?.(component.id);
  }
};
```

The parent SchematicView manages the editing state and renders the ParameterEditor overlay.

- [ ] **Step 7: Add potentiometer drag interaction to DraggableComponent**

Modify: `src/views/SchematicView/DraggableComponent.tsx`

For potentiometer components in select mode, add vertical drag handling:
- On mousedown on a potentiometer: begin tracking Y position
- On mousemove: calculate delta Y, map to position change (0.0 to 1.0)
- On mouseup: stop tracking
- Show tooltip with current value during drag
- Call `updateComponent` with new `position` parameter on each move

```typescript
// In DraggableComponent for potentiometer type:
const handlePotDrag = (e: React.MouseEvent) => {
  if (component.type !== 'potentiometer' || toolMode !== 'select') return;

  const startY = e.clientY;
  const startPos = (component.parameters.position as number) || 0.5;

  const handleMove = (moveEvent: MouseEvent) => {
    const deltaY = startY - moveEvent.clientY; // Up = increase
    const newPos = Math.max(0, Math.min(1, startPos + deltaY / 100));
    updateComponent(component.id, {
      parameters: { ...component.parameters, position: newPos },
    });
  };

  const handleUp = () => {
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleUp);
  };

  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleUp);
};
```

- [ ] **Step 8: Commit**

```bash
git add src/utils/parameterParser.ts src/views/SchematicView/ParameterEditor.tsx src/views/SchematicView/DraggableComponent.tsx tests/utils/parameterParser.test.ts
git commit -m "feat: add interactive parameter editing for resistors, capacitors, and potentiometers"
```

---

## Task 7: Breadboard Auto-Placement

**Files:**
- Create: `src/views/BreadboardView/autoPlace.ts`
- Modify: `src/utils/componentFactory.ts`
- Test: `tests/views/BreadboardView/autoPlace.test.ts`

- [ ] **Step 1: Write auto-placement test**

Create: `tests/views/BreadboardView/autoPlace.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { autoPlace, BreadboardGrid } from '@/views/BreadboardView/autoPlace';
import type { Component, ComponentId } from '@/types/circuit';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { cd40106Definition } from '@/components/definitions/CD40106';

describe('autoPlace', () => {
  it('should place first component at starting position', () => {
    const grid = new BreadboardGrid();
    const position = grid.place('resistor', { rows: 1, columns: 4 });

    expect(position.row).toBeGreaterThan(0);
    expect(position.column).toBeGreaterThan(0);
  });

  it('should place components with gaps between them', () => {
    const grid = new BreadboardGrid();
    const pos1 = grid.place('resistor', { rows: 1, columns: 4 });
    const pos2 = grid.place('resistor', { rows: 1, columns: 4 });

    // Should not overlap — second position offset from first
    expect(pos2.column).toBeGreaterThanOrEqual(pos1.column + 4 + 1);
  });

  it('should straddle ICs across center channel', () => {
    const grid = new BreadboardGrid();
    const position = grid.place('cd40106', { rows: 7, columns: 2 });

    // ICs should be centered on the channel (row ~5 for top side)
    // The exact row depends on implementation, but it should cross the channel
    expect(position.row).toBeLessThanOrEqual(5);
  });

  it('should wrap to next row when current row is full', () => {
    const grid = new BreadboardGrid();

    // Fill up a row with many small components
    const positions = [];
    for (let i = 0; i < 15; i++) {
      positions.push(grid.place('resistor', { rows: 1, columns: 4 }));
    }

    // Some components should be on different rows
    const rows = new Set(positions.map(p => p.row));
    expect(rows.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/views/BreadboardView/autoPlace.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement auto-placement**

Create: `src/views/BreadboardView/autoPlace.ts`

```typescript
import type { BreadboardPosition } from '@/types/circuit';

const BOARD_COLUMNS = 63;
const ROWS_PER_SIDE = 5; // a-e on top, f-j on bottom
const IC_TYPES = new Set(['cd40106', 'lm741']);

export class BreadboardGrid {
  private occupied: Set<string> = new Set();
  private nextColumn = 2; // Start with some margin
  private nextRow = 1;

  private key(row: number, col: number): string {
    return `${row}:${col}`;
  }

  private isAvailable(row: number, col: number, rows: number, cols: number): boolean {
    for (let r = row; r < row + rows; r++) {
      for (let c = col; c < col + cols; c++) {
        if (this.occupied.has(this.key(r, c))) return false;
        if (c > BOARD_COLUMNS) return false;
      }
    }
    return true;
  }

  private markOccupied(row: number, col: number, rows: number, cols: number): void {
    for (let r = row; r < row + rows; r++) {
      for (let c = col; c < col + cols; c++) {
        this.occupied.add(this.key(r, c));
      }
    }
  }

  place(type: string, dimensions: { rows: number; columns: number }): BreadboardPosition {
    const { rows, columns } = dimensions;

    // ICs straddle the center channel
    if (IC_TYPES.has(type)) {
      return this.placeIC(rows, columns);
    }

    return this.placeGeneral(rows, columns);
  }

  private placeIC(rows: number, columns: number): BreadboardPosition {
    // ICs straddle center: place so they span rows across the channel
    const startRow = ROWS_PER_SIDE - Math.floor(rows / 2);

    for (let col = 2; col <= BOARD_COLUMNS - columns; col++) {
      if (this.isAvailable(startRow, col, rows, columns)) {
        this.markOccupied(startRow, col, rows, columns);
        return { row: startRow, column: col };
      }
    }

    // Fallback
    return { row: startRow, column: this.nextColumn };
  }

  private placeGeneral(rows: number, columns: number): BreadboardPosition {
    // Try current row first
    for (let row = this.nextRow; row <= ROWS_PER_SIDE; row++) {
      for (let col = (row === this.nextRow ? this.nextColumn : 2); col <= BOARD_COLUMNS - columns; col++) {
        if (this.isAvailable(row, col, rows, columns)) {
          this.markOccupied(row, col, rows, columns);
          this.nextColumn = col + columns + 1; // Gap of 1
          this.nextRow = row;

          // Wrap if next position would be off the board
          if (this.nextColumn > BOARD_COLUMNS - 4) {
            this.nextColumn = 2;
            this.nextRow = row + rows + 1;
          }

          return { row, column: col };
        }
      }
      // Move to next row
      this.nextColumn = 2;
    }

    // Fallback: use bottom side of board
    return { row: ROWS_PER_SIDE + 1, column: 2 };
  }

  clear(): void {
    this.occupied.clear();
    this.nextColumn = 2;
    this.nextRow = 1;
  }
}
```

- [ ] **Step 4: Run auto-placement test**

Run: `npm test -- tests/views/BreadboardView/autoPlace.test.ts`
Expected: PASS

- [ ] **Step 5: Update componentFactory to use auto-placement**

Modify: `src/utils/componentFactory.ts`

```typescript
// Add import
import { BreadboardGrid } from '@/views/BreadboardView/autoPlace';

// Add shared grid instance
let breadboardGrid = new BreadboardGrid();

export function resetBreadboardGrid(): void {
  breadboardGrid = new BreadboardGrid();
}

// Update createComponentFromDefinition to auto-place:
export const createComponentFromDefinition = (
  definition: ComponentDefinition,
  schematicPosition: { x: number; y: number }
): Component => {
  const breadboardPosition = breadboardGrid.place(
    definition.type,
    definition.breadboard.dimensions
  );

  return {
    id: nanoid() as ComponentId,
    type: definition.type,
    position: {
      schematic: schematicPosition,
      breadboard: breadboardPosition,
    },
    rotation: 0,
    parameters: { ...definition.defaultParameters },
    pins: definition.pins.map(pin => ({ ...pin })),
    state: {
      voltages: new Map(),
      currents: new Map(),
    },
  };
};
```

- [ ] **Step 6: Run componentFactory tests to check nothing broke**

Run: `npm test -- tests/utils/componentFactory.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/views/BreadboardView/autoPlace.ts src/utils/componentFactory.ts tests/views/BreadboardView/
git commit -m "feat: add breadboard auto-placement algorithm"
```

---

## Task 8: Breadboard View

**Files:**
- Create: `src/views/BreadboardView/BreadboardRenderer.ts`
- Create: `src/views/BreadboardView/BreadboardView.tsx`
- Create: `src/views/BreadboardView/BreadboardView.module.css`
- Test: `tests/views/BreadboardView.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write BreadboardRenderer test**

Create: `tests/views/BreadboardView.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BreadboardRenderer } from '@/views/BreadboardView/BreadboardRenderer';
import type { Component, Connection, ComponentId, PinId, ConnectionId, NetId } from '@/types/circuit';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { powerSupplyDefinition } from '@/components/definitions/PowerSupply';
import { groundDefinition } from '@/components/definitions/Ground';

// Mock canvas context
const createMockCtx = () => {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    setLineDash: vi.fn(),
    clearRect: vi.fn(),
    ellipse: vi.fn(),
    canvas: { width: 800, height: 600 },
  };
  return ctx as unknown as CanvasRenderingContext2D;
};

describe('BreadboardRenderer', () => {
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = ComponentRegistry.getInstance();
    registry.clear();
    registry.register(resistorDefinition);
    registry.register(powerSupplyDefinition);
    registry.register(groundDefinition);
  });

  it('should render board background', () => {
    const ctx = createMockCtx();
    const renderer = new BreadboardRenderer(ctx, 800, 600);
    renderer.renderBoard();

    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('should render component at breadboard position', () => {
    const ctx = createMockCtx();
    const renderer = new BreadboardRenderer(ctx, 800, 600);

    const component: Component = {
      id: 'comp1' as ComponentId,
      type: 'resistor',
      position: { schematic: { x: 0, y: 0 }, breadboard: { row: 1, column: 5 } },
      rotation: 0,
      parameters: { resistance: 1000, value: '1k' },
      pins: [],
      state: { voltages: new Map(), currents: new Map() },
    };

    renderer.renderComponent(component);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.translate).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('should determine wire color based on net type', () => {
    const renderer = new BreadboardRenderer(createMockCtx(), 800, 600);

    const powerComp: Component = {
      id: 'pwr' as ComponentId,
      type: 'power',
      position: { schematic: { x: 0, y: 0 }, breadboard: { row: 0, column: 0 } },
      rotation: 0,
      parameters: { voltage: 9 },
      pins: [{ id: 'pin_0' as PinId, label: '+', type: 'power', position: { x: 0, y: 0 } }],
      state: { voltages: new Map(), currents: new Map() },
    };

    const groundComp: Component = {
      id: 'gnd' as ComponentId,
      type: 'ground',
      position: { schematic: { x: 0, y: 0 }, breadboard: { row: 0, column: 0 } },
      rotation: 0,
      parameters: {},
      pins: [{ id: 'pin_0' as PinId, label: 'GND', type: 'ground', position: { x: 0, y: 0 } }],
      state: { voltages: new Map(), currents: new Map() },
    };

    const components = new Map<ComponentId, Component>();
    components.set('pwr' as ComponentId, powerComp);
    components.set('gnd' as ComponentId, groundComp);

    expect(renderer.getWireColor('pwr' as ComponentId, components)).toBe('#FF0000');
    expect(renderer.getWireColor('gnd' as ComponentId, components)).toBe('#000000');
    expect(renderer.getWireColor('other' as ComponentId, components)).toBe('#4169E1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/views/BreadboardView.test.tsx`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement BreadboardRenderer**

Create: `src/views/BreadboardView/BreadboardRenderer.ts`

```typescript
import type { Component, Connection, ComponentId } from '@/types/circuit';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';

const HOLE_SPACING = 10;
const BOARD_PADDING = 20;
const BOARD_COLUMNS = 63;
const ROWS_TOP = 5;    // a-e
const ROWS_BOTTOM = 5; // f-j
const CHANNEL_GAP = 16;
const HOLE_RADIUS = 2;

export class BreadboardRenderer {
  private registry = ComponentRegistry.getInstance();

  constructor(
    private ctx: CanvasRenderingContext2D,
    private width: number,
    private height: number
  ) {}

  renderBoard(): void {
    const ctx = this.ctx;

    // Background
    ctx.fillStyle = '#F5E6C8';
    ctx.fillRect(0, 0, this.width, this.height);

    // Board body with rounded corners approximation
    ctx.fillStyle = '#E8D5B0';
    ctx.fillRect(BOARD_PADDING - 5, BOARD_PADDING - 5,
      BOARD_COLUMNS * HOLE_SPACING + 10,
      (ROWS_TOP + ROWS_BOTTOM) * HOLE_SPACING + CHANNEL_GAP + 10);

    // Power rails (top)
    this.renderPowerRail(BOARD_PADDING, BOARD_PADDING - 14, '#FF0000');
    this.renderPowerRail(BOARD_PADDING, BOARD_PADDING - 6, '#0000FF');

    // Hole grid — top side (rows a-e)
    for (let row = 0; row < ROWS_TOP; row++) {
      for (let col = 0; col < BOARD_COLUMNS; col++) {
        this.renderHole(
          BOARD_PADDING + col * HOLE_SPACING,
          BOARD_PADDING + row * HOLE_SPACING
        );
      }
    }

    // Center channel
    ctx.fillStyle = '#C4A882';
    ctx.fillRect(
      BOARD_PADDING - 5,
      BOARD_PADDING + ROWS_TOP * HOLE_SPACING,
      BOARD_COLUMNS * HOLE_SPACING + 10,
      CHANNEL_GAP
    );

    // Hole grid — bottom side (rows f-j)
    for (let row = 0; row < ROWS_BOTTOM; row++) {
      for (let col = 0; col < BOARD_COLUMNS; col++) {
        this.renderHole(
          BOARD_PADDING + col * HOLE_SPACING,
          BOARD_PADDING + ROWS_TOP * HOLE_SPACING + CHANNEL_GAP + row * HOLE_SPACING
        );
      }
    }

    // Power rails (bottom)
    const bottomRailY = BOARD_PADDING + (ROWS_TOP + ROWS_BOTTOM) * HOLE_SPACING + CHANNEL_GAP;
    this.renderPowerRail(BOARD_PADDING, bottomRailY + 6, '#FF0000');
    this.renderPowerRail(BOARD_PADDING, bottomRailY + 14, '#0000FF');
  }

  private renderPowerRail(x: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (BOARD_COLUMNS - 1) * HOLE_SPACING, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Power rail holes
    for (let col = 0; col < BOARD_COLUMNS; col++) {
      this.renderHole(x + col * HOLE_SPACING, y);
    }
  }

  private renderHole(x: number, y: number): void {
    const ctx = this.ctx;
    // Shadow/depth
    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.arc(x, y, HOLE_RADIUS + 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Metal contact
    ctx.fillStyle = '#A0A0A0';
    ctx.beginPath();
    ctx.arc(x, y, HOLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  boardPosition(row: number, column: number): { x: number; y: number } {
    const x = BOARD_PADDING + column * HOLE_SPACING;
    let y: number;

    if (row <= ROWS_TOP) {
      y = BOARD_PADDING + (row - 1) * HOLE_SPACING;
    } else {
      y = BOARD_PADDING + ROWS_TOP * HOLE_SPACING + CHANNEL_GAP + (row - ROWS_TOP - 1) * HOLE_SPACING;
    }

    return { x, y };
  }

  renderComponent(component: Component): void {
    const def = this.registry.get(component.type);
    if (!def) return;

    const pos = this.boardPosition(
      component.position.breadboard.row,
      component.position.breadboard.column
    );

    this.ctx.save();
    this.ctx.translate(pos.x, pos.y);
    def.breadboard.renderer(this.ctx, component.parameters);
    this.ctx.restore();
  }

  renderWire(
    fromPos: { x: number; y: number },
    toPos: { x: number; y: number },
    color: string
  ): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);

    // Quadratic bezier with slight droop
    const midX = (fromPos.x + toPos.x) / 2;
    const midY = Math.max(fromPos.y, toPos.y) + 8; // Droop below
    ctx.quadraticCurveTo(midX, midY, toPos.x, toPos.y);
    ctx.stroke();
  }

  getWireColor(componentId: ComponentId, components: Map<ComponentId, Component>): string {
    const comp = components.get(componentId);
    if (!comp) return '#4169E1'; // Default blue (signal)

    if (comp.type === 'power') return '#FF0000';  // Red
    if (comp.type === 'ground') return '#000000';  // Black

    return '#4169E1'; // Blue (signal)
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
```

- [ ] **Step 4: Run renderer test**

Run: `npm test -- tests/views/BreadboardView.test.tsx`
Expected: PASS

- [ ] **Step 5: Create BreadboardView component**

Create: `src/views/BreadboardView/BreadboardView.module.css`

```css
.container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #2a2a2a;
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

Create: `src/views/BreadboardView/BreadboardView.tsx`

```tsx
import { useRef, useEffect } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { BreadboardRenderer } from './BreadboardRenderer';
import { NetAnalyzer } from '@/simulation/NetAnalyzer';
import type { ComponentId } from '@/types/circuit';
import styles from './BreadboardView.module.css';

export const BreadboardView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { circuit } = useCircuit();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const renderer = new BreadboardRenderer(ctx, canvas.width, canvas.height);

    // Clear and render board
    renderer.clear();
    renderer.renderBoard();

    // Render components
    const components = circuit.getComponents();
    for (const component of components) {
      renderer.renderComponent(component);
    }

    // Render wires
    const connections = circuit.getConnections();
    const netAnalyzer = new NetAnalyzer(connections);
    const componentMap = new Map(
      components.map(c => [c.id, c])
    );

    for (const connection of connections) {
      const fromComp = circuit.getComponent(connection.from.componentId);
      const toComp = circuit.getComponent(connection.to.componentId);
      if (!fromComp || !toComp) continue;

      const fromPos = renderer.boardPosition(
        fromComp.position.breadboard.row,
        fromComp.position.breadboard.column
      );
      const toPos = renderer.boardPosition(
        toComp.position.breadboard.row,
        toComp.position.breadboard.column
      );

      // Determine wire color based on connected components
      let wireColor = '#4169E1'; // default blue
      const fromColor = renderer.getWireColor(connection.from.componentId, componentMap);
      const toColor = renderer.getWireColor(connection.to.componentId, componentMap);
      if (fromColor === '#FF0000' || toColor === '#FF0000') wireColor = '#FF0000';
      else if (fromColor === '#000000' || toColor === '#000000') wireColor = '#000000';

      renderer.renderWire(fromPos, toPos, wireColor);
    }
  }, [circuit]);

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};
```

- [ ] **Step 6: Add BreadboardView to App layout**

Modify: `src/App.tsx`

Add a view toggle (Tab key) to switch between Schematic and Breadboard views, or show them side by side. Add state for active view and render accordingly:

```typescript
// Add import
import { BreadboardView } from './views/BreadboardView/BreadboardView';

// Add state
const [activeView, setActiveView] = useState<'schematic' | 'breadboard'>('schematic');

// Add Tab key handler
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setActiveView(v => v === 'schematic' ? 'breadboard' : 'schematic');
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);

// In render, swap views based on activeView
{activeView === 'schematic' ? <SchematicView /> : <BreadboardView />}
```

Also add view toggle buttons in the header.

- [ ] **Step 7: Commit**

```bash
git add src/views/BreadboardView/ src/App.tsx tests/views/BreadboardView.test.tsx
git commit -m "feat: add Canvas breadboard view with auto-placement and wire coloring"
```

---

## Task 9: Oscilloscope Panel

**Files:**
- Create: `src/views/Oscilloscope/ProbeManager.ts`
- Create: `src/views/Oscilloscope/WaveformCanvas.tsx`
- Create: `src/views/Oscilloscope/OscilloscopePanel.tsx`
- Create: `src/views/Oscilloscope/OscilloscopePanel.module.css`
- Test: `tests/views/Oscilloscope.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write ProbeManager test**

Create: `tests/views/Oscilloscope.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { ProbeManager, Probe } from '@/views/Oscilloscope/ProbeManager';
import type { ComponentId, PinId } from '@/types/circuit';

describe('ProbeManager', () => {
  it('should add a probe', () => {
    const manager = new ProbeManager();
    manager.addProbe('comp1' as ComponentId, 'pin_0' as PinId);

    expect(manager.getProbes()).toHaveLength(1);
    expect(manager.getProbes()[0].componentId).toBe('comp1');
  });

  it('should limit to 4 probes', () => {
    const manager = new ProbeManager();
    for (let i = 0; i < 5; i++) {
      manager.addProbe(`comp${i}` as ComponentId, 'pin_0' as PinId);
    }

    expect(manager.getProbes()).toHaveLength(4);
  });

  it('should remove a probe', () => {
    const manager = new ProbeManager();
    manager.addProbe('comp1' as ComponentId, 'pin_0' as PinId);
    manager.addProbe('comp2' as ComponentId, 'pin_0' as PinId);

    manager.removeProbe(0);
    expect(manager.getProbes()).toHaveLength(1);
    expect(manager.getProbes()[0].componentId).toBe('comp2');
  });

  it('should store samples in rolling buffer', () => {
    const manager = new ProbeManager();
    manager.addProbe('comp1' as ComponentId, 'pin_0' as PinId);

    for (let i = 0; i < 100; i++) {
      manager.pushSample(0, i);
    }

    const samples = manager.getSamples(0);
    expect(samples).toHaveLength(100);
    expect(samples[0]).toBe(0);
    expect(samples[99]).toBe(99);
  });

  it('should cap rolling buffer at 10000 samples', () => {
    const manager = new ProbeManager();
    manager.addProbe('comp1' as ComponentId, 'pin_0' as PinId);

    for (let i = 0; i < 12000; i++) {
      manager.pushSample(0, i);
    }

    const samples = manager.getSamples(0);
    expect(samples.length).toBeLessThanOrEqual(10000);
  });

  it('should assign correct colors to channels', () => {
    const manager = new ProbeManager();
    manager.addProbe('comp1' as ComponentId, 'pin_0' as PinId);
    manager.addProbe('comp2' as ComponentId, 'pin_0' as PinId);

    expect(manager.getProbes()[0].color).toBe('#00FF00'); // green
    expect(manager.getProbes()[1].color).toBe('#FFFF00'); // yellow
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/views/Oscilloscope.test.tsx`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement ProbeManager**

Create: `src/views/Oscilloscope/ProbeManager.ts`

```typescript
import type { ComponentId, PinId } from '@/types/circuit';

const CHANNEL_COLORS = ['#00FF00', '#FFFF00', '#00FFFF', '#FF00FF'];
const MAX_PROBES = 4;
const MAX_SAMPLES = 10000;

export interface Probe {
  componentId: ComponentId;
  pinId: PinId;
  color: string;
  samples: number[];
}

export class ProbeManager {
  private probes: Probe[] = [];

  addProbe(componentId: ComponentId, pinId: PinId): void {
    if (this.probes.length >= MAX_PROBES) return;

    this.probes.push({
      componentId,
      pinId,
      color: CHANNEL_COLORS[this.probes.length],
      samples: [],
    });
  }

  removeProbe(index: number): void {
    this.probes.splice(index, 1);
    // Reassign colors
    this.probes.forEach((p, i) => {
      p.color = CHANNEL_COLORS[i];
    });
  }

  getProbes(): Probe[] {
    return this.probes;
  }

  pushSample(probeIndex: number, voltage: number): void {
    const probe = this.probes[probeIndex];
    if (!probe) return;

    probe.samples.push(voltage);
    if (probe.samples.length > MAX_SAMPLES) {
      probe.samples = probe.samples.slice(-MAX_SAMPLES);
    }
  }

  getSamples(probeIndex: number): number[] {
    return this.probes[probeIndex]?.samples ?? [];
  }

  clear(): void {
    this.probes = [];
  }
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/views/Oscilloscope.test.tsx`
Expected: PASS

- [ ] **Step 5: Create WaveformCanvas component**

Create: `src/views/Oscilloscope/WaveformCanvas.tsx`

```tsx
import { useRef, useEffect } from 'react';
import type { Probe } from './ProbeManager';

interface WaveformCanvasProps {
  probes: Probe[];
  timeScale: number;  // ms per division
  voltScale: number;  // volts per division
  supplyVoltage: number;
}

const DIVISIONS_X = 10;
const DIVISIONS_Y = 8;

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  probes,
  timeScale,
  voltScale,
  supplyVoltage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);

    const divWidth = width / DIVISIONS_X;
    const divHeight = height / DIVISIONS_Y;

    for (let i = 1; i < DIVISIONS_X; i++) {
      ctx.beginPath();
      ctx.moveTo(i * divWidth, 0);
      ctx.lineTo(i * divWidth, height);
      ctx.stroke();
    }

    for (let i = 1; i < DIVISIONS_Y; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * divHeight);
      ctx.lineTo(width, i * divHeight);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Center line (0V reference)
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Render each probe's waveform
    const samplesPerPixel = Math.max(1, Math.floor(
      (timeScale / 1000) * 48000 / width * DIVISIONS_X
    ));

    for (const probe of probes) {
      if (probe.samples.length === 0) continue;

      ctx.strokeStyle = probe.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const totalVisibleSamples = Math.floor(width * samplesPerPixel);
      const startIndex = Math.max(0, probe.samples.length - totalVisibleSamples);

      for (let px = 0; px < width; px++) {
        const sampleIndex = startIndex + Math.floor(px * samplesPerPixel);
        if (sampleIndex >= probe.samples.length) break;

        const voltage = probe.samples[sampleIndex];
        // Map voltage to Y: center = supplyVoltage/2, scale by voltScale
        const centerVoltage = supplyVoltage / 2;
        const normalizedV = (voltage - centerVoltage) / (voltScale * (DIVISIONS_Y / 2));
        const y = height / 2 - normalizedV * (height / 2);

        if (px === 0) {
          ctx.moveTo(px, y);
        } else {
          ctx.lineTo(px, y);
        }
      }

      ctx.stroke();
    }
  }, [probes, timeScale, voltScale, supplyVoltage]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={200}
      style={{ background: '#1a1a1a', borderRadius: '4px' }}
    />
  );
};
```

- [ ] **Step 6: Create OscilloscopePanel component**

Create: `src/views/Oscilloscope/OscilloscopePanel.module.css`

```css
.panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1a1a1a;
  border-top: 2px solid #333;
  z-index: 90;
  transition: height 0.3s;
}

.panel.collapsed {
  height: 32px;
}

.panel.expanded {
  height: 240px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: #222;
  border-bottom: 1px solid #333;
  height: 32px;
}

.title {
  color: #aaa;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.toggleBtn {
  background: none;
  border: 1px solid #555;
  color: #aaa;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}

.toggleBtn:hover {
  background: #333;
}

.content {
  display: flex;
  height: calc(100% - 32px);
  padding: 8px;
  gap: 12px;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 120px;
}

.controlLabel {
  color: #888;
  font-size: 11px;
}

.controlSelect {
  background: #333;
  color: #ccc;
  border: 1px solid #555;
  padding: 2px 4px;
  font-size: 11px;
  border-radius: 3px;
}

.probeBtn {
  background: #333;
  color: #aaa;
  border: 1px solid #555;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}

.probeBtn:hover {
  background: #444;
}

.probeList {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.probeItem {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #ccc;
}

.probeColor {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.waveform {
  flex: 1;
}

.scaleControls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 100px;
}
```

Create: `src/views/Oscilloscope/OscilloscopePanel.tsx`

```tsx
import { useState } from 'react';
import { WaveformCanvas } from './WaveformCanvas';
import type { ProbeManager } from './ProbeManager';
import styles from './OscilloscopePanel.module.css';

interface OscilloscopePanelProps {
  probeManager: ProbeManager;
  supplyVoltage: number;
  onAddProbe: () => void;
}

export const OscilloscopePanel: React.FC<OscilloscopePanelProps> = ({
  probeManager,
  supplyVoltage,
  onAddProbe,
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const [timeScale, setTimeScale] = useState(10); // ms/div
  const [voltScale, setVoltScale] = useState(2);  // V/div

  const probes = probeManager.getProbes();

  return (
    <div className={`${styles.panel} ${collapsed ? styles.collapsed : styles.expanded}`}>
      <div className={styles.header}>
        <span className={styles.title}>Oscilloscope</span>
        <button
          className={styles.toggleBtn}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <div className={styles.content}>
          <div className={styles.controls}>
            <button className={styles.probeBtn} onClick={onAddProbe}>
              + Add Probe
            </button>
            <div className={styles.probeList}>
              {probes.map((probe, i) => (
                <div key={i} className={styles.probeItem}>
                  <span
                    className={styles.probeColor}
                    style={{ background: probe.color }}
                  />
                  <span>Ch {i + 1}</span>
                  <button
                    className={styles.probeBtn}
                    onClick={() => probeManager.removeProbe(i)}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.waveform}>
            <WaveformCanvas
              probes={probes}
              timeScale={timeScale}
              voltScale={voltScale}
              supplyVoltage={supplyVoltage}
            />
          </div>

          <div className={styles.scaleControls}>
            <div>
              <div className={styles.controlLabel}>Time/div</div>
              <select
                className={styles.controlSelect}
                value={timeScale}
                onChange={(e) => setTimeScale(Number(e.target.value))}
              >
                <option value={1}>1ms</option>
                <option value={2}>2ms</option>
                <option value={5}>5ms</option>
                <option value={10}>10ms</option>
                <option value={20}>20ms</option>
                <option value={50}>50ms</option>
                <option value={100}>100ms</option>
              </select>
            </div>
            <div>
              <div className={styles.controlLabel}>Volts/div</div>
              <select
                className={styles.controlSelect}
                value={voltScale}
                onChange={(e) => setVoltScale(Number(e.target.value))}
              >
                <option value={0.5}>0.5V</option>
                <option value={1}>1V</option>
                <option value={2}>2V</option>
                <option value={5}>5V</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 7: Add OscilloscopePanel to App**

Modify: `src/App.tsx`

```typescript
// Add imports
import { OscilloscopePanel } from './views/Oscilloscope/OscilloscopePanel';
import { ProbeManager } from './views/Oscilloscope/ProbeManager';

// Add ref for probe manager
const probeManagerRef = useRef(new ProbeManager());

// Add to render (outside main content, at bottom):
<OscilloscopePanel
  probeManager={probeManagerRef.current}
  supplyVoltage={9}
  onAddProbe={() => { /* Enter probe mode — click on wire to probe */ }}
/>
```

- [ ] **Step 8: Commit**

```bash
git add src/views/Oscilloscope/ tests/views/Oscilloscope.test.tsx src/App.tsx
git commit -m "feat: add oscilloscope panel with waveform display and probe management"
```

---

## Task 10: Integration — Wire Everything Together

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/context/CircuitContext.tsx`
- Modify: `src/views/SchematicView.tsx`
- Modify: `src/views/SchematicView/DraggableComponent.tsx`
- Modify: `src/views/SchematicView/Toolbar.tsx`

This task connects the simulation engine, audio engine, oscilloscope, breadboard view, and interactive controls into a working system.

- [ ] **Step 1: Add simulation + audio lifecycle to App**

Modify: `src/App.tsx`

```typescript
// Add imports
import { SimulationEngine } from './simulation/SimulationEngine';
import { AudioEngine } from './audio/AudioEngine';
import { AudioBridge } from './audio/AudioBridge';

// Inside AppContent:
const simulationRef = useRef(new SimulationEngine());
const audioEngineRef = useRef(new AudioEngine());
const audioBridgeRef = useRef(new AudioBridge());

// Connect simulation to audio bridge
useEffect(() => {
  const sim = simulationRef.current;
  const bridge = audioBridgeRef.current;
  const audio = audioEngineRef.current;

  // When bridge has a full buffer, send to audio worklet
  bridge.onBufferReady((samples) => {
    audio.sendSamples(samples);
  });

  // Wire simulation sample output through bridge
  sim.setSampleCallback((samples) => {
    for (let i = 0; i < samples.length; i++) {
      bridge.pushSample(samples[i]);
    }
  });

  return () => {
    sim.stop();
    audio.close();
  };
}, []);

// Update simulation when circuit changes
useEffect(() => {
  simulationRef.current.updateCircuit(circuit);

  if (simulationRef.current.isActive()) {
    audioEngineRef.current.initialize().then(() => {
      audioEngineRef.current.resume();
      simulationRef.current.start();
    });
  } else {
    simulationRef.current.stop();
    audioEngineRef.current.suspend();
  }
}, [circuit]);

// Feed oscilloscope probes from simulation
useEffect(() => {
  const sim = simulationRef.current;
  const probes = probeManagerRef.current.getProbes();

  // Sample probes each animation frame
  let frameId: number;
  const sampleProbes = () => {
    for (let i = 0; i < probes.length; i++) {
      const voltage = sim.probeSample(probes[i].componentId, probes[i].pinId);
      probeManagerRef.current.pushSample(i, voltage);
    }
    frameId = requestAnimationFrame(sampleProbes);
  };

  if (sim.isActive() && probes.length > 0) {
    sampleProbes();
  }

  return () => cancelAnimationFrame(frameId);
}, [circuit]);
```

- [ ] **Step 2: Add LED visual state to SchematicView**

Modify: `src/views/SchematicView/DraggableComponent.tsx`

For LED components, check simulation state to determine on/off visual:

```typescript
// Add LED glow effect when simulation indicates it's on
const isLedOn = component.type === 'led' &&
  simulationEngine?.getNetVoltage(component.id, component.pins[0].id) -
  simulationEngine?.getNetVoltage(component.id, component.pins[1].id) > 2.0;

// In render, add glow filter to LED when on:
{isLedOn && (
  <circle
    cx={0}
    cy={0}
    r={15}
    fill={component.parameters.color as string || 'red'}
    opacity={0.3}
    filter="url(#glow)"
  />
)}
```

Add SVG glow filter definition to SchematicView:

```typescript
<defs>
  <filter id="glow">
    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
    <feMerge>
      <feMergeNode in="coloredBlur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
</defs>
```

- [ ] **Step 3: Add undo/redo buttons to Toolbar**

Modify: `src/views/SchematicView/Toolbar.tsx`

Add undo/redo buttons with disabled state:

```typescript
<button
  onClick={undo}
  disabled={!canUndo}
  title="Undo (Ctrl+Z)"
>
  Undo
</button>
<button
  onClick={redo}
  disabled={!canRedo}
  title="Redo (Ctrl+Shift+Z)"
>
  Redo
</button>
```

Add view toggle button:

```typescript
<button onClick={() => setActiveView(v => v === 'schematic' ? 'breadboard' : 'schematic')}>
  {activeView === 'schematic' ? 'Breadboard' : 'Schematic'} (Tab)
</button>
```

- [ ] **Step 4: Add audio controls to App header**

Add a volume slider and mute button to the app header:

```typescript
<div className="audio-controls">
  <button onClick={() => audioBridgeRef.current.setMuted(!audioBridgeRef.current.isMuted())}>
    {audioBridgeRef.current.isMuted() ? 'Unmute' : 'Mute'}
  </button>
  <input
    type="range"
    min="0"
    max="1"
    step="0.01"
    defaultValue="1"
    onChange={(e) => audioBridgeRef.current.setVolume(Number(e.target.value))}
  />
</div>
```

- [ ] **Step 5: Run all tests**

Run: `npm test -- --run`
Expected: All tests PASS

- [ ] **Step 6: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Run dev server and verify visually**

Run: `npm run dev`
Expected: App loads, schematic view works, breadboard view accessible via Tab, oscilloscope panel at bottom

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/views/SchematicView/ src/context/CircuitContext.tsx
git commit -m "feat: integrate simulation engine, audio output, oscilloscope, and interactive controls"
```

---

## Task Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Net Analyzer (union-find) | None |
| 2 | Simulation Engine | Task 1 |
| 3 | Audio Engine (Bridge + Worklet) | None |
| 4 | New Components (2N3904, 1N914, Audio Output, LED) | None |
| 5 | Undo/Redo System | None |
| 6 | Parameter Parser & Interactive Controls | None |
| 7 | Breadboard Auto-Placement | None |
| 8 | Breadboard View (Canvas rendering) | Task 7 |
| 9 | Oscilloscope Panel | None |
| 10 | Integration — Wire Everything Together | Tasks 1-9 |

**Parallelizable groups:**
- Tasks 1, 3, 4, 5, 6, 7, 9 are independent — can be worked in parallel
- Task 2 depends on Task 1
- Task 8 depends on Task 7
- Task 10 depends on all others

---

**End of Implementation Plan**
