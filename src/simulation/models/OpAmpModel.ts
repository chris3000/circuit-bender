import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';
import { crossingFraction, PwlClamp } from './eventUtils';

/**
 * Op-amp macromodel (after Boyle), built from piecewise-linear pieces so it
 * needs no Newton iteration:
 *
 *   IN+ ─┐
 *        ├─ Rin    input stage: i = gm·(V+ − V−), limited to ±Imax (slew rate)
 *   IN− ─┘              │
 *                       ▼
 *                gain node ── Rg ── gnd      DC gain  Aol = gm·Rg
 *                    │                       dominant pole from Cc
 *                    ├─── Cc ── gnd          slew rate = Imax / Cc
 *                    ├─── clamps to the supply rails (minus headroom)
 *                    ▼
 *                unity buffer ── Rout ── OUT
 *
 * Open-loop gain, gain-bandwidth product, slew rate and output swing all fall
 * out of that structure. Saturating the input stage and clamping the gain
 * node (rather than the output) means the amplifier recovers from clipping
 * immediately instead of winding up.
 *
 * Positive feedback (a Schmitt trigger, a comparator with hysteresis, the
 * square half of a triangle oscillator) needs one thing more. Such a circuit
 * has a balance point it cannot stay on: the amplifier runs away from it in
 * under a microsecond. A solver step is ten times that, and backward Euler
 * over so long a step does the opposite: it lands on the balance point and
 * stays. So the amplifier watches how its gain node answers (`watchFeedback`),
 * and when the answer says "runaway" it snaps: an event puts the input stage
 * hard over in the direction the node is being pushed, and it slews to the
 * rail as the real one does.
 */

export interface OpAmpParams {
  Rin: number;       // Differential input resistance (Ω)
  Aol: number;       // Open-loop DC voltage gain
  GBW: number;       // Gain-bandwidth product (Hz)
  slewRate: number;  // V/s
  Cc: number;        // Compensation capacitor (F)
  Rout: number;      // Output resistance (Ω)
  headroom: number;  // How close the output can get to either rail (V)
  /** How close it can get to the negative rail, when that is not the same. */
  headroomLow?: number;
  Rsupply: number;   // What the chip draws between its supply pins at rest, as a resistance (Ω)
}

export const OPAMP_LM741_PARAMS: OpAmpParams = {
  Rin: 2e6,
  Aol: 200000,
  GBW: 1e6,
  slewRate: 0.5e6,   // 0.5 V/µs
  Cc: 30e-12,
  Rout: 75,
  headroom: 1.5,
  Rsupply: 7500,     // about 1.2 mA on 9 V
};

/**
 * One of the four amplifiers of an LM324: slow, frugal, and made for a single
 * battery. On 9 V it gets within 1.5 V of the top rail and within about a
 * volt of the bottom one while it is sinking current, which are the levels
 * Wilson measures in the Noise Toaster (+3 V and −3.5 V about its mid-rail).
 */
export const OPAMP_LM324_PARAMS: OpAmpParams = {
  Rin: 5e6,
  Aol: 100000,
  GBW: 1e6,
  slewRate: 0.4e6,   // 0.4 V/µs
  Cc: 30e-12,
  Rout: 100,
  headroom: 1.5,
  headroomLow: 1.0,
  Rsupply: 50000,    // 0.7 mA for the four on 9 V
};

/** One of the two amplifiers of a TL072: JFET inputs that draw nothing, and thirty times the 741's slew rate. */
export const OPAMP_TL072_PARAMS: OpAmpParams = {
  Rin: 1e12,
  Aol: 200000,
  GBW: 3e6,
  slewRate: 13e6,    // 13 V/µs
  Cc: 18e-12,
  Rout: 100,
  headroom: 1.5,
  Rsupply: 13000,    // 1.4 mA each on ±9 V
};

/** Conductance of the gain-node rail clamps: stiff next to the ±Imax that drives them. */
const G_RAIL = 1e-3;
/** Hysteresis (volts) on the slew-limit boundaries, against rounding-noise chatter. */
const SLEW_TOL = 1e-9;
/** A push on the gain node smaller than this fraction of the input stage's full current is no push at all. */
const SNAP_TOL = 1e-3;

export class OpAmpModel implements ComponentModel {
  readonly type = 'opamp';
  readonly nonlinear = false;

