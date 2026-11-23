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
 */

export interface OpAmpParams {
  Rin: number;       // Differential input resistance (Ω)
  Aol: number;       // Open-loop DC voltage gain
  GBW: number;       // Gain-bandwidth product (Hz)
  slewRate: number;  // V/s
  Cc: number;        // Compensation capacitor (F)
  Rout: number;      // Output resistance (Ω)
  headroom: number;  // How close the output can get to either rail (V)
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

/** Conductance of the gain-node rail clamps: stiff next to the ±Imax that drives them. */
const G_RAIL = 1e-3;
/** Hysteresis (volts) on the slew-limit boundaries, against rounding-noise chatter. */
const SLEW_TOL = 1e-9;

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
    this.clampLow = new PwlClamp(G_RAIL, -params.headroom);
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
    }
  }

  stampRhs(b: Float64Array, dt: number, _be: boolean): void {
    const g = this.nGain;
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

  getDiscreteState(): number {
    return (this.slew + 1) | (this.clampHigh.on ? 4 : 0) | (this.clampLow.on ? 8 : 0);
  }

  findEvent(x0: Float64Array, x1: Float64Array): number {
    const d0 = this.inputDifference(x0);
    const d1 = this.inputDifference(x1);
    const clip = this.vClip;

    let f = Infinity;
    if (this.slew === 0) {
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
    if (this.slewFraction <= fraction) {
      this.slew = this.slewTarget;
      this.slewFraction = Infinity;
    }
    this.clampHigh.applyEvent(fraction);
    this.clampLow.applyEvent(fraction);
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
  }
}
