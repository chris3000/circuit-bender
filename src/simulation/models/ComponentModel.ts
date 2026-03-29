export interface ComponentModel {
  readonly type: string;
  getInternalNodeCount(): number;
  getBranchCount(): number;
  init(
    pinNodes: number[],
    internalNodeStart: number,
    branchStart: number,
    params: Record<string, number>
  ): void;
  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, dt: number): void;
  postStep(x: Float64Array, dt: number): void;
  convergenceError(xOld: Float64Array, xNew: Float64Array): number;
  reset(): void;
}