  private readonly rin: number;
  private readonly gm: number;
  private readonly iMax: number;
  private readonly vClip: number;   // input difference at which the input stage saturates
  private readonly gGain: number;   // 1 / Rg
  private readonly cc: number;
  private readonly gOut: number;
  private readonly gSupply: number;

  private nInM = -1;
  private nInP = -1;
  private nVneg = -1;
  private nOut = -1;
  private nVpos = -1;
  private nGain = -1;

  /** Input stage region: −1 slewing down, 0 linear, +1 slewing up. */
  private slew = 0;
  private slewFraction = Infinity;
  private slewTarget = 0;
  /** How the gain node answers a current pushed into it; negative when the feedback round it runs away. */
  private response = 1;
  /** Snapping: hard over because of positive feedback, until the inputs agree or a rail is reached. */
  private snapping = false;
  private snapTarget = false;
  /** The step being solved is the endless one that finds where the circuit rests. */
  private atRest = false;
  /** The rail the output last rested on (+1 high, −1 low): a snap away from it goes the other way. */
  private lastRail = 0;
  // Gain node may not rise above V+ − headroom or fall below V− + headroom
  private clampHigh: PwlClamp;
  private clampLow: PwlClamp;
  private vGainPrev = 0;

  constructor(params: OpAmpParams) {
    this.rin = params.Rin;
    this.cc = params.Cc;
    this.gm = 2 * Math.PI * params.GBW * params.Cc;
    this.iMax = params.slewRate * params.Cc;
    this.vClip = this.iMax / this.gm;
    this.gGain = this.gm / params.Aol;
    this.gOut = 1 / params.Rout;
    this.gSupply = params.Rsupply > 0 ? 1 / params.Rsupply : 0;
    this.clampHigh = new PwlClamp(G_RAIL, -params.headroom);
    this.clampLow = new PwlClamp(G_RAIL, -(params.headroomLow ?? params.headroom));
  }

