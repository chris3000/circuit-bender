import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

export class ResistorModel implements ComponentModel {
  readonly type = 'resistor';
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

  stamp(G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {
    stampConductance(G, this.n0, this.n1, this.conductance);
  }

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
