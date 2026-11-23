import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';
import { crossingFraction, PwlClamp } from './eventUtils';

const R_DIVIDER = 5000;        // each of the three resistors that give the chip its name
const R_RESET_PULLUP = 100e3;  // RESET left open reads high
const V_RESET = 0.7;           // RESET below this (above GND) forces the output low
const R_SUPPLY = 2000;         // what the rest of the chip draws: a few mA
const G_OUT_HIGH = 0.1;        // output follower: 10 Ω ...
const V_OUT_DROP = 1.3;        // ... and two diode drops below VCC
const G_OUT_LOW = 0.1;         // output and discharge transistors, saturated
const G_DISCHARGE = 0.05;
const G_OFF = 1e-9;
/** Hysteresis (volts) that keeps a comparator from flip-flopping on rounding noise. */
const TOL = 1e-7;

/**
 * Fraction at which two quantities moving linearly (a0→a1, b0→b1) are first
 * both positive; Infinity if that does not happen in the step.
 */
function bothPositive(a0: number, a1: number, b0: number, b1: number): number {
  const fa = crossingFraction(a0, a1), fb = crossingFraction(b0, b1);
  if (fa === Infinity || fb === Infinity) return Infinity;
  const t = Math.max(fa, fb);
  // One may have been positive at the start and no longer be by then
  return a0 + t * (a1 - a0) >= 0 && b0 + t * (b1 - b0) >= 0 ? t : Infinity;
}

/**
 * NE555 timer, as its block diagram: a 5k–5k–5k divider setting two
 * comparator levels (CTRL at ⅔ of the supply, half of that for the trigger),
 * a flip-flop, an output stage and a discharge transistor.
 *
 *  - TRIG below ½·CTRL sets the flip-flop: OUT high, DISCH open.
 *  - THRES above CTRL resets it (unless TRIG is still low): OUT low, DISCH to ground.
 *  - RESET low forces it reset.
 *
 * The comparators switch at the exact instant of the crossing (solver events).
 * The output swings from about 0 V to VCC − 1.3 V, as the bipolar part does.
 *
 * Pins: TRIG (0), THRES (1), RESET (2), CTRL (3), DISCH (4), OUT (5), VCC (6), GND (7).
 */
export class Timer555Model implements ComponentModel {
  readonly type = 'ne555';
  readonly nonlinear = false;

  private nTrig = -1; private nThres = -1; private nReset = -1; private nCtrl = -1;
  private nDisch = -1; private nOut = -1; private nVcc = -1; private nGnd = -1;

  /** The flip-flop: true while the output is high. */
  private set = false;
  private flipFraction = Infinity;
  /** The output follower conducts only while it has something to pull up. */
  private follower = new PwlClamp(G_OUT_HIGH, V_OUT_DROP);

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[]): void {
    [this.nTrig, this.nThres, this.nReset, this.nCtrl, this.nDisch, this.nOut, this.nVcc, this.nGnd] = pinNodes;
    this.reset();
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    stampConductance(G, this.nVcc, this.nCtrl, 1 / R_DIVIDER);
    stampConductance(G, this.nCtrl, this.nGnd, 1 / (2 * R_DIVIDER));
    stampConductance(G, this.nReset, this.nVcc, 1 / R_RESET_PULLUP);
    stampConductance(G, this.nVcc, this.nGnd, 1 / R_SUPPLY);
    if (this.set) {
      this.follower.stampMatrix(G, this.nVcc, this.nOut);
      stampConductance(G, this.nOut, this.nGnd, G_OFF);
      stampConductance(G, this.nDisch, this.nGnd, G_OFF);
    } else {
      stampConductance(G, this.nOut, this.nGnd, G_OUT_LOW);
      stampConductance(G, this.nDisch, this.nGnd, G_DISCHARGE);
    }
  }

  stampRhs(b: Float64Array, _dt: number, _be: boolean): void {
    if (this.set) this.follower.stampRhs(b, this.nVcc, this.nOut);
  }

  getDiscreteState(): number {
    return (this.set ? 1 : 0) | (this.follower.on ? 2 : 0);
  }

  findEvent(x0: Float64Array, x1: Float64Array): number {
    const at = (x: Float64Array, node: number) => (node >= 0 ? x[node] : 0);
    const gnd0 = at(x0, this.nGnd), gnd1 = at(x1, this.nGnd);
    const ctrl0 = at(x0, this.nCtrl) - gnd0, ctrl1 = at(x1, this.nCtrl) - gnd1;
    // Each is positive while its comparator is asserted
    const trig0 = ctrl0 / 2 - (at(x0, this.nTrig) - gnd0) - TOL, trig1 = ctrl1 / 2 - (at(x1, this.nTrig) - gnd1) - TOL;
    const thres0 = at(x0, this.nThres) - gnd0 - ctrl0 - TOL, thres1 = at(x1, this.nThres) - gnd1 - ctrl1 - TOL;
    const reset0 = V_RESET - (at(x0, this.nReset) - gnd0) - TOL, reset1 = V_RESET - (at(x1, this.nReset) - gnd1) - TOL;

    let f: number;
    if (this.set) {
      // Reset by RESET going low, or by THRES while TRIG is not holding it set
      f = Math.min(crossingFraction(reset0, reset1), bothPositive(thres0, thres1, -trig0, -trig1));
      const follow = this.follower.findEvent(x0, x1, this.nVcc, this.nOut);
      this.flipFraction = f;
      return Math.min(f, follow);
    }
    // Set by TRIG, unless RESET is holding it
    f = bothPositive(trig0, trig1, -reset0, -reset1);
    this.flipFraction = f;
    this.follower.noEvent();
    return f;
  }

  applyEvent(fraction: number): void {
    if (this.flipFraction <= fraction) {
      this.set = !this.set;
      this.flipFraction = Infinity;
      // The follower starts off; if there is something to pull up it comes
      // on at once, as an event of its own
      this.follower.reset();
      return;
    }
    this.follower.applyEvent(fraction);
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.set = false;
    this.flipFraction = Infinity;
    this.follower.reset();
  }

  /** Whether the output is high. */
  isSet(): boolean { return this.set; }
}
