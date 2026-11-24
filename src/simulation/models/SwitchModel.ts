import type { ComponentModel } from './ComponentModel';
import { nodeVoltage, stampConductance } from './stampUtils';

const G_CLOSED = 100;    // 0.01 ohm when closed
const G_OPEN = 1e-9;     // 1G ohm when open

/**
 * A changeover switch: the common pin goes to one throw or the other.
 * Pins: COM (0), A (1), B (2). `throw` is 0 for A, 1 for B.
 */
export class ChangeoverSwitchModel implements ComponentModel {
  readonly type = 'spdt';
  readonly nonlinear = false;
  private nCommon = -1;
  private nA = -1;
  private nB = -1;
  private toB = false;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    [this.nCommon, this.nA, this.nB] = pinNodes;
    this.toB = (params.throw ?? 0) >= 1;
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    stampConductance(G, this.nCommon, this.nA, this.toB ? G_OPEN : G_CLOSED);
    stampConductance(G, this.nCommon, this.nB, this.toB ? G_CLOSED : G_OPEN);
  }

  updateParam(key: string, value: number): void {
    if (key === 'throw') this.toB = value >= 1;
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}

export class SwitchModel implements ComponentModel {
  readonly type = 'switch';
  readonly nonlinear = false;
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

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    stampConductance(G, this.n0, this.n1, this.closed ? G_CLOSED : G_OPEN);
  }

  current(x: Float64Array): number {
    return (nodeVoltage(x, this.n0) - nodeVoltage(x, this.n1)) * (this.closed ? G_CLOSED : G_OPEN);
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}

  updateParam(key: string, value: number): void {
    if (key === 'closed') {
      this.closed = value >= 1;
    }
  }
}
