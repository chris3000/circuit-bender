import { MNASolver, type SerializedComponent, type SerializedConnection } from '../solver/MNASolver';
import { createStandardModels } from '../models/standardModels';
import { measureSignal, type SignalReading } from './signal';

export interface BenchOptions {
  /** How long to run the circuit for. A circuit starts settled, so a steady one needs only a moment. */
  seconds?: number;
  sampleRate?: number;
  /** Pins whose voltage is recorded all the way through, to be read with `volts`. */
  watch?: Array<{ componentId: string; pinId: string }>;
  /** Live controls put somewhere else than the circuit has them: a switch closed, a knob turned. */
  set?: Array<{ componentId: string; parameter: string; value: number }>;
}

/** What was seen of a circuit while it ran on the bench. */
export interface BenchRun {
  /** Average current through a part with two legs, first pin to second, in amps (0 for a part that cannot say). */
  amps(componentId: string): number;
  /** Average voltage across a part with two legs, first pin minus second. */
  across(componentId: string): number;
  /** How hard a part was driven on average, against what a real one stands (over 1 is too hard). */
  strain(componentId: string): number;
  /** A watched pin's voltage: level, swing and frequency. */
  volts(componentId: string, pinId: string): SignalReading;
  /** What came out of the audio output (a rail-to-rail swing is ±0.5). */
  sound: SignalReading;
  seconds: number;
}

const DEFAULT_SECONDS = 0.02;

/**
 * Run a circuit by itself, away from the sound card, and read it: the
 * currents, voltages and frequencies a class or a test wants to know. It is
 * the same solver and the same models as the playing circuit, stepped the
 * same way.
 */
export function runOnBench(
  components: readonly SerializedComponent[], connections: readonly SerializedConnection[], options: BenchOptions = {},
): BenchRun {
  const sampleRate = options.sampleRate ?? 48000;
  const seconds = options.seconds ?? DEFAULT_SECONDS;
  const steps = Math.max(1, Math.round(seconds * sampleRate));
  const dt = 1 / sampleRate;

  const solver = new MNASolver(createStandardModels());
  solver.loadCircuit(components.map((c) => ({ ...c, parameters: { ...c.parameters } })), [...connections]);
  for (const change of options.set ?? []) solver.updateParam(change.componentId, change.parameter, change.value);

  const parts = components.map((component) => {
    const model = solver.getModel(component.id);
    const twoLegs = component.pins.length === 2;
    return {
      id: component.id,
      model,
      nodes: twoLegs ? [solver.pinNode(component.id, component.pins[0].id), solver.pinNode(component.id, component.pins[1].id)] : null,
      amps: 0, across: 0, strain: 0,
    };
  });
  const watched = (options.watch ?? []).map((pin) => ({
    key: `${pin.componentId}::${pin.pinId}`,
    node: solver.pinNode(pin.componentId, pin.pinId),
    trace: new Float32Array(steps),
  }));
  const sound = new Float32Array(steps);

  for (let i = 0; i < steps; i++) {
    sound[i] = solver.step(dt);
    const x = solver.getSolutionVector();
    for (const part of parts) {
      if (part.model?.current) part.amps += part.model.current(x);
      if (part.model?.strain) part.strain += part.model.strain(x);
      if (part.nodes) part.across += solver.getNodeVoltage(part.nodes[0]) - solver.getNodeVoltage(part.nodes[1]);
    }
    for (const pin of watched) pin.trace[i] = solver.getNodeVoltage(pin.node);
  }

  const byId = new Map(parts.map((part) => [part.id, part]));
  const mean = (id: string, key: 'amps' | 'across' | 'strain') => {
    const value = (byId.get(id)?.[key] ?? 0) / steps;
    return Number.isFinite(value) ? value : 0;
  };
  return {
    amps: (id) => mean(id, 'amps'),
    across: (id) => mean(id, 'across'),
    strain: (id) => mean(id, 'strain'),
    volts: (componentId, pinId) => {
      const pin = watched.find((w) => w.key === `${componentId}::${pinId}`);
      return pin ? measureSignal(pin.trace, sampleRate) : { mean: 0, min: 0, max: 0, hertz: null };
    },
    sound: measureSignal(sound, sampleRate),
    seconds,
  };
}
