import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';

export class CapacitorModel implements ComponentModel {
  readonly type = 'capacitor';
  readonly nonlinear = false;
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

  /** Companion conductance: trapezoidal 2C/dt, backward Euler C/dt. */
  private geq(dt: number, be: boolean): number {
    return (be ? 1 : 2) * this.capacitance / dt;
  }

  stampMatrix(G: Float64Array[], dt: number, be: boolean): void {
    stampConductance(G, this.n0, this.n1, this.geq(dt, be));
  }

  stampRhs(b: Float64Array, dt: number, be: boolean): void {
    // Backward Euler uses no current history, which is what makes it the right
    // restart step after a discontinuity (the old current is no longer valid).
    const Geq = this.geq(dt, be);
    const Ieq = be ? Geq * this.vPrev : Geq * this.vPrev + this.iPrev;
    stampCurrentSource(b, this.n0, this.n1, Ieq);
  }

  postStep(x: Float64Array, dt: number, be = false): void {
    const vCap = this.voltage(x);
    const Geq = this.geq(dt, be);
    const iCap = be ? Geq * (vCap - this.vPrev) : Geq * (vCap - this.vPrev) - this.iPrev;
    this.vPrev = vCap;
    this.iPrev = iCap;
  }

  syncState(x: Float64Array): void {
    this.vPrev = this.voltage(x);
  }

  private voltage(x: Float64Array): number {
    const v0 = this.n0 >= 0 ? x[this.n0] : 0;
    const v1 = this.n1 >= 0 ? x[this.n1] : 0;
    return v0 - v1;
  }

  /** The current charging it over the step just taken. */
  current(_x: Float64Array): number { return this.iPrev; }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.vPrev = 0;
    this.iPrev = 0;
  }
}
