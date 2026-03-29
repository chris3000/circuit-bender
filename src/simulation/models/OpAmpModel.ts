import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';
import { BOLTZMANN_VOLTAGE, linearizeJunction } from './junctionUtils';

export interface OpAmpParams {
  Aol: number; GBW: number; Rin: number; Rout: number; SR: number; Cc: number;
  clampIs?: number; clampN?: number;
}

export const OPAMP_LM741_PARAMS: OpAmpParams = {
  Aol: 200000, GBW: 1.5e6, Rin: 2e6, Rout: 75, SR: 0.5e6, Cc: 30e-12,
  clampIs: 1e-12, clampN: 1,
};

export class OpAmpModel implements ComponentModel {
  readonly type = 'opamp';
  private params: OpAmpParams;
  private fp: number;
  private Rg: number;
  private gm: number;
  private Imax: number;
  private Vclip: number;

  private nInvM = -1;
  private nInvP = -1;
  private nVneg = -1;
  private nOut = -1;
  private nVpos = -1;
  private nGain = -1;

  private ccVprev = 0;
  private ccIprev = 0;

  constructor(params: OpAmpParams) {
    this.params = params;
    this.fp = params.GBW / params.Aol;
    this.Rg = 1 / (2 * Math.PI * this.fp * params.Cc);
    this.gm = params.Aol / this.Rg;
    this.Imax = params.SR * params.Cc;
    this.Vclip = this.Imax / this.gm;
  }

  getInternalNodeCount(): number { return 1; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {
    if (pinNodes.length >= 8) {
      // DIP8 package: NC(0), IN-(1), IN+(2), V-(3), NC(4), OUT(5), V+(6), NC(7)
      this.nInvM = pinNodes[1];
      this.nInvP = pinNodes[2];
      this.nVneg = pinNodes[3];
      this.nOut = pinNodes[5];
      this.nVpos = pinNodes[6];
    } else {
      // Simplified 5-pin (used in tests): IN-(0), IN+(1), V-(2), OUT(3), V+(4)
      this.nInvM = pinNodes[0];
      this.nInvP = pinNodes[1];
      this.nVneg = pinNodes[2];
      this.nOut = pinNodes[3];
      this.nVpos = pinNodes[4];
    }
    this.nGain = internalNodeStart;
  }

  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, dt: number): void {
    const p = this.params;
    const g = this.nGain;

    // 1. Input resistance between IN+ and IN-
    stampConductance(G, this.nInvP, this.nInvM, 1 / p.Rin);

    // 2. Input VCCS with slew limiting
    const vP = this.nInvP >= 0 ? x[this.nInvP] : 0;
    const vM = this.nInvM >= 0 ? x[this.nInvM] : 0;
    const vDiff = vP - vM;

    if (Math.abs(vDiff) < this.Vclip) {
      // Linear region: stamp gm as transconductance into gain node
      if (g >= 0 && this.nInvP >= 0) G[g][this.nInvP] += this.gm;
      if (g >= 0 && this.nInvM >= 0) G[g][this.nInvM] -= this.gm;
    } else {
      // Slew region: constant current source
      if (g >= 0) b[g] += vDiff > 0 ? this.Imax : -this.Imax;
    }

    // 3. Gain node load resistance to ground
    if (g >= 0) G[g][g] += 1 / this.Rg;

    // 4. Compensation capacitor (trapezoidal companion)
    if (g >= 0) {
      const Geq = 2 * p.Cc / dt;
      G[g][g] += Geq;
      const Ieq = Geq * this.ccVprev + this.ccIprev;
      b[g] += Ieq;
    }

    // 5. Output buffer (Norton equivalent: voltage follower from gain node)
    const Gout = 1 / p.Rout;
    if (this.nOut >= 0) G[this.nOut][this.nOut] += Gout;
    if (this.nOut >= 0 && g >= 0) G[this.nOut][g] += Gout;

    // 6. Rail clamp diodes: prevent output from exceeding supply rails
    this.stampClampDiode(G, b, x, this.nOut, this.nVpos);  // OUT -> V+ (high clamp)
    this.stampClampDiode(G, b, x, this.nVneg, this.nOut);  // V- -> OUT (low clamp)
  }

  private stampClampDiode(
    G: Float64Array[], b: Float64Array, x: Float64Array,
    nAnode: number, nCathode: number
  ): void {
    const Is = this.params.clampIs ?? 1e-12;
    const n = this.params.clampN ?? 1;
    const vA = nAnode >= 0 ? x[nAnode] : 0;
    const vK = nCathode >= 0 ? x[nCathode] : 0;
    const vd = vA - vK;

    // Skip if deeply reverse-biased (no conduction)
    if (vd < -0.5) return;

    const { Gd, Ieq } = linearizeJunction(vd, Is, n, BOLTZMANN_VOLTAGE);
    stampConductance(G, nAnode, nCathode, Gd);
    stampCurrentSource(b, nCathode, nAnode, Ieq);
  }

  postStep(x: Float64Array, dt: number): void {
    if (this.nGain >= 0) {
      const vGain = x[this.nGain];
      const Geq = 2 * this.params.Cc / dt;
      const iCc = Geq * (vGain - this.ccVprev) - this.ccIprev;
      this.ccVprev = vGain;
      this.ccIprev = iCc;
    }
  }

  convergenceError(xOld: Float64Array, xNew: Float64Array): number {
    if (this.nGain < 0) return 0;
    return Math.abs(xNew[this.nGain] - xOld[this.nGain]);
  }

  reset(): void {
    this.ccVprev = 0;
    this.ccIprev = 0;
  }
}
