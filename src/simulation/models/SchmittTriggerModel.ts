import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

const NUM_GATES = 6;
const VT_POS_RATIO = 0.58;
const VT_NEG_RATIO = 0.45;
const ROUT = 280;
const ROFF = 1e9;

export class SchmittTriggerModel implements ComponentModel {
  readonly type = 'cd40106';
  private pins: number[] = [];
  private gateStates: boolean[] = [true, true, true, true, true, true];

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {
    this.pins = [...pinNodes];
    this.gateStates = [true, true, true, true, true, true];
  }

  stamp(G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {
    const nVdd = this.pins[12];
    const nVss = this.pins[13];
    for (let g = 0; g < NUM_GATES; g++) {
      const nOut = this.pins[g + 6];
      if (nOut < 0) continue;
      if (this.gateStates[g]) {
        stampConductance(G, nOut, nVdd, 1 / ROUT);
        stampConductance(G, nOut, nVss, 1 / ROFF);
      } else {
        stampConductance(G, nOut, nVdd, 1 / ROFF);
        stampConductance(G, nOut, nVss, 1 / ROUT);
      }
    }
  }

  postStep(x: Float64Array, _dt: number): void {
    const nVdd = this.pins[12];
    const nVss = this.pins[13];
    const vdd = nVdd >= 0 ? x[nVdd] : 0;
    const vss = nVss >= 0 ? x[nVss] : 0;
    const vRange = vdd - vss;
    if (vRange < 0.1) return;
    const vtPos = vss + vRange * VT_POS_RATIO;
    const vtNeg = vss + vRange * VT_NEG_RATIO;
    for (let g = 0; g < NUM_GATES; g++) {
      const nIn = this.pins[g];
      if (nIn < 0) continue;
      const vIn = x[nIn];
      if (this.gateStates[g] && vIn > vtPos) this.gateStates[g] = false;
      else if (!this.gateStates[g] && vIn < vtNeg) this.gateStates[g] = true;
    }
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.gateStates = [true, true, true, true, true, true];
  }

  getGateState(gateIndex: number): boolean {
    return this.gateStates[gateIndex] ?? true;
  }
}
