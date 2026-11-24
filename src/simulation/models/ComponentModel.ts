/**
 * A component model stamps itself into the MNA system  G·x = b.
 *
 * Stamps are split by how often they change, so the solver can cache the
 * factorized matrix and only redo the work that actually changed:
 *
 *  - stampMatrix:    entries that do not depend on the solution x. They may
 *                    depend on dt, the integration method, parameters, and the
 *                    model's discrete state (see getDiscreteState).
 *  - stampRhs:       right-hand-side entries that do not depend on x
 *                    (source values, companion-model history). Once per step.
 *                    Omit it (and postStep) if the model has nothing to do there.
 *  - stampNonlinear: everything that depends on x. Every Newton iteration.
 *                    Only called when `nonlinear` is true.
 *
 * Discrete behaviour (a Schmitt trigger flipping, a clamp engaging) is
 * expressed as events rather than by reading x inside a stamp: the solver asks
 * each model where along a step its state would change, moves the solution to
 * that instant, lets the model flip, and carries on from there. That is what
 * gives edges sub-sample timing.
 */
export interface ComponentModel {
  readonly type: string;
  /** True if the model has x-dependent stamps and needs Newton iteration. */
  readonly nonlinear: boolean;
  /**
   * True if a pin with nothing wired to it has no effect on this model. The
   * solver then gives such pins no node (they are reported as node -1 with
   * `pinConnected` false), which keeps unused IC gates out of the matrix.
   */
  readonly ignoresUnconnectedPins?: boolean;

  getInternalNodeCount(): number;
  getBranchCount(): number;
  /**
   * `pinConnected[i]` is false when pin i is wired to nothing at all. Models
   * may use it to skip work for unused sections (spare gates of an IC); it is
   * omitted when unknown, in which case every pin should be treated as used.
   */
  init(
    pinNodes: number[],
    internalNodeStart: number,
    branchStart: number,
    params: Record<string, number>,
    pinConnected?: boolean[]
  ): void;

  /** `be` selects backward Euler (true) or trapezoidal (false) companion models. */
  stampMatrix(G: Float64Array[], dt: number, be: boolean): void;
  stampRhs?(b: Float64Array, dt: number, be: boolean): void;
  stampNonlinear?(G: Float64Array[], b: Float64Array, x: Float64Array, dt: number): void;
  /**
   * Every node stampNonlinear reads or writes (ground, −1, may be included).
   * Required when `nonlinear` is true: the solver confines Newton iteration to
   * these nodes, so a stamp outside them would be lost.
   */
  getNonlinearNodes?(): number[];

  /** Commit an accepted solve of length dt as the new history state. */
  postStep?(x: Float64Array, dt: number, be?: boolean): void;
  /**
   * For a part that has gain round a node of its own (an op-amp's gain node).
   * Called before each step with a function that says how a node answers a
   * current pushed into it, with the circuit in its present state and at the
   * step about to be taken (volts per amp). A healthy node answers with a
   * positive number. A negative one means the feedback round the node is
   * positive and faster than the step: the true circuit would run away from
   * where it is, and backward Euler would instead hold it there for good. The
   * part must then make the move itself, as an event (see OpAmpModel).
   */
  watchFeedback?(response: (node: number) => number): void;

  /**
   * The solution was moved to x by interpolation (to an event instant), not by
   * a solve. Update voltage history; currents are re-established by the
   * backward-Euler step the solver takes next.
   *
   * `elapsed` is how much time went by in getting there (seconds; it may be
   * 0), for models that keep a clock of their own: a signal source, anything
   * with a lag. It is left out when the circuit is being put at its starting
   * point, which is no time at all.
   */
  syncState?(x: Float64Array, elapsed?: number): void;

  /**
   * Integer signature of the discrete state that stampMatrix/stampRhs depend
   * on. Required for models that implement findEvent.
   */
  getDiscreteState?(): number;
  /**
   * Given the solution at the start (x0) and end (x1) of a step, return the
   * fraction in [0, 1] at which this model's discrete state first changes,
   * assuming x moves linearly between them. Return Infinity if it does not.
   */
  findEvent?(x0: Float64Array, x1: Float64Array): number;
  /** Apply every state change that the last findEvent placed at or before `fraction`. */
  applyEvent?(fraction: number): void;

  convergenceError(xOld: Float64Array, xNew: Float64Array): number;
  reset(): void;

  /**
   * For a part with two legs: the current through it at the solution x, from
   * its first pin to its second, in amps. What a meter in line with it reads.
   */
  current?(x: Float64Array): number;
  /**
   * How hard the part is being driven at x, as a fraction of what a real one
   * stands: held above 1 it would be damaged. Nothing in the simulation
   * depends on it; the "!" beside a part on the canvas is drawn from it.
   */
  strain?(x: Float64Array): number;
}
