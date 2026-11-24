import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';
import { BOLTZMANN_VOLTAGE, computeVcrit, currentConverged, limitJunctionVoltage, linearizeJunction } from './junctionUtils';

export interface DiodeParams {
  Is: number;
  n: number;
  Rs: number;
  Vt?: number;
  /** The forward current a real one stands for as long as it likes, in amps. */
  maxCurrent?: number;
}

export const DIODE_1N914_PARAMS: DiodeParams = { Is: 2.52e-9, n: 1.752, Rs: 0.568, maxCurrent: 0.2 };
/** A 1 A rectifier: the diode put across a power supply against a battery connected backwards. */
export const DIODE_1N4004_PARAMS: DiodeParams = { Is: 14.11e-9, n: 1.984, Rs: 0.0339, maxCurrent: 1 };
/**
 * A standard red LED: 2.0 V at 2 mA, 2.2 V at 20 mA. Its few ohms of series
 * resistance are what keep the current finite (an amp or so, on 9 V) when it
 * is wired with no resistor, which the junction alone would not.
 */
export const DIODE_LED_RED_PARAMS: DiodeParams = { Is: 3.9e-20, n: 2.0, Rs: 5, maxCurrent: 0.03 };

export class DiodeModel implements ComponentModel {
  readonly type = 'diode';
  readonly nonlinear = true;
  private params: DiodeParams;
  private Vcrit: number;
  private hasRs: boolean;
  private nAnode = -1;
  private nCathode = -1;
  private nAprime = -1;  // internal node between Rs and junction (only if Rs > 0)
  /** Junction voltage the last stamp linearized at (after limiting). */
  private vdLin = 0;
  /** Current and conductance of that linearization. */
  private idLin = 0;
  private gdLin = 0;
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

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    if (this.hasRs) {
      stampConductance(G, this.nAnode, this.nAprime, 1 / this.params.Rs);
    }
  }

  getNonlinearNodes(): number[] {
    return [this.junctionPos(), this.nCathode];
  }

  stampNonlinear(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const { Is, n } = this.params;
    const Vt = this.params.Vt ?? BOLTZMANN_VOLTAGE;

    // Limit relative to the previous iteration's linearization point
    const vd = limitJunctionVoltage(this.junctionVoltage(x), this.vdLin, n * Vt, this.Vcrit);
    this.vdLin = vd;

    const { Gd, Ieq, Id } = linearizeJunction(vd, Is, n, Vt);
    this.lastId = Id;
    this.idLin = Id;
    this.gdLin = Gd;

    const nPos = this.junctionPos();
    stampConductance(G, nPos, this.nCathode, Gd);
    stampCurrentSource(b, this.nCathode, nPos, Ieq);
  }

  postStep(x: Float64Array, _dt: number): void {
    this.vdLin = this.junctionVoltage(x);
  }

  syncState(x: Float64Array): void {
    this.vdLin = this.junctionVoltage(x);
  }

  /**
   * Zero if the last linearization predicts the diode's current at the new
   * solution to within tolerance; otherwise how far the junction voltage is
   * from the point it was linearized at.
   */
  convergenceError(_xOld: Float64Array, xNew: Float64Array): number {
    const vd = this.junctionVoltage(xNew);
    const dv = vd - this.vdLin;
    const { Is, n } = this.params;
    const actual = linearizeJunction(vd, Is, n, this.params.Vt ?? BOLTZMANN_VOLTAGE).Id;
    return currentConverged(this.idLin + this.gdLin * dv, actual) ? 0 : Math.abs(dv);
  }

  private junctionPos(): number {
    return this.hasRs ? this.nAprime : this.nAnode;
  }

  private junctionVoltage(x: Float64Array): number {
    const nPos = this.junctionPos();
    return (nPos >= 0 ? x[nPos] : 0) - (this.nCathode >= 0 ? x[this.nCathode] : 0);
  }

  /** Anode to cathode: what the junction passes at the voltage it has in x. */
  current(x: Float64Array): number {
    const { Is, n } = this.params;
    return linearizeJunction(this.junctionVoltage(x), Is, n, this.params.Vt ?? BOLTZMANN_VOLTAGE).Id;
  }

  strain(x: Float64Array): number {
    return this.params.maxCurrent ? Math.max(0, this.current(x)) / this.params.maxCurrent : 0;
  }

  reset(): void { this.vdLin = 0; this.idLin = 0; this.gdLin = 0; this.lastId = 0; }
  getForwardCurrent(): number { return this.lastId; }
  isLit(): boolean { return this.lastId > 1e-6; }
}
