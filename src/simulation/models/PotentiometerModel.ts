import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

export class PotentiometerModel implements ComponentModel {
  readonly type = 'potentiometer';
  private n0 = -1; // top
  private n1 = -1; // wiper
  private n2 = -1; // bottom
  private gTop = 0;
  private gBottom = 0;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    this.n0 = pinNodes[0];
    this.n1 = pinNodes[1];
    this.n2 = pinNodes[2];
    const maxR = params.maxResistance ?? 100000;
    const pos = Math.min(Math.max(params.position ?? 0.5, 0.001), 0.999);
    this.gTop = 1 / (maxR * pos);
    this.gBottom = 1 / (maxR * (1 - pos));
  }

  stamp(G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {
    if (this.n1 < 0) {
      // Wiper not connected — single conductance top to bottom
      stampConductance(G, this.n0, this.n2, this.gTop * this.gBottom / (this.gTop + this.gBottom));
    } else {
      stampConductance(G, this.n0, this.n1, this.gTop);
      stampConductance(G, this.n1, this.n2, this.gBottom);
    }
  }

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}

  updateParam(key: string, value: number): void {
    if (key === 'position') {
      const maxR = 1 / this.gTop + 1 / this.gBottom; // total R is constant
      const pos = Math.min(Math.max(value, 0.001), 0.999);
      this.gTop = 1 / (maxR * pos);
      this.gBottom = 1 / (maxR * (1 - pos));
    }
  }
}
