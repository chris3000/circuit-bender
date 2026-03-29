import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

const G_CLOSED = 100;    // 0.01 ohm when closed
const G_OPEN = 1e-9;     // 1G ohm when open

export class SwitchModel implements ComponentModel {
  readonly type = 'switch';
  private n0 = -1;
  private n1 = -1;
  private closed = false;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    this.n0 = pinNodes[0];
    this.n1 = pinNodes[1];
    this.closed = (params.closed ?? 0) >= 1;
  }

  stamp(G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {
    stampConductance(G, this.n0, this.n1, this.closed ? G_CLOSED : G_OPEN);
  }

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
