import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

/**
 * A small loudspeaker: its voice coil's resistance between the two terminals
 * (8 Ω unless told otherwise), and what is heard is the voltage across them.
 *
 * Eight ohms is a heavy load: a logic gate's output can barely move it, which
 * is why speakers have amplifiers in front of them.
 */
export class SpeakerModel implements ComponentModel {
  readonly type = 'speaker';
  readonly nonlinear = false;
  private nPos = -1;
  private nNeg = -1;
  private conductance = 1 / 8;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    this.nPos = pinNodes[0];
    this.nNeg = pinNodes[1];
    const ohms = params.impedance;
    this.conductance = 1 / (Number.isFinite(ohms) && ohms > 0 ? ohms : 8);
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    stampConductance(G, this.nPos, this.nNeg, this.conductance);
  }

  /** What is heard: the voltage from the first node to the second. */
  audioTap(): { positive: number; negative: number } {
    return { positive: this.nPos, negative: this.nNeg };
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
