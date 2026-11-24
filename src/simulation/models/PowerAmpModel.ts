import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';
import { PwlClamp } from './eventUtils';

const R_INPUT = 50e3;        // each input to ground
const R_SUPPLY = 2000;       // quiescent current: about 4 mA
const R_OUT = 1;
const HEADROOM = 1;          // how close the output gets to either rail (V)
const GAIN_BANDWIDTH = 6e6;  // 300 kHz at a gain of 20
/** Scale of the internal gain node: small, so the clamps that limit it move µA, not amps. */
const G_NODE = 1e-6;
const G_RAIL = 1e-2;

/**
 * LM386 audio power amplifier.
 *
 *   OUT = (VS + GND)/2 + gain·(IN+ − IN−),   kept HEADROOM inside the rails
 *
 * The inputs are ground-referenced through 50 kΩ each and the output idles at
 * half the supply, so it is used with a capacitor in series with the speaker.
 * `gain` is 20 as the chip comes; a capacitor across its gain pins (1 and 8,
 * not drawn here) takes it up to 200, so that is the range of the parameter.
 *
 * Built like the op-amp: a gain node that is clamped at the rails (events,
 * so no Newton iteration) and a unity buffer through the output resistance.
 *
 * Pins: IN− (0), IN+ (1), GND (2), OUT (3), VS (4).
 */
export class PowerAmpModel implements ComponentModel {
  readonly type = 'lm386';
  readonly nonlinear = false;

  private nInM = -1; private nInP = -1; private nGnd = -1; private nOut = -1; private nVs = -1;
  private nGain = -1;
  private gain = 20;
  private cap = 0;
  private vGainPrev = 0;
  private clampHigh = new PwlClamp(G_RAIL, -HEADROOM);
  private clampLow = new PwlClamp(G_RAIL, -HEADROOM);

  getInternalNodeCount(): number { return 1; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    [this.nInM, this.nInP, this.nGnd, this.nOut, this.nVs] = pinNodes;
    this.nGain = internalNodeStart;
    this.setGain(params.gain);
    this.reset();
  }

  private setGain(gain: number): void {
    this.gain = Number.isFinite(gain) ? Math.max(20, Math.min(200, gain)) : 20;
    // One pole at gain-bandwidth / gain, as a capacitor on the gain node
    this.cap = G_NODE / (2 * Math.PI * GAIN_BANDWIDTH / this.gain);
  }

  stampMatrix(G: Float64Array[], dt: number, _be: boolean): void {
    const g = this.nGain;
    stampConductance(G, this.nInM, this.nGnd, 1 / R_INPUT);
    stampConductance(G, this.nInP, this.nGnd, 1 / R_INPUT);
    stampConductance(G, this.nVs, this.nGnd, 1 / R_SUPPLY);

    // Gain node: settles on gain·(IN+ − IN−) + (VS + GND)/2. Always backward
    // Euler, like the op-amp's: its pole is far above the audio band.
    G[g][g] += G_NODE + this.cap / dt;
    if (this.nInP >= 0) G[g][this.nInP] -= G_NODE * this.gain;
    if (this.nInM >= 0) G[g][this.nInM] += G_NODE * this.gain;
    if (this.nVs >= 0) G[g][this.nVs] -= G_NODE / 2;
    if (this.nGnd >= 0) G[g][this.nGnd] -= G_NODE / 2;
    this.clampHigh.stampMatrix(G, g, this.nVs);
    this.clampLow.stampMatrix(G, this.nGnd, g);

    // Output: unity buffer from the gain node through Rout
    if (this.nOut >= 0) {
      G[this.nOut][this.nOut] += 1 / R_OUT;
      G[this.nOut][g] -= 1 / R_OUT;
      // The speaker's current comes from the supply pins, half from each (see OpAmpModel)
      const half = 0.5 / R_OUT;
      for (const rail of [this.nVs, this.nGnd]) {
        if (rail < 0) continue;
        G[rail][g] += half;
        G[rail][this.nOut] -= half;
      }
    }
  }

  stampRhs(b: Float64Array, dt: number, _be: boolean): void {
    b[this.nGain] += (this.cap / dt) * this.vGainPrev;
    this.clampHigh.stampRhs(b, this.nGain, this.nVs);
    this.clampLow.stampRhs(b, this.nGnd, this.nGain);
  }

  postStep(x: Float64Array): void { this.vGainPrev = x[this.nGain]; }
  syncState(x: Float64Array): void { this.vGainPrev = x[this.nGain]; }

  getDiscreteState(): number {
    return (this.clampHigh.on ? 1 : 0) | (this.clampLow.on ? 2 : 0);
  }

  findEvent(x0: Float64Array, x1: Float64Array): number {
    return Math.min(
      this.clampHigh.findEvent(x0, x1, this.nGain, this.nVs),
      this.clampLow.findEvent(x0, x1, this.nGnd, this.nGain),
    );
  }

  applyEvent(fraction: number): void {
    this.clampHigh.applyEvent(fraction);
    this.clampLow.applyEvent(fraction);
  }

  updateParam(key: string, value: number): void {
    if (key === 'gain') this.setGain(value);
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.vGainPrev = 0;
    this.clampHigh.reset();
    this.clampLow.reset();
  }
}
