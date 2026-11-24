import type { ComponentModel } from './ComponentModel';
import { nodeVoltage, stampConductance } from './stampUtils';

/** What an ordinary resistor can turn into heat for as long as it likes: a quarter of a watt. */
export const RESISTOR_WATTS = 0.25;

export class ResistorModel implements ComponentModel {
  readonly type = 'resistor';
  readonly nonlinear = false;
  private n0 = -1;
  private n1 = -1;
  private conductance = 0;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    this.n0 = pinNodes[0];
    this.n1 = pinNodes[1];
    this.conductance = 1 / Math.max(params.resistance ?? 1000, 1);
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    stampConductance(G, this.n0, this.n1, this.conductance);
  }

  current(x: Float64Array): number {
    return (nodeVoltage(x, this.n0) - nodeVoltage(x, this.n1)) * this.conductance;
  }

  /** The heat it is making, against its quarter watt. */
  strain(x: Float64Array): number {
    const v = nodeVoltage(x, this.n0) - nodeVoltage(x, this.n1);
    return (v * v * this.conductance) / RESISTOR_WATTS;
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
