import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

/** A high-impedance amplifier input: enough to bias a coupling capacitor without detuning what drives it. */
const DEFAULT_LOAD_OHMS = 1e6;

/**
 * Audio output jack: the input of whatever amplifier the circuit is plugged into.
 *
 * Electrically it is a load resistor to ground, so a coupling capacitor in
 * front of it has a DC path and behaves as it would on the bench. `gain` is
 * the input trim of that amplifier: it scales the recorded level and has no
 * effect on the circuit.
 */
export class AudioOutputModel implements ComponentModel {
  readonly type = 'audio-output';
  readonly nonlinear = false;
  private node = -1;
  private gLoad = 1 / DEFAULT_LOAD_OHMS;
  private gain = 1;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    this.node = pinNodes[0];
    const load = params.loadResistance;
    this.gLoad = 1 / (Number.isFinite(load) && load > 0 ? load : DEFAULT_LOAD_OHMS);
    this.gain = Number.isFinite(params.gain) && params.gain > 0 ? params.gain : 1;
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    stampConductance(G, this.node, -1, this.gLoad);
  }

  updateParam(key: string, value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    if (key === 'gain') this.gain = value;
    else if (key === 'loadResistance') this.gLoad = 1 / value;
  }

  getGain(): number { return this.gain; }

  /** What is heard: the voltage at the jack, from ground. */
  audioTap(): { positive: number; negative: number } {
    return { positive: this.node, negative: -1 };
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
