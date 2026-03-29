import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';

export class CapacitorModel implements ComponentModel {
  readonly type = 'capacitor';
  private n0 = -1;
  private n1 = -1;
  private capacitance = 100e-9;
  private vPrev = 0;
  private iPrev = 0;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    this.n0 = pinNodes[0];
    this.n1 = pinNodes[1];
    this.capacitance = params.capacitance ?? 100e-9;
  }

  stamp(G: Float64Array[], b: Float64Array, _x: Float64Array, dt: number): void {
    const Geq = 2 * this.capacitance / dt;
    stampConductance(G, this.n0, this.n1, Geq);
    const Ieq = Geq * this.vPrev + this.iPrev;
    stampCurrentSource(b, this.n0, this.n1, Ieq);
  }

  postStep(x: Float64Array, dt: number): void {
    const v0 = this.n0 >= 0 ? x[this.n0] : 0;
    const v1 = this.n1 >= 0 ? x[this.n1] : 0;
    const vCap = v0 - v1;
    const Geq = 2 * this.capacitance / dt;
    const iCap = Geq * (vCap - this.vPrev) - this.iPrev;
    this.vPrev = vCap;
    this.iPrev = iCap;
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.vPrev = 0;
    this.iPrev = 0;
  }
}
