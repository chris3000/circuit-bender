import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';
import { BOLTZMANN_VOLTAGE, computeVcrit, currentConverged, limitJunctionVoltage, linearizeJunction } from './junctionUtils';
import { NoiseSource } from './deviceUtils';

export interface BJTParams {
  IS: number; BF: number; NF: number; VAF: number; IKF: number;
  BR: number; NR: number; VAR: number; RB: number; RC: number; RE: number;
  Vt?: number;
  /** 'pnp' turns every voltage and current round. */
  polarity?: 'npn' | 'pnp';
  /**
   * The reverse voltage at which the emitter-base junction breaks down (V).
   * A small transistor wired backwards like this is the classic noise source:
   * the avalanche current is not steady, and `noise` is how unsteady, as a
   * fraction of it.
   */
  BVEB?: number;
  noise?: number;
}

export const BJT_2N3904_PARAMS: BJTParams = {
  IS: 6.734e-15, BF: 416.4, NF: 1.0, VAF: 74.03, IKF: 0.06678,
  BR: 0.7389, NR: 1.0, VAR: 28, RB: 10, RC: 1, RE: 0.1,
  // Breaks down a little under the 9 V of a fresh battery; quieter ones exist, which is why builders pick theirs
  BVEB: 7.2, noise: 0.15,
};

export const BJT_2N3906_PARAMS: BJTParams = {
  IS: 1.41e-15, BF: 180.7, NF: 1.0, VAF: 18.7, IKF: 0.08,
  BR: 4.977, NR: 1.0, VAR: 20, RB: 10, RC: 2.5, RE: 0.1,
  polarity: 'pnp',
};

/** The breakdown current at exactly BVEB (A), and how many volts multiply it by e. */
const BREAKDOWN_AMPS = 1e-6;
const BREAKDOWN_SLOPE = 0.05;
/** The breakdown seen as a diode of its own, for limiting its voltage between iterations. */
const BREAKDOWN_IS = 1e-14;
const BREAKDOWN_OFFSET = BREAKDOWN_SLOPE * Math.log(BREAKDOWN_AMPS / BREAKDOWN_IS);
const BREAKDOWN_VCRIT = computeVcrit(BREAKDOWN_IS, 1, BREAKDOWN_SLOPE);

/** Terminal currents and their partial derivatives at one operating point. */
export interface BJTOperatingPoint {
  Ic: number; Ib: number;
  dIc_dVbe: number; dIc_dVbc: number;
  dIb_dVbe: number; dIb_dVbc: number;
}

/**
 * Bipolar transistor — Gummel-Poon (DC), with parasitic terminal resistances.
 * Written for an NPN; a PNP is the same device with every voltage and current
 * the other way round.
 *
 * The intrinsic device sits between internal nodes B', C', E'. Its collector
 * and base currents are functions of the two junction voltages:
 *
 *   If = IS·(e^(Vbe/NF·Vt) − 1)        Ir = IS·(e^(Vbc/NR·Vt) − 1)
 *   It = (If − Ir) / qb                 qb: Early effect + high-injection roll-off
 *   Ic = It − Ir/BR                     Ib = If/BF + Ir/BR
 *
 * Each Newton iteration stamps the full Jacobian (all four partial
 * derivatives), so the collector current responds to the base voltage inside
 * the same solve — that is what makes it converge in a few iterations.
 */
export class BJTModel implements ComponentModel {
  readonly type = 'bjt';
  readonly nonlinear = true;
  private params: BJTParams;
  private Vt: number;
  private VcritF: number;
  private VcritR: number;
  private nB = -1; private nC = -1; private nE = -1;
  private nBp = -1; private nCp = -1; private nEp = -1;
  /** Junction voltages the last stamp linearized at (after limiting). */
  private vbeLin = 0;
  private vbcLin = 0;
  /** Operating point of that linearization. */
  private opLin: BJTOperatingPoint | null = null;
  /** +1 for an NPN, −1 for a PNP. */
  private readonly sign: number;
  /** The breakdown junction's own voltage at the last linearization. */
  private vzLin = 0;
  // Avalanche noise: the breakdown current after the last step, and this step's roll of the dice
  private readonly hiss: NoiseSource | null;
  private breakdownAmps = 0;
  private roll = 0;

