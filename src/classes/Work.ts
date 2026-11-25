import type { Circuit } from '@/models/Circuit';
import type { Component } from '@/types/circuit';
import { runOnBench, type BenchOptions, type BenchRun } from '@/simulation/measure/bench';
import { serializeCircuit } from '@/utils/serializeCircuit';

/** What is going on around the circuit, as far as a class can ask. */
export interface Situation {
  /** The circuit is running. */
  playing: boolean;
  /** Nothing has changed since the circuit was last saved. */
  saved: boolean;
  /** The view being looked at. */
  view: 'schematic' | 'board' | 'cover';
  /** The parts that are selected. */
  selected: readonly string[];
  /** The wires that are selected: a selected wire is read by the meter. */
  wires?: readonly string[];
  /** The pins the scope has probes on. */
  probes?: ReadonlyArray<{ componentId: string; pinId: string }>;
  /** The sound is close to breaking up, or is: the circuit is about as large as the computer can play. */
  strained?: boolean;
  /** The jumper the bend tool is holding between two pins, while it holds one. */
  bend?: { from: { componentId: string; pinId: string }; to: { componentId: string; pinId: string }; ohms: number } | null;
}

export const NOWHERE: Situation = { playing: false, saved: false, view: 'schematic', selected: [] };

type ControlChange = NonNullable<BenchOptions['set']>[number];

// A circuit never changes (an edit makes a new one), so what it measured once it measures always
const runs = new WeakMap<Circuit, Map<string, BenchRun>>();

/** A run that read nothing: for a circuit the bench could not make sense of. */
const NOTHING: BenchRun = {
  amps: () => 0, across: () => 0, strain: () => 0,
  volts: () => ({ mean: 0, min: 0, max: 0, hertz: null }),
  sound: { mean: 0, min: 0, max: 0, hertz: null },
  seconds: 0, sampleRate: 48000,
  trace: () => null, ampsTrace: () => null, soundTrace: new Float32Array(0),
};

/** A pin of a part, by its place among the part's pins. */
export type PinOf = readonly [part: Component, pin: number];

/** How a class asks for a run: pins by their place among a part's pins. */
export interface BenchRequest extends Omit<BenchOptions, 'watch'> {
  watch?: PinOf[];
}

/**
 * The learner's work, as a class sees it: what is on the canvas, what is
 * wired to what, and what the circuit does when it is run. Everything a
 * step, an experiment or a check asks, it asks here.
 */
export class Work {
  private netOf: Map<string, string> | null = null;

  constructor(readonly circuit: Circuit, readonly situation: Situation = NOWHERE) {}

  /** Every part of a kind, in the order they were put down. */
  parts(type: string): Component[] {
    return this.circuit.getComponents().filter((c) => c.type === type);
  }

  /** The net a pin is on: pins joined by wire share one, and every ground is the same one. */
  net(part: Component, pin: number): string {
    if (!this.netOf) this.netOf = this.findNets();
    return this.netOf.get(`${part.id}::${part.pins[pin]?.id}`) ?? `${part.id}::${pin}`;
  }

  joined(a: Component, pinA: number, b: Component, pinB: number): boolean {
    return this.net(a, pinA) === this.net(b, pinB);
  }

  /** Whether a pin is wired to ground. */
  grounded(part: Component, pin: number): boolean {
    return this.net(part, pin) === GROUND;
  }

  /**
   * Whether some part of one kind is wired, by one of the given pins, to
   * some part of another. `apart` is nets that do not count (two parts that
   * both hang off the supply are not thereby wired to each other).
   */
  wired(typeA: string, pinsA: number[], typeB: string, pinsB: number[], apart: string[] = []): boolean {
    for (const a of this.parts(typeA)) {
      for (const pinA of pinsA) {
        const net = this.net(a, pinA);
        if (apart.includes(net)) continue;
        for (const b of this.parts(typeB)) {
          if (b.id !== a.id && pinsB.some((pinB) => this.net(b, pinB) === net)) return true;
        }
      }
    }
    return false;
  }

  /** Whether the meter is reading this pin: a selected wire is on its net. */
  metered(part: Component, pin: number): boolean {
    const net = this.net(part, pin);
    const selected = this.situation.wires ?? [];
    return this.circuit.getConnections().some((c) =>
      selected.includes(c.id) && this.netOf!.get(`${c.from.componentId}::${c.from.pinId}`) === net);
  }

  /**
   * The jumper being held with the bend tool, as the two nets it joins and
   * its resistance; null when none is held.
   */
  bent(): { nets: [string, string]; ohms: number } | null {
    const bend = this.situation.bend;
    if (!bend) return null;
    if (!this.netOf) this.netOf = this.findNets();
    const a = this.netOf.get(`${bend.from.componentId}::${bend.from.pinId}`);
    const b = this.netOf.get(`${bend.to.componentId}::${bend.to.pinId}`);
    return a !== undefined && b !== undefined && a !== b ? { nets: [a, b], ohms: bend.ohms } : null;
  }

  /** Whether the scope has a probe on this pin's net. */
  probed(part: Component, pin: number): boolean {
    const net = this.net(part, pin);
    return (this.situation.probes ?? []).some((probe) => this.netOf!.get(`${probe.componentId}::${probe.pinId}`) === net);
  }

  /**
   * The circuit run on the bench for a moment: as it stands, or with some
   * of its controls put another way (every switch closed, say).
   */
  run(set: ControlChange[] = [], seconds?: number): BenchRun {
    return this.bench({ set, seconds });
  }

  /**
   * The circuit run on the bench, any way the bench can run it: for longer,
   * with pins and currents recorded, with a button pressed part of the way
   * through. A run is kept: asking again for the same one costs nothing.
   */
  bench(request: BenchRequest = {}): BenchRun {
    const watch = (request.watch ?? []).map(([part, pin]) => ({ componentId: part.id, pinId: part.pins[pin]?.id ?? '' }));
    const options: BenchOptions = { ...request, watch };
    const key = JSON.stringify(options);
    let cache = runs.get(this.circuit);
    if (!cache) runs.set(this.circuit, cache = new Map());
    let run = cache.get(key);
    if (!run) {
      try {
        const { components, connections } = serializeCircuit(this.circuit);
        run = runOnBench(components, connections, options);
      } catch {
        run = NOTHING; // half-built circuits can be anything at all
      }
      cache.set(key, run);
    }
    return run;
  }

  private findNets(): Map<string, string> {
    const parent = new Map<string, string>();
    const find = (key: string): string => {
      let root = key;
      while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
      parent.set(key, root);
      return root;
    };
    const join = (a: string, b: string) => {
      const ra = find(a), rb = find(b);
      // Ground stays the name of its net
      if (ra === GROUND) parent.set(rb, ra); else parent.set(ra, rb);
    };
    parent.set(GROUND, GROUND);
    for (const c of this.circuit.getConnections()) {
      join(`${c.from.componentId}::${c.from.pinId}`, `${c.to.componentId}::${c.to.pinId}`);
    }
    for (const part of this.circuit.getComponents()) {
      if (part.type === 'ground') for (const pin of part.pins) join(`${part.id}::${pin.id}`, GROUND);
    }
    const nets = new Map<string, string>();
    for (const part of this.circuit.getComponents()) {
      for (const pin of part.pins) nets.set(`${part.id}::${pin.id}`, find(`${part.id}::${pin.id}`));
    }
    return nets;
  }
}

/** The net every ground symbol is on. */
export const GROUND = 'ground';
