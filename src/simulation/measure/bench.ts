import { MNASolver, type SerializedComponent, type SerializedConnection } from '../solver/MNASolver';
import { createStandardModels } from '../models/standardModels';
import { measureSignal, type SignalReading } from './signal';

export interface BenchOptions {
  /** How long to run the circuit for. A circuit starts settled, so a steady one needs only a moment. */
  seconds?: number;
  sampleRate?: number;
  /** Pins whose voltage is recorded all the way through, to be read with `volts`. */
  watch?: Array<{ componentId: string; pinId: string }>;
  /**
   * Controls put somewhere else than the circuit has them: a switch closed, a
   * knob turned. The circuit starts settled with them there.
   */
  set?: Array<{ componentId: string; parameter: string; value: number }>;
  /**
   * Live controls worked while it runs: a button pressed at `at` seconds and
   * let go later. The circuit has settled as `set` leaves it before the first.
   */
  events?: Array<{ at: number; componentId: string; parameter: string; value: number }>;
  /** Two-legged parts whose current is recorded all the way through, to be read with `ampsTrace`. */
  watchAmps?: string[];
  /** A jumper held between two pins all the way through, as the bend tool holds one: not part of the circuit. */
  bend?: { from: { componentId: string; pinId: string }; to: { componentId: string; pinId: string }; ohms: number };
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
  /** Samples a second in the traces below. */
  sampleRate: number;
  /** A watched pin's voltage, sample by sample (null if it was not watched). */
  trace(componentId: string, pinId: string): Float32Array | null;
  /** A watched part's current, sample by sample (null if it was not watched). */
  ampsTrace(componentId: string): Float32Array | null;
  /** The sound, sample by sample. */
  soundTrace: Float32Array;
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

  // The controls are put where `set` wants them before the circuit is loaded,
  // so it starts settled that way: a capacitor behind a closed switch is full
  const loaded = components.map((c) => ({ ...c, parameters: { ...c.parameters } }));
  for (const change of options.set ?? []) {
    const part = loaded.find((c) => c.id === change.componentId);
    if (part) part.parameters[change.parameter] = change.value;
  }
  const solver = new MNASolver(createStandardModels());
  solver.loadCircuit(loaded, [...connections]);
  if (options.bend) solver.setBend(options.bend.from, options.bend.to, options.bend.ohms);

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
  const watchedAmps = (options.watchAmps ?? []).map((id) => ({ id, model: solver.getModel(id), trace: new Float32Array(steps) }));
  const sound = new Float32Array(steps);
  const events = [...(options.events ?? [])].sort((a, b) => a.at - b.at);
  let nextEvent = 0;

  for (let i = 0; i < steps; i++) {
    while (nextEvent < events.length && events[nextEvent].at <= i * dt) {
      const event = events[nextEvent++];
      solver.updateParam(event.componentId, event.parameter, event.value);
    }
    sound[i] = solver.step(dt);
    const x = solver.getSolutionVector();
    for (const part of parts) {
      if (part.model?.current) part.amps += part.model.current(x);
      if (part.model?.strain) part.strain += part.model.strain(x);
      if (part.nodes) part.across += solver.getNodeVoltage(part.nodes[0]) - solver.getNodeVoltage(part.nodes[1]);
    }
    for (const pin of watched) pin.trace[i] = solver.getNodeVoltage(pin.node);
    for (const part of watchedAmps) part.trace[i] = part.model?.current ? part.model.current(x) : 0;
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
    sampleRate,
    trace: (componentId, pinId) => watched.find((w) => w.key === `${componentId}::${pinId}`)?.trace ?? null,
    ampsTrace: (id) => watchedAmps.find((w) => w.id === id)?.trace ?? null,
    soundTrace: sound,
  };
}