  constructor(params: BJTParams) {
    this.params = params;
    this.Vt = params.Vt ?? BOLTZMANN_VOLTAGE;
    this.VcritF = computeVcrit(params.IS, params.NF, this.Vt);
    this.VcritR = computeVcrit(params.IS, params.NR, this.Vt);
    this.sign = params.polarity === 'pnp' ? -1 : 1;
    this.hiss = params.BVEB !== undefined && (params.noise ?? 0) > 0 ? new NoiseSource() : null;
  }

  getInternalNodeCount(): number { return 3; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {
    this.nB = pinNodes[0]; this.nC = pinNodes[1]; this.nE = pinNodes[2];
    this.nBp = internalNodeStart; this.nCp = internalNodeStart + 1; this.nEp = internalNodeStart + 2;
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    const p = this.params;
    stampConductance(G, this.nB, this.nBp, 1 / p.RB);
    stampConductance(G, this.nC, this.nCp, 1 / p.RC);
    stampConductance(G, this.nE, this.nEp, 1 / p.RE);
  }

  getNonlinearNodes(): number[] {
    return [this.nBp, this.nCp, this.nEp];
  }

  /** Gummel-Poon currents and derivatives at the given junction voltages. */
  evaluate(vbe: number, vbc: number): BJTOperatingPoint {
    const p = this.params;
    const f = linearizeJunction(vbe, p.IS, p.NF, this.Vt);
    const r = linearizeJunction(vbc, p.IS, p.NR, this.Vt);

    // Base charge: q1 is the Early effect, q2 the high-injection roll-off
    const q1Inv = Math.max(1 - vbc / p.VAF - vbe / p.VAR, 1e-3);
    const q1 = 1 / q1Inv;
    const q2 = Math.max(f.Id / p.IKF, 0);
    const root = Math.sqrt(1 + 4 * q2);
    const qb = 0.5 * q1 * (1 + root);
    const dq1_dVbe = q1 * q1 / p.VAR;
    const dq1_dVbc = q1 * q1 / p.VAF;
    const dqb_dVbe = 0.5 * dq1_dVbe * (1 + root) + (f.Id > 0 ? q1 * (f.Gd / p.IKF) / root : 0);
    const dqb_dVbc = 0.5 * dq1_dVbc * (1 + root);

    const It = (f.Id - r.Id) / qb;
    const dIt_dVbe = (f.Gd - It * dqb_dVbe) / qb;
    const dIt_dVbc = (-r.Gd - It * dqb_dVbc) / qb;

    // Past its reverse breakdown the emitter-base junction conducts backwards:
    // current out of the base that the forward equations know nothing of
    const breakdown = this.breakdown(vbe);

    return {
      Ic: It - r.Id / p.BR,
      Ib: f.Id / p.BF + r.Id / p.BR - breakdown.amps,
      dIc_dVbe: dIt_dVbe,
      dIc_dVbc: dIt_dVbc - r.Gd / p.BR,
      dIb_dVbe: f.Gd / p.BF + breakdown.slope,
      dIb_dVbc: r.Gd / p.BR,
    };
  }

  /** The reverse current through the emitter-base junction at `vbe`, and how fast it grows as vbe falls. */
  private breakdown(vbe: number): { amps: number; slope: number } {
    const bv = this.params.BVEB;
    if (bv === undefined) return { amps: 0, slope: 0 };
    const point = linearizeJunction(-vbe - bv + BREAKDOWN_OFFSET, BREAKDOWN_IS, 1, BREAKDOWN_SLOPE);
    return point.Id > 1e-15 ? { amps: point.Id, slope: point.Gd } : { amps: 0, slope: 0 };
  }

  stampNonlinear(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const p = this.params;
    const B = this.nBp, C = this.nCp, E = this.nEp;

    // Limit both junctions relative to the previous iteration. In a PNP they
    // are measured the other way round, which is the only difference there is.
    const s = this.sign;
    let vbe = limitJunctionVoltage(s * (x[B] - x[E]), this.vbeLin, p.NF * this.Vt, this.VcritF);
    const vbc = limitJunctionVoltage(s * (x[B] - x[C]), this.vbcLin, p.NR * this.Vt, this.VcritR);
    if (p.BVEB !== undefined) {
      // ...and the breakdown, which is as steep going the other way
      const vz = limitJunctionVoltage(-vbe - p.BVEB + BREAKDOWN_OFFSET, this.vzLin, BREAKDOWN_SLOPE, BREAKDOWN_VCRIT);
      this.vzLin = vz;
      vbe = -(vz - BREAKDOWN_OFFSET + p.BVEB);
    }
    this.vbeLin = vbe;
    this.vbcLin = vbc;

    const op = this.evaluate(vbe, vbc);
    this.opLin = op;

    // Linearized currents INTO the collector and base (the emitter carries the
    // negative sum):  I ≈ I0 + gBE·(Vbe − Vbe0) + gBC·(Vbc − Vbc0),
    // with Vbe = V(B') − V(E'), Vbc = V(B') − V(C').
    const icEq = s * (op.Ic - op.dIc_dVbe * vbe - op.dIc_dVbc * vbc);
    const ibEq = s * (op.Ib - op.dIb_dVbe * vbe - op.dIb_dVbc * vbc);

    // Collector row
    G[C][B] += op.dIc_dVbe + op.dIc_dVbc;
    G[C][E] -= op.dIc_dVbe;
    G[C][C] -= op.dIc_dVbc;
    b[C] -= icEq;

    // Base row
    G[B][B] += op.dIb_dVbe + op.dIb_dVbc;
    G[B][E] -= op.dIb_dVbe;
    G[B][C] -= op.dIb_dVbc;
    b[B] -= ibEq;

    // Emitter row: Ie = −(Ic + Ib)
    G[E][B] -= op.dIc_dVbe + op.dIc_dVbc + op.dIb_dVbe + op.dIb_dVbc;
    G[E][E] += op.dIc_dVbe + op.dIb_dVbe;
    G[E][C] += op.dIc_dVbc + op.dIb_dVbc;
    b[E] += icEq + ibEq;
  }

  /**
   * Avalanche noise: the breakdown current is made of bursts, so on top of
   * its steady value there is a random part, new at every step and in
   * proportion to the current that was flowing. It goes the way the breakdown
   * current does, from the emitter to the base.
   */
  stampRhs(b: Float64Array, _dt: number, _be: boolean): void {
    if (!this.hiss || this.breakdownAmps === 0) return;
    const amps = this.sign * this.params.noise! * this.breakdownAmps * this.roll;
    b[this.nBp] += amps;
    b[this.nEp] -= amps;
  }

  postStep(x: Float64Array, _dt: number): void {
    this.settle(x);
    if (this.hiss) this.roll = this.hiss.next();
  }

  syncState(x: Float64Array): void {
    this.settle(x);
  }

  private settle(x: Float64Array): void {
    this.vbeLin = this.sign * (x[this.nBp] - x[this.nEp]);
    this.vbcLin = this.sign * (x[this.nBp] - x[this.nCp]);
    if (this.params.BVEB !== undefined) {
      this.vzLin = -this.vbeLin - this.params.BVEB + BREAKDOWN_OFFSET;
      this.breakdownAmps = this.hiss ? this.breakdown(this.vbeLin).amps : 0;
    }
  }

  /**
   * Zero if the last linearization predicts the collector and base currents
   * at the new solution to within tolerance; otherwise how far the junction
   * voltages are from the point they were linearized at.
   */
  convergenceError(_xOld: Float64Array, xNew: Float64Array): number {
    const vbe = this.sign * (xNew[this.nBp] - xNew[this.nEp]);
    const vbc = this.sign * (xNew[this.nBp] - xNew[this.nCp]);
    const dBe = vbe - this.vbeLin, dBc = vbc - this.vbcLin;
    const lin = this.opLin;
    if (lin) {
      const now = this.evaluate(vbe, vbc);
      if (currentConverged(lin.Ic + lin.dIc_dVbe * dBe + lin.dIc_dVbc * dBc, now.Ic)
        && currentConverged(lin.Ib + lin.dIb_dVbe * dBe + lin.dIb_dVbc * dBc, now.Ib)) return 0;
    }
    return Math.max(Math.abs(dBe), Math.abs(dBc));
  }

  reset(): void {
    this.vbeLin = 0;
    this.vbcLin = 0;
    this.vzLin = 0;
    this.opLin = null;
    this.breakdownAmps = 0;
    this.roll = 0;
    this.hiss?.reset();
  }
}
