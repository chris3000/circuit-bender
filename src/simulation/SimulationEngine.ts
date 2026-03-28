import { NetAnalyzer } from '@/simulation/NetAnalyzer';
import type { Net } from '@/simulation/NetAnalyzer';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import type {
  ComponentId,
  PinId,
  Component,
  PinStates,
} from '@/types/circuit';

const OUTPUT_COMPONENT_TYPES = new Set<string>([
  'audio-output',
  'led',
  'test-output',
]);

export type SampleCallback = (sample: number) => void;

export class SimulationEngine {
  private circuit: Circuit;
  private active = false;
  private netVoltages: Map<number, number> = new Map();
  private pinVoltages: Map<string, number> = new Map(); // "compId::pinId" -> voltage
  private analyzer: NetAnalyzer | null = null;
  private sampleCallback: SampleCallback | null = null;
  private animationFrameId: number | null = null;
  private running = false;

  constructor(circuit: Circuit) {
    this.circuit = circuit;
  }

  static registerOutputType(type: string): void {
    OUTPUT_COMPONENT_TYPES.add(type);
  }

  setCircuit(circuit: Circuit): void {
    this.circuit = circuit;
    this.analyzer = null; // invalidate cached analyzer
  }

  setSampleCallback(callback: SampleCallback): void {
    this.sampleCallback = callback;
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Run a single evaluation pass: rebuild nets, determine activation,
   * resolve voltages, and run component simulate functions.
   */
  evaluate(): void {
    if (!this.analyzer) {
      const connections = this.circuit.getConnections();
      this.analyzer = new NetAnalyzer(connections);
    }
    const nets = this.analyzer.getNets();
    const components = this.circuit.getComponents();

    // Determine activation: active if any output component is on a net
    this.active = this.hasOutputOnNet(components, nets);

    if (!this.active) {
      this.netVoltages.clear();
      this.pinVoltages.clear();
      return;
    }

    // Phase 1: Resolve supply voltages and ground onto nets
    this.resolveSupplyVoltages(components, nets);

    // Phase 2: Propagate net voltages to pin voltages
    this.propagateNetVoltages(nets);

    // Phase 3: Run component simulate functions
    this.simulateComponents(components);

    // Phase 4: Propagate component output voltages across nets
    this.propagateNetVoltages(nets);
  }

  /**
   * Get the resolved voltage for every net (keyed by net id).
   */
  getNetVoltages(): Map<number, number> {
    return new Map(this.netVoltages);
  }

  /**
   * Probe the voltage at a specific component pin.
   */
  probeSample(componentId: ComponentId, pinId: PinId): number {
    const key = `${componentId}::${pinId}`;
    return this.pinVoltages.get(key) ?? 0;
  }

  /**
   * Read the supply voltage from the first power-supply component found.
   */
  getSupplyVoltage(): number {
    const components = this.circuit.getComponents();
    for (const comp of components) {
      if (comp.type === 'power') {
        return (comp.parameters.voltage as number) ?? 0;
      }
    }
    return 0;
  }

  /**
   * Start the simulation loop using requestAnimationFrame.
   * Each frame processes a batch of 128 samples.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  /**
   * Stop the simulation loop.
   */
  stop(): void {
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // --- private methods ---

  private tick(): void {
    if (!this.running) return;

    // Evaluate circuit state once per frame
    this.evaluate();

    if (this.sampleCallback && this.active) {
      // Generate ~800 audio samples per frame (~48kHz at 60fps)
      // The CD40106 simulate advances its phase counter each call
      const BATCH_SIZE = 800;
      const components = this.circuit.getComponents();
      const registry = ComponentRegistry.getInstance();

      for (let i = 0; i < BATCH_SIZE; i++) {
        // Re-run only IC components to advance oscillator state
        for (const comp of components) {
          const def = registry.get(comp.type);
          if (!def || def.metadata.category !== 'ic') continue;

          const inputs: PinStates = {};
          for (let j = 0; j < comp.pins.length; j++) {
            const key = `${comp.id}::${comp.pins[j].id}`;
            inputs[`pin_${j}`] = {
              voltage: this.pinVoltages.get(key) ?? 0,
              current: 0,
            };
          }

          const outputs = def.simulate(inputs, comp.parameters);
          const mapped = this.mapOutputsToActualPins(outputs, comp);

          for (const [pinId, state] of mapped) {
            const key = `${comp.id}::${pinId}`;
            this.pinVoltages.set(key, state.voltage);

            const net = this.analyzer?.getNetForPin(
              comp.id as ComponentId,
              pinId
            );
            if (net) {
              this.netVoltages.set(net.id, state.voltage);
            }
          }
        }

        // Propagate IC outputs to connected pins (like audio output)
        if (this.analyzer) {
          for (const net of this.analyzer.getNets()) {
            const voltage = this.netVoltages.get(net.id) ?? 0;
            for (const pin of net.pins) {
              this.pinVoltages.set(`${pin.componentId}::${pin.pinId}`, voltage);
            }
          }
        }

        this.sampleCallback(this.getOutputSample());
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.tick());
  }

  private getOutputSample(): number {
    const supplyVoltage = this.getSupplyVoltage() || 9;
    const components = this.circuit.getComponents();
    for (const comp of components) {
      if (OUTPUT_COMPONENT_TYPES.has(comp.type)) {
        if (comp.pins.length > 0) {
          const key = `${comp.id}::${comp.pins[0].id}`;
          const voltage = this.pinVoltages.get(key) ?? 0;
          // Normalize voltage to [-1, 1] audio range
          const sample = (voltage / supplyVoltage) * 2 - 1;
          return Math.max(-1, Math.min(1, sample));
        }
      }
    }
    return 0;
  }

  private hasOutputOnNet(components: Component[], nets: Net[]): boolean {
    // Collect component IDs that are output types
    const outputIds = new Set<string>();
    for (const comp of components) {
      if (OUTPUT_COMPONENT_TYPES.has(comp.type)) {
        outputIds.add(comp.id);
      }
    }
    if (outputIds.size === 0) return false;

    // Check if any output component pin appears on any net
    for (const net of nets) {
      for (const pin of net.pins) {
        if (outputIds.has(pin.componentId)) {
          return true;
        }
      }
    }
    return false;
  }

  /** Map generic pin_N keys from simulate() to actual component pin IDs */
  private mapOutputsToActualPins(
    outputs: PinStates,
    comp: Component
  ): Map<PinId, { voltage: number; current: number }> {
    const mapped = new Map<PinId, { voltage: number; current: number }>();
    for (const key of Object.keys(outputs)) {
      // key is like "pin_0", "pin_1", "pin_12" etc.
      const index = parseInt(key.replace('pin_', ''), 10);
      if (!isNaN(index) && index < comp.pins.length) {
        mapped.set(comp.pins[index].id, outputs[key]);
      }
    }
    return mapped;
  }

  private resolveSupplyVoltages(components: Component[], nets: Net[]): void {
    this.netVoltages.clear();
    const registry = ComponentRegistry.getInstance();

    for (const comp of components) {
      // Skip non-power/ground components
      if (comp.type !== 'power' && comp.type !== 'ground') continue;

      const def = registry.get(comp.type);
      if (!def) continue;

      // Run simulate to get pin output voltages
      const inputs: PinStates = {};
      for (const pin of comp.pins) {
        inputs[pin.id] = { voltage: 0, current: 0 };
      }
      const outputs = def.simulate(inputs, comp.parameters);
      const mapped = this.mapOutputsToActualPins(outputs, comp);

      // Assign their output voltage to the net
      for (const [pinId, state] of mapped) {
        const net = this.analyzer?.getNetForPin(
          comp.id as ComponentId,
          pinId
        );
        if (net) {
          this.netVoltages.set(net.id, state.voltage);
        }
      }
    }
  }

  private propagateNetVoltages(nets: Net[]): void {
    this.pinVoltages.clear();
    for (const net of nets) {
      const voltage = this.netVoltages.get(net.id) ?? 0;
      for (const pin of net.pins) {
        const key = `${pin.componentId}::${pin.pinId}`;
        this.pinVoltages.set(key, voltage);
      }
    }
  }

  private simulateComponents(components: Component[]): void {
    const registry = ComponentRegistry.getInstance();

    for (const comp of components) {
      // Skip supply/ground — already resolved
      if (comp.type === 'power' || comp.type === 'ground') continue;
      // Skip output components — they read but don't transform the signal
      if (OUTPUT_COMPONENT_TYPES.has(comp.type)) continue;

      const def = registry.get(comp.type);
      if (!def) continue;

      // Build inputs using generic pin_N keys (what simulate() expects)
      const inputs: PinStates = {};
      for (let i = 0; i < comp.pins.length; i++) {
        const key = `${comp.id}::${comp.pins[i].id}`;
        inputs[`pin_${i}`] = {
          voltage: this.pinVoltages.get(key) ?? 0,
          current: 0,
        };
      }

      const outputs = def.simulate(inputs, comp.parameters);
      const mapped = this.mapOutputsToActualPins(outputs, comp);

      // Only active components (ICs, transistors) write to net voltages.
      // Passive components (resistors, capacitors) only update their own pin state.
      const isActive = def.metadata.category === 'ic' || def.metadata.category === 'active';

      for (const [pinId, state] of mapped) {
        const key = `${comp.id}::${pinId}`;
        this.pinVoltages.set(key, state.voltage);

        if (isActive) {
          const net = this.analyzer?.getNetForPin(
            comp.id as ComponentId,
            pinId
          );
          if (net) {
            this.netVoltages.set(net.id, state.voltage);
          }
        }
      }
    }
  }
}
