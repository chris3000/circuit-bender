import type { ComponentModel } from './ComponentModel';
import { nodeVoltage } from './stampUtils';
import { currentConverged } from './junctionUtils';
import { channelCurrent, stampDependentCurrent } from './deviceUtils';

/**
 * The two transistors of an unbuffered CMOS inverter, on a 9 V supply.
 * Matched, so it balances at half the supply; `lambda` gives one stage a gain
 * of about 30 there, and `k` has it draw 3 to 4 mA while it sits there.
 */
const K = 0.8e-3;       // A/V²
const VT = 1.5;         // threshold of each transistor (V)
const LAMBDA = 0.02;    // 1/V

interface Section {
  input: number;
  output: number;
  // Where it was last linearized: the four voltages, and each transistor's current and slopes
  vin: number; vout: number; vdd: number; vss: number;
  nI: number; nGm: number; nGds: number;
  pI: number; pGm: number; pGds: number;
  linearized: boolean;
}

/**
 * CD4049UB: six unbuffered inverters. Each is one P-channel and one N-channel
 * transistor, gates together, drains together, and nothing else: so besides
 * being a logic gate it is an amplifier. With a resistor from its output back
 * to its input it sits half way between the rails and amplifies whatever is
 * fed in through a capacitor, and it clips softly when driven hard. That is
 * the amplifier and the distortion in Collins's Handmade Electronic Music.
 *
 * Both transistors are solved as transistors (the square law, by Newton
 * iteration), so the gain, the clipping and the current it draws while half
 * on all come from the same two curves.
 *
 * Pins: 1A–6A (0–5), 1Y–6Y (6–11), VDD (12), VSS (13). An inverter with
 * nothing on its output is left out; an input with nothing on it reads low.
 */
export class CmosInverterModel implements ComponentModel {
  readonly type = 'cd4049';
  readonly nonlinear = true;
  readonly ignoresUnconnectedPins = true;

  private nVdd = -1;
  private nVss = -1;
  private sections: Section[] = [];
  private readonly terms = new Float64Array(12);

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[], _internalNodeStart: number, _branchStart: number,
    _params: Record<string, number>, pinConnected?: boolean[],
  ): void {
    this.nVdd = pinNodes[12];
    this.nVss = pinNodes[13];
    this.sections = [];
    for (let s = 0; s < 6; s++) {
      const wired = (pin: number) => !pinConnected || pinConnected[pin];
      if (!wired(6 + s)) continue;
      this.sections.push({
        // A gate left open reads low
        input: wired(s) ? pinNodes[s] : this.nVss,
        output: pinNodes[6 + s],
        vin: 0, vout: 0, vdd: 0, vss: 0, nI: 0, nGm: 0, nGds: 0, pI: 0, pGm: 0, pGds: 0, linearized: false,
      });
    }
  }

  stampMatrix(_G: Float64Array[], _dt: number, _be: boolean): void {}

  getNonlinearNodes(): number[] {
    const nodes = [this.nVdd, this.nVss];
    for (const s of this.sections) nodes.push(s.input, s.output);
    return nodes;
  }

  stampNonlinear(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const { nVdd, nVss, terms } = this;
    const vdd = nodeVoltage(x, nVdd), vss = nodeVoltage(x, nVss);
    for (const s of this.sections) {
      const vin = nodeVoltage(x, s.input), vout = nodeVoltage(x, s.output);
      const n = channelCurrent(vin - vss, vout - vss, K, VT, LAMBDA);
      const p = channelCurrent(vdd - vin, vdd - vout, K, VT, LAMBDA);
      s.vin = vin; s.vout = vout; s.vdd = vdd; s.vss = vss;
      s.nI = n.id; s.nGm = n.gm; s.nGds = n.gds;
      s.pI = p.id; s.pGm = p.gm; s.pGds = p.gds;
      s.linearized = true;

      // N-channel: from the output down to VSS, set by (in − VSS) and (out − VSS)
      terms[0] = s.input; terms[1] = n.gm; terms[2] = vin;
      terms[3] = s.output; terms[4] = n.gds; terms[5] = vout;
      terms[6] = nVss; terms[7] = -n.gm - n.gds; terms[8] = vss;
      terms[9] = -1; terms[10] = 0; terms[11] = 0;
      stampDependentCurrent(G, b, s.output, nVss, n.id, terms);

      // P-channel: from VDD down to the output, set by (VDD − in) and (VDD − out)
      terms[0] = s.input; terms[1] = -p.gm; terms[2] = vin;
      terms[3] = s.output; terms[4] = -p.gds; terms[5] = vout;
      terms[6] = nVdd; terms[7] = p.gm + p.gds; terms[8] = vdd;
      stampDependentCurrent(G, b, nVdd, s.output, p.id, terms);
    }
  }

  convergenceError(_xOld: Float64Array, xNew: Float64Array): number {
    const vdd = nodeVoltage(xNew, this.nVdd), vss = nodeVoltage(xNew, this.nVss);
    let worst = 0;
    for (const s of this.sections) {
      if (!s.linearized) continue;
      const vin = nodeVoltage(xNew, s.input), vout = nodeVoltage(xNew, s.output);
      const dIn = vin - s.vin, dOut = vout - s.vout, dDd = vdd - s.vdd, dSs = vss - s.vss;
      const n = channelCurrent(vin - vss, vout - vss, K, VT, LAMBDA).id;
      const p = channelCurrent(vdd - vin, vdd - vout, K, VT, LAMBDA).id;
      const nGuess = s.nI + s.nGm * (dIn - dSs) + s.nGds * (dOut - dSs);
      const pGuess = s.pI + s.pGm * (dDd - dIn) + s.pGds * (dDd - dOut);
      if (currentConverged(nGuess, n) && currentConverged(pGuess, p)) continue;
      worst = Math.max(worst, Math.abs(dIn), Math.abs(dOut), Math.abs(dDd), Math.abs(dSs), 1e-3);
    }
    return worst;
  }

  /** The current one inverter draws from the supply with its input at `vin` and its output at `vout` (for tests). */
  static supplyCurrent(vin: number, vout: number, vdd: number): number {
    return channelCurrent(vdd - vin, vdd - vout, K, VT, LAMBDA).id;
  }

  reset(): void {
    for (const s of this.sections) s.linearized = false;
  }
}
