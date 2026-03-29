import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';
import { BOLTZMANN_VOLTAGE, computeVcrit, limitJunctionVoltage, linearizeJunction } from './junctionUtils';

export interface BJTParams {
  IS: number; BF: number; NF: number; VAF: number; IKF: number;
  BR: number; NR: number; VAR: number; RB: number; RC: number; RE: number;
  Vt?: number;
}

export const BJT_2N3904_PARAMS: BJTParams = {
  IS: 6.734e-15, BF: 416.4, NF: 1.0, VAF: 74.03, IKF: 0.06678,
  BR: 0.7389, NR: 1.0, VAR: 28, RB: 10, RC: 1, RE: 0.1,
};

export class BJTModel implements ComponentModel {
  readonly type = 'bjt';
  private params: BJTParams;
  private VcritF: number;
  private VcritR: number;
  private nB = -1; private nC = -1; private nE = -1;
  private nBp = -1; private nCp = -1; private nEp = -1;
  private vbePrev = 0; private vbcPrev = 0;

  constructor(params: BJTParams) {
    this.params = params;
    const Vt = params.Vt ?? BOLTZMANN_VOLTAGE;
    this.VcritF = computeVcrit(params.IS, params.NF, Vt);
    this.VcritR = computeVcrit(params.IS, params.NR, Vt);
  }

  getInternalNodeCount(): number { return 3; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {
    this.nB = pinNodes[0]; this.nC = pinNodes[1]; this.nE = pinNodes[2];
    this.nBp = internalNodeStart; this.nCp = internalNodeStart + 1; this.nEp = internalNodeStart + 2;
  }

  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const p = this.params;
    const Vt = p.Vt ?? BOLTZMANN_VOLTAGE;
    const Bp = this.nBp, Cp = this.nCp, Ep = this.nEp;

    // 1. Parasitic resistances
    stampConductance(G, this.nB, this.nBp, 1 / p.RB);
    stampConductance(G, this.nC, this.nCp, 1 / p.RC);
    stampConductance(G, this.nE, this.nEp, 1 / p.RE);

    // 2. Junction voltages at intrinsic nodes with limiting
    const vBp = Bp >= 0 ? x[Bp] : 0;
    const vCp = Cp >= 0 ? x[Cp] : 0;
    const vEp = Ep >= 0 ? x[Ep] : 0;

    let vbe = vBp - vEp;
    let vbc = vBp - vCp;

    vbe = limitJunctionVoltage(vbe, this.vbePrev, p.NF * Vt, this.VcritF);
    vbc = limitJunctionVoltage(vbc, this.vbcPrev, p.NR * Vt, this.VcritR);

    // Update limiting references within the NR loop for better convergence
    this.vbePrev = vbe;
    this.vbcPrev = vbc;

    // 3. Linearize junctions
    const beJunc = linearizeJunction(vbe, p.IS, p.NF, Vt);
    const bcJunc = linearizeJunction(vbc, p.IS, p.NR, Vt);

    // 4. Base charge factor (Gummel-Poon)
    const q1inv = 1 - vbc / p.VAF - vbe / p.VAR;
    const q1 = q1inv > 1e-6 ? 1 / q1inv : 1e6;
    const q2 = beJunc.Id / p.IKF;
    const sqrtArg = Math.sqrt(Math.max(1 + 4 * q2, 0));
    const qb = Math.max((q1 / 2) * (1 + sqrtArg), 1e-6);

    // 5. Transport current
    const It = (beJunc.Id - bcJunc.Id) / qb;

    // Terminal currents
    const Ic = It - bcJunc.Id / p.BR;
    const Ib = beJunc.Id / p.BF + bcJunc.Id / p.BR;
    // Ie = -(Ic + Ib) -- enforced by KCL through correction stamps below

    // 6. Stamp BE junction as linearized diode (conductance + current source)
    // This provides the NR conductance path Bp <-> Ep
    stampConductance(G, Bp, Ep, beJunc.Gd);
    // Companion: Ieq_be flows from Ep to Bp (diode reverse current convention)
    stampCurrentSource(b, Ep, Bp, beJunc.Ieq);

    // 7. Stamp BC junction as linearized diode (conductance + current source)
    // This provides the NR conductance path Bp <-> Cp
    stampConductance(G, Bp, Cp, bcJunc.Gd);
    stampCurrentSource(b, Cp, Bp, bcJunc.Ieq);

    // 8. Transport current correction
    // The junction diodes above model currents as if both junctions are
    // independent. The actual BJT has different terminal currents due to
    // the transport mechanism. We add correction current sources to
    // adjust from the diode model to the actual BJT terminal currents.
    //
    // Diode model gives at Bp: -(Id_be + Id_bc) (both junctions sink from Bp)
    //                    at Ep: +Id_be
    //                    at Cp: +Id_bc
    //
    // Actual BJT: at Bp: -Ib, at Cp: -Ic, at Ep: -Ie = Ic+Ib
    //
    // Correction = actual - diode:
    //   at Bp: -Ib - (-(Id_be + Id_bc)) = -Ib + Id_be + Id_bc
    //   at Cp: -Ic - Id_bc
    //   at Ep: (Ic + Ib) - Id_be

    const corrBp = -Ib + beJunc.Id + bcJunc.Id;
    const corrCp = -Ic - bcJunc.Id;
    const corrEp = (Ic + Ib) - beJunc.Id;

    if (Bp >= 0) b[Bp] += corrBp;
    if (Cp >= 0) b[Cp] += corrCp;
    if (Ep >= 0) b[Ep] += corrEp;
  }

  postStep(x: Float64Array, _dt: number): void {
    const vBp = this.nBp >= 0 ? x[this.nBp] : 0;
    const vCp = this.nCp >= 0 ? x[this.nCp] : 0;
    const vEp = this.nEp >= 0 ? x[this.nEp] : 0;
    this.vbePrev = vBp - vEp;
    this.vbcPrev = vBp - vCp;
  }

  convergenceError(xOld: Float64Array, xNew: Float64Array): number {
    const vbeOld = (this.nBp >= 0 ? xOld[this.nBp] : 0) - (this.nEp >= 0 ? xOld[this.nEp] : 0);
    const vbeNew = (this.nBp >= 0 ? xNew[this.nBp] : 0) - (this.nEp >= 0 ? xNew[this.nEp] : 0);
    const vbcOld = (this.nBp >= 0 ? xOld[this.nBp] : 0) - (this.nCp >= 0 ? xOld[this.nCp] : 0);
    const vbcNew = (this.nBp >= 0 ? xNew[this.nBp] : 0) - (this.nCp >= 0 ? xNew[this.nCp] : 0);
    return Math.max(Math.abs(vbeNew - vbeOld), Math.abs(vbcNew - vbcOld));
  }

  reset(): void { this.vbePrev = 0; this.vbcPrev = 0; }
}