  getInternalNodeCount(): number { return 1; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {
    // Pins: IN-(0), IN+(1), V-(2), OUT(3), V+(4)
    this.nInM = pinNodes[0];
    this.nInP = pinNodes[1];
    this.nVneg = pinNodes[2];
    this.nOut = pinNodes[3];
    this.nVpos = pinNodes[4];
    this.nGain = internalNodeStart;
    this.reset();
  }

  stampMatrix(G: Float64Array[], dt: number, _be: boolean): void {
    const g = this.nGain;

    stampConductance(G, this.nInP, this.nInM, 1 / this.rin);
    // Quiescent current: nothing to an ideal supply, everything to a starved one
    stampConductance(G, this.nVpos, this.nVneg, this.gSupply);

    // Input stage: current gm·(V+ − V−) INTO the gain node while unsaturated.
    // Rows are "current leaving the node", so IN+ enters with a minus sign.
    if (this.slew === 0) {
      if (this.nInP >= 0) G[g][this.nInP] -= this.gm;
      if (this.nInM >= 0) G[g][this.nInM] += this.gm;
    }

    // Gain node: Rg and Cc to ground. The compensation capacitor is always
    // integrated with backward Euler: closed-loop poles sit far above the
    // audio band, and backward Euler damps them where trapezoidal would ring.
    G[g][g] += this.gGain + this.cc / dt;
    this.clampHigh.stampMatrix(G, g, this.nVpos);
    this.clampLow.stampMatrix(G, this.nVneg, g);

    // Output: unity buffer from the gain node through Rout (does not load the gain node)
    if (this.nOut >= 0) {
      G[this.nOut][this.nOut] += this.gOut;
      G[this.nOut][g] -= this.gOut;
      // What the output delivers comes from the supply pins, half from each,
      // and not out of thin air: a circuit whose "ground" is only a pair of
      // resistors across a battery would otherwise have it pushed about by
      // every load the amplifier drives.
      const half = this.gOut / 2;
      for (const rail of [this.nVpos, this.nVneg]) {
        if (rail < 0) continue;
        G[rail][g] += half;
        G[rail][this.nOut] -= half;
      }
    }
  }

  stampRhs(b: Float64Array, dt: number, _be: boolean): void {
    const g = this.nGain;
    this.atRest = !Number.isFinite(dt);
    b[g] += (this.cc / dt) * this.vGainPrev + this.slew * this.iMax;
    this.clampHigh.stampRhs(b, g, this.nVpos);
    this.clampLow.stampRhs(b, this.nVneg, g);
  }

  postStep(x: Float64Array, _dt: number): void {
    this.vGainPrev = x[this.nGain];
  }

  syncState(x: Float64Array): void {
    this.vGainPrev = x[this.nGain];
  }

  watchFeedback(response: (node: number) => number): void {
    this.response = response(this.nGain);
  }

  getDiscreteState(): number {
    return (this.slew + 1) | (this.clampHigh.on ? 4 : 0) | (this.clampLow.on ? 8 : 0);
  }

  /** The current the input stage and Rg between them push into the gain node, unsaturated. */
  private push(x: Float64Array): number {
    return this.gm * this.inputDifference(x) - this.gGain * x[this.nGain];
  }

  findEvent(x0: Float64Array, x1: Float64Array): number {
    const d0 = this.inputDifference(x0);
    const d1 = this.inputDifference(x1);
    const clip = this.vClip;
    this.snapTarget = this.snapping;
    if (this.clampHigh.on) this.lastRail = 1;
    else if (this.clampLow.on) this.lastRail = -1;

    let f = Infinity;
    if (this.slew === 0 && this.response < 0 && !this.clampHigh.on && !this.clampLow.on) {
      // Positive feedback, faster than the step: snap, the way the gain node
      // is being pushed. On the balance point itself nothing pushes: then it
      // leaves the rail it was on, or (at the very start) goes up.
      const push = this.push(x0);
      this.slewTarget = Math.abs(push) > SNAP_TOL * this.iMax ? Math.sign(push) : this.lastRail !== 0 ? -this.lastRail : 1;
      this.snapTarget = true;
      this.slewFraction = 0;
      this.clampHigh.noEvent();
      this.clampLow.noEvent();
      return 0;
    }
    // A snap lasts until the inputs have come apart as far as a slewing amplifier's are: from there it is one
    if (this.snapping && this.slew * d0 > clip) {
      this.snapping = false;
      this.snapTarget = false;
    }
    if (this.snapping) {
      // Until then only a push the other way turns it round
      const tol = SNAP_TOL * this.iMax;
      f = crossingFraction(-this.slew * this.push(x0) - tol, -this.slew * this.push(x1) - tol);
      this.slewTarget = -this.slew;
    } else if (this.slew === 0) {
      const up = crossingFraction(d0 - clip - SLEW_TOL, d1 - clip - SLEW_TOL);
      const down = crossingFraction(-d0 - clip - SLEW_TOL, -d1 - clip - SLEW_TOL);
      if (up <= down) { f = up; this.slewTarget = 1; } else { f = down; this.slewTarget = -1; }
    } else if (this.slew > 0) {
      f = crossingFraction(clip - d0 - SLEW_TOL, clip - d1 - SLEW_TOL);
      this.slewTarget = 0;
    } else {
      f = crossingFraction(d0 + clip - SLEW_TOL, d1 + clip - SLEW_TOL);
      this.slewTarget = 0;
    }
    this.slewFraction = f;

    const fh = this.clampHigh.findEvent(x0, x1, this.nGain, this.nVpos);
    if (fh < f) f = fh;
    const fl = this.clampLow.findEvent(x0, x1, this.nVneg, this.nGain);
    if (fl < f) f = fl;
    return f;
  }

  applyEvent(fraction: number): void {
    let high = false, low = false;
    if (this.slewFraction <= fraction) {
      this.slew = this.slewTarget;
      this.snapping = this.snapTarget && this.slew !== 0;
      if (this.snapping) this.lastRail = 0;
      this.slewFraction = Infinity;
      if (this.snapping && this.atRest) {
        // Given for ever, a snap ends on the rail
        if (this.slew > 0) { this.clampHigh.on = true; high = true; } else { this.clampLow.on = true; low = true; }
      }
    }
    high = this.clampHigh.applyEvent(fraction) || high;
    low = this.clampLow.applyEvent(fraction) || low;
    // On a rail the snap is over: the clamp holds the node, and the input stage goes back to following the inputs
    if ((high && this.clampHigh.on) || (low && this.clampLow.on)) this.snapping = false;
  }

  private inputDifference(x: Float64Array): number {
    return (this.nInP >= 0 ? x[this.nInP] : 0) - (this.nInM >= 0 ? x[this.nInM] : 0);
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.slew = 0;
    this.slewFraction = Infinity;
    this.slewTarget = 0;
    this.clampHigh.reset();
    this.clampLow.reset();
    this.vGainPrev = 0;
    this.response = 1;
    this.snapping = false;
    this.snapTarget = false;
    this.atRest = false;
    this.lastRail = 0;
  }
}
