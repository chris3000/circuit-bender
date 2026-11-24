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
  seconds: 0,
};

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

  /**
   * The circuit run on the bench for a moment: as it stands, or with some
   * of its controls put another way (every switch closed, say).
   */
  run(set: ControlChange[] = [], seconds?: number): BenchRun {
    const key = JSON.stringify([set.map((c) => [c.componentId, c.parameter, c.value]), seconds ?? 0]);
    let cache = runs.get(this.circuit);
    if (!cache) runs.set(this.circuit, cache = new Map());
    let run = cache.get(key);
    if (!run) {
      try {
        const { components, connections } = serializeCircuit(this.circuit);
        run = runOnBench(components, connections, { set, seconds });
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
