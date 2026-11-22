import type { ComponentModel } from './ComponentModel';

export class JunctionModel implements ComponentModel {
  readonly type = 'junction';
  readonly nonlinear = false;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(_pinNodes: number[], _internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {}
  stampMatrix(_G: Float64Array[], _dt: number, _be: boolean): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
