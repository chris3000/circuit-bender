import type { ComponentModel } from './ComponentModel';

export class GroundModel implements ComponentModel {
  readonly type = 'ground';

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(_pinNodes: number[], _internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {}
  stamp(_G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {}
  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
