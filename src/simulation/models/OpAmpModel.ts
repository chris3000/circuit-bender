import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

/**
 * Op-Amp model — moderate-gain VCCS approach.
 *
 * Uses a direct voltage-controlled current source with gain Av=1000 (60dB).
 * This is enough for feedback circuits to work accurately (<0.2% error)
 * without the numerical challenges of 200K open-loop gain + compensation cap.
 *
 * For an inverting amp with gain -R2/R1 = -1:
 *   Actual gain = -R2/R1 × Av/(Av + 1 + R2/R1) = -0.998
 *
 * No internal nodes needed. Output clamps to supply rails.
 */

export interface OpAmpParams {
  Rin: number;     // Differential input resistance
  Av: number;      // Open-loop voltage gain
  Rout: number;    // Output resistance
}

export const OPAMP_LM741_PARAMS: OpAmpParams = {
  Rin: 500000,     // 500K differential
  Av: 1000,        // 60dB open-loop gain
  Rout: 75,        // Output resistance
};

export class OpAmpModel implements ComponentModel {
  readonly type = 'opamp';
  private p: OpAmpParams;

  private nInvM = -1;
  private nInvP = -1;
  private nVneg = -1;
  private nOut = -1;
  private nVpos = -1;

  constructor(params: OpAmpParams) {
    this.p = params;
  }

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {
    // Pins: IN-(0), IN+(1), V-(2), OUT(3), V+(4)
    this.nInvM = pinNodes[0];
    this.nInvP = pinNodes[1];
    this.nVneg = pinNodes[2];
    this.nOut = pinNodes[3];
    this.nVpos = pinNodes[4];
  }

  stamp(G: Float64Array[], _b: Float64Array, x: Float64Array, _dt: number): void {
    const { Rin, Av, Rout } = this.p;

    // 1. Input resistance
    stampConductance(G, this.nInvP, this.nInvM, 1 / Rin);

    // 2. Output stage: always stamp VCCS + clamp when exceeding rails
    const Gout = 1 / Rout;
    const Gm = Av * Gout;

    if (this.nOut >= 0) {
      // Self-conductance (output impedance)
      G[this.nOut][this.nOut] += Gout;

      // VCCS: always active
      if (this.nInvP >= 0) G[this.nOut][this.nInvP] += Gm;
      if (this.nInvM >= 0) G[this.nOut][this.nInvM] -= Gm;

      // Rail clamp: strong conductance to rail when output exceeds supply
      const vOut = x[this.nOut];
      const vPos = this.nVpos >= 0 ? x[this.nVpos] : 0;
      const vNeg = this.nVneg >= 0 ? x[this.nVneg] : 0;

      if (vOut > vPos) {
        stampConductance(G, this.nOut, this.nVpos, Gm); // match VCCS strength
      }
      if (vOut < vNeg) {
        stampConductance(G, this.nOut, this.nVneg, Gm); // match VCCS strength
      }
    }
  }

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
