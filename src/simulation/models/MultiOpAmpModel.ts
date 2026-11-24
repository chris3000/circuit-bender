import type { ComponentModel } from './ComponentModel';
import { OpAmpModel, type OpAmpParams } from './OpAmpModel';

/** How many states one amplifier can be in (see OpAmpModel.getDiscreteState). */
const STATES = 16;

/**
 * Several op-amps in one package, sharing their supply pins: a TL072 (two),
 * an LM324 (four). Each is an `OpAmpModel` of its own.
 *
 * Pins: for each amplifier IN−, IN+, OUT; then V+, V−. An amplifier with
 * nothing wired to it is left out; an input with nothing on it sits at 0 V.
 */
export class MultiOpAmpModel implements ComponentModel {
  readonly nonlinear = false;
  readonly ignoresUnconnectedPins = true;

  private readonly amps: OpAmpModel[];
  private active: OpAmpModel[] = [];
  /** The internal nodes of the amplifiers left out, which still need pinning down. */
  private idle: number[] = [];

  constructor(readonly type: string, params: OpAmpParams, private readonly count: number) {
    this.amps = Array.from({ length: count }, () => new OpAmpModel(params));
  }

  getInternalNodeCount(): number { return this.count; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[], internalNodeStart: number, branchStart: number,
    params: Record<string, number>, pinConnected?: boolean[],
  ): void {
    const vPos = pinNodes[this.count * 3], vNeg = pinNodes[this.count * 3 + 1];
    this.active = [];
    this.idle = [];
    this.amps.forEach((amp, i) => {
      const pins = [i * 3, i * 3 + 1, i * 3 + 2];
      if (pinConnected && !pins.some((pin) => pinConnected[pin])) {
        this.idle.push(internalNodeStart + i);
        return;
      }
      // An OpAmpModel's own order: IN−, IN+, V−, OUT, V+
      amp.init([pinNodes[pins[0]], pinNodes[pins[1]], vNeg, pinNodes[pins[2]], vPos], internalNodeStart + i, branchStart, params);
      this.active.push(amp);
    });
  }

  stampMatrix(G: Float64Array[], dt: number, be: boolean): void {
    for (const amp of this.active) amp.stampMatrix(G, dt, be);
    for (const node of this.idle) G[node][node] += 1;
  }

  stampRhs(b: Float64Array, dt: number, be: boolean): void {
    for (const amp of this.active) amp.stampRhs(b, dt, be);
  }

  postStep(x: Float64Array, dt: number): void {
    for (const amp of this.active) amp.postStep(x, dt);
  }

  syncState(x: Float64Array): void {
    for (const amp of this.active) amp.syncState(x);
  }

  watchFeedback(response: (node: number) => number): void {
    for (const amp of this.active) amp.watchFeedback(response);
  }

  getDiscreteState(): number {
    let state = 0;
    for (const amp of this.active) state = state * STATES + amp.getDiscreteState();
    return state;
  }

  findEvent(x0: Float64Array, x1: Float64Array): number {
    let first = Infinity;
    for (const amp of this.active) first = Math.min(first, amp.findEvent(x0, x1));
    return first;
  }

  applyEvent(fraction: number): void {
    for (const amp of this.active) amp.applyEvent(fraction);
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    for (const amp of this.amps) amp.reset();
  }
}
