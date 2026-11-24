import type { ComponentModel } from './ComponentModel';
import { DiodeModel, DIODE_LED_RED_PARAMS } from './DiodeModel';
import { nodeVoltage, stampConductance } from './stampUtils';

/** The cell in the dark, and the least it gets to however bright the LED. */
const DARK_OHMS = 5e6;
const BRIGHT_OHMS = 400;
/** With this much through the LED the cell is at `OHMS_AT_REFERENCE`... */
const REFERENCE_AMPS = 10e-3;
const OHMS_AT_REFERENCE = 2000;
/** ...and it falls this fast with more (a cadmium-sulphide cell's resistance goes as light to about −0.85). */
const GAMMA = 0.85;
/** A cell answers light in a few milliseconds and forgets it more slowly. */
const RISE_SECONDS = 0.004;
const FALL_SECONDS = 0.04;

/** The resistance the cell settles at with `amps` through the LED. */
export function optoOhms(amps: number): number {
  const lit = amps > 1e-9 ? OHMS_AT_REFERENCE * Math.pow(amps / REFERENCE_AMPS, -GAMMA) : Infinity;
  return Math.max(BRIGHT_OHMS, 1 / (1 / DARK_OHMS + 1 / lit));
}

/**
 * An LED facing a photocell in the dark: a homemade opto-coupler (Collins
 * tapes the two together), or a bought one, which is called a Vactrol. The
 * current through the LED sets the resistance of the cell, and nothing else
 * joins the two sides. So one circuit can turn another one down, chop it or
 * pan it without being wired to it.
 *
 * The LED is an LED. The cell is a resistor that follows the LED's current,
 * but not at once: a cadmium-sulphide cell takes milliseconds to answer and
 * tens of milliseconds to let go, which is what rounds the clicks off a
 * signal chopped this way. Because it lags, its resistance during a step is
 * simply what the light up to then has made it.
 *
 * Pins: A (0), K (1) of the LED; 1 (2), 2 (3) of the cell.
 */
export class OptoCouplerModel implements ComponentModel {
  readonly type = 'optocoupler';
  readonly nonlinear = true;

  private readonly led = new DiodeModel(DIODE_LED_RED_PARAMS);
  private n1 = -1;
  private n2 = -1;
  private conductance = 1 / DARK_OHMS;

  getInternalNodeCount(): number { return this.led.getInternalNodeCount(); }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], internalNodeStart: number, branchStart: number, params: Record<string, number>): void {
    this.led.init([pinNodes[0], pinNodes[1]], internalNodeStart, branchStart, params);
    this.n1 = pinNodes[2];
    this.n2 = pinNodes[3];
    this.reset();
  }

  stampMatrix(G: Float64Array[], dt: number, be: boolean): void {
    this.led.stampMatrix(G, dt, be);
  }

  getNonlinearNodes(): number[] {
    return [...this.led.getNonlinearNodes(), this.n1, this.n2];
  }

  stampNonlinear(G: Float64Array[], b: Float64Array, x: Float64Array, dt: number): void {
    this.led.stampNonlinear(G, b, x, dt);
    // The cell changes all the time, so it is stamped here, where that costs
    // nothing, and not in the matrix, which would have to be inverted again
    stampConductance(G, this.n1, this.n2, this.conductance);
  }

  postStep(x: Float64Array, dt: number): void {
    this.led.postStep(x, dt);
    this.follow(x, dt);
  }

  syncState(x: Float64Array, elapsed?: number): void {
    this.led.syncState(x);
    // At the start the cell has had all the time it wants to settle
    this.follow(x, elapsed === undefined ? Infinity : elapsed);
  }

  /** Move the cell towards what the LED's light would make it, for `seconds`. */
  private follow(x: Float64Array, seconds: number): void {
    if (seconds <= 0) return;
    const target = 1 / optoOhms(Math.max(0, this.led.current(x)));
    const lag = target > this.conductance ? RISE_SECONDS : FALL_SECONDS;
    this.conductance += (target - this.conductance) * (1 - Math.exp(-seconds / lag));
  }

  convergenceError(xOld: Float64Array, xNew: Float64Array): number {
    return this.led.convergenceError(xOld, xNew);
  }

  /** The current through the LED, anode to cathode. */
  ledAmps(x: Float64Array): number { return this.led.current(x); }
  /** What the cell is now. */
  getResistance(): number { return 1 / this.conductance; }
  /** Through the cell, from its first pin to its second. */
  cellAmps(x: Float64Array): number {
    return (nodeVoltage(x, this.n1) - nodeVoltage(x, this.n2)) * this.conductance;
  }

  strain(x: Float64Array): number { return this.led.strain(x); }

  reset(): void {
    this.led.reset();
    this.conductance = 1 / DARK_OHMS;
  }
}
