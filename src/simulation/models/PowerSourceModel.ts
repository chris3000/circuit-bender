import type { ComponentModel } from './ComponentModel';

export class PowerSourceModel implements ComponentModel {
  readonly type = 'power';
  readonly nonlinear = false;
  private nPos = -1;
  private nNeg = -1;
  private br = -1;
  private voltage = 9;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 1; }

  init(pinNodes: number[], _internalNodeStart: number, branchStart: number, params: Record<string, number>): void {
    this.nPos = pinNodes[0];
    this.nNeg = pinNodes[1];
    this.br = branchStart;
    this.voltage = params.voltage ?? 9;
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    const { nPos, nNeg, br } = this;
    // Stamp voltage source: G[br][nPos]=1, G[nPos][br]=1, G[br][nNeg]=-1, G[nNeg][br]=-1
    if (nPos >= 0) {
      G[br][nPos] += 1;
      G[nPos][br] += 1;
    }
    if (nNeg >= 0) {
      G[br][nNeg] -= 1;
      G[nNeg][br] -= 1;
    }
  }

  stampRhs(b: Float64Array, _dt: number, _be: boolean): void {
    b[this.br] += this.voltage;
  }

  updateParam(key: string, value: number): void {
    if (key === 'voltage' && Number.isFinite(value)) this.voltage = value;
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
