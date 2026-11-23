import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

const unit = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/**
 * A light-dependent resistor: about 1 MΩ in the dark, falling a decade for
 * each third of the way to 1 kΩ in bright light, as a cadmium-sulphide cell
 * does. `light` runs from 0 (dark) to 1 (bright).
 */
export const ldrOhms = (light: number): number => 1e6 * Math.pow(1e-3, unit(light));

/**
 * Skin between two contacts: nothing until they are touched, then from about
 * 2 MΩ for the lightest touch of a dry finger down to 50 kΩ pressed hard.
 * `touch` runs from 0 (not touching) to 1.
 */
export const touchOhms = (touch: number): number => (unit(touch) <= 0 ? 1e9 : 2e6 * Math.pow(0.025, unit(touch)));

/**
 * A resistor whose value follows one live parameter through a curve: a
 * light-dependent resistor following the light on it, a pair of body
 * contacts following a finger.
 */
export class VariableResistorModel implements ComponentModel {
  readonly nonlinear = false;
  private n0 = -1;
  private n1 = -1;
  private conductance = 0;

  constructor(
    readonly type: string,
    private readonly parameter: string,
    private readonly ohms: (value: number) => number,
    private readonly initial = 0,
  ) {}

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    this.n0 = pinNodes[0];
    this.n1 = pinNodes[1];
    const value = params[this.parameter];
    this.conductance = 1 / this.ohms(Number.isFinite(value) ? value : this.initial);
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    stampConductance(G, this.n0, this.n1, this.conductance);
  }

  updateParam(key: string, value: number): void {
    if (key === this.parameter && Number.isFinite(value)) this.conductance = 1 / this.ohms(value);
  }

  getResistance(): number { return 1 / this.conductance; }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
