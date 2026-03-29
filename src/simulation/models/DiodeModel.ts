import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';
import { BOLTZMANN_VOLTAGE, computeVcrit, limitJunctionVoltage, linearizeJunction } from './junctionUtils';

export interface DiodeParams {
  Is: number;
  n: number;
  Rs: number;
  Vt?: number;
}

export const DIODE_1N914_PARAMS: DiodeParams = { Is: 2.52e-9, n: 1.752, Rs: 0.568 };
export const DIODE_LED_RED_PARAMS: DiodeParams = { Is: 1e-20, n: 2.0, Rs: 0 };

export class DiodeModel implements ComponentModel {
  readonly type = 'diode';
  private params: DiodeParams;
  private Vcrit: number;
  private hasRs: boolean;
  private nAnode = -1;
  private nCathode = -1;
  private nAprime = -1;  // internal node between Rs and junction (only if Rs > 0)
  private vdPrev = 0;
  private lastId = 0;

  constructor(params: DiodeParams) {
    this.params = params;
    this.hasRs = params.Rs > 0;
    const Vt = params.Vt ?? BOLTZMANN_VOLTAGE;
    this.Vcrit = computeVcrit(params.Is, params.n, Vt);
  }

  getInternalNodeCount(): number { return this.hasRs ? 1 : 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {
    this.nAnode = pinNodes[0];
    this.nCathode = pinNodes[1];
    this.nAprime = this.hasRs ? internalNodeStart : -1;
  }

  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const { Is, n, Rs } = this.params;
    const Vt = this.params.Vt ?? BOLTZMANN_VOLTAGE;
    const nVt = n * Vt;

    const nJunctionPos = this.hasRs ? this.nAprime : this.nAnode;
    const nJunctionNeg = this.nCathode;

    if (this.hasRs) {
      stampConductance(G, this.nAnode, this.nAprime, 1 / Rs);
    }

    const vPos = nJunctionPos >= 0 ? x[nJunctionPos] : 0;
    const vNeg = nJunctionNeg >= 0 ? x[nJunctionNeg] : 0;
    let vd = vPos - vNeg;

    vd = limitJunctionVoltage(vd, this.vdPrev, nVt, this.Vcrit);

    const { Gd, Ieq, Id } = linearizeJunction(vd, Is, n, Vt);
    this.lastId = Id;

    stampConductance(G, nJunctionPos, nJunctionNeg, Gd);
    stampCurrentSource(b, nJunctionNeg, nJunctionPos, Ieq);
  }

  postStep(x: Float64Array, _dt: number): void {
    const nJunctionPos = this.hasRs ? this.nAprime : this.nAnode;
    const nJunctionNeg = this.nCathode;
    const vPos = nJunctionPos >= 0 ? x[nJunctionPos] : 0;
    const vNeg = nJunctionNeg >= 0 ? x[nJunctionNeg] : 0;
    this.vdPrev = vPos - vNeg;
  }

  convergenceError(xOld: Float64Array, xNew: Float64Array): number {
    const nJunctionPos = this.hasRs ? this.nAprime : this.nAnode;
    const nJunctionNeg = this.nCathode;
    const vOld = (nJunctionPos >= 0 ? xOld[nJunctionPos] : 0) - (nJunctionNeg >= 0 ? xOld[nJunctionNeg] : 0);
    const vNew = (nJunctionPos >= 0 ? xNew[nJunctionPos] : 0) - (nJunctionNeg >= 0 ? xNew[nJunctionNeg] : 0);
    return Math.abs(vNew - vOld);
  }

  reset(): void { this.vdPrev = 0; this.lastId = 0; }
  getForwardCurrent(): number { return this.lastId; }
  isLit(): boolean { return this.lastId > 1e-6; }
}
