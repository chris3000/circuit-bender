import type { ComponentModel } from './ComponentModel';
import { nodeVoltage, stampConductance, stampCurrentSource } from './stampUtils';
import { BOLTZMANN_VOLTAGE, currentConverged } from './junctionUtils';
import { Junction, stampDependentCurrent } from './deviceUtils';

const IS = 1e-14;
/** Two junctions in series: the bias input's current mirror, the Darlington buffer. */
const TWO_DROPS = 2 * BOLTZMANN_VOLTAGE;
/** The input pair is fully tipped over a few tens of millivolts either way: tanh(v / 52 mV). */
const PAIR_VOLTS = 2 * BOLTZMANN_VOLTAGE;
/** How far the input difference may move between iterations before it is linearized again. */
const PAIR_STEP = 4 * PAIR_VOLTS;
/** Current gain of the Darlington buffer. */
const BUFFER_BETA = 5000;

/** Pins of one half, in order. */
const IN_P = 0, IN_M = 1, DIODES = 2, BIAS = 3, OUT = 4, BUF_IN = 5, BUF_OUT = 6;
const PINS_PER_HALF = 7;

interface Half {
  nodes: number[];
  wired: boolean[];
  /** The amplifier itself is in use: it has a bias current and somewhere to put its output. */
  core: boolean;
  buffer: boolean;
  diodes: boolean;
  bias: Junction;
  clampHigh: Junction;
  clampLow: Junction;
  follower: Junction;
  diodeP: Junction;
  diodeM: Junction;
  // Where the amplifier was last linearized
  vin: number; vBias: number;
  iAbc: number; gAbc: number; tip: number;
  linearized: boolean;
}

/**
 * LM13700: two transconductance amplifiers, each with a buffer.
 *
 * A transconductance amplifier turns the difference between its inputs into
 * a current at its output, and how much current per volt is set by a second
 * current, fed into its bias pin:
 *
 *   I(out) = I(bias) · tanh((V+ − V−) / 52 mV)
 *
 * So a control voltage, through a resistor to the bias pin, sets a gain (a
 * VCA), or how fast a capacitor on the output charges (a filter's cutoff, an
 * oscillator's pitch). The tanh is the input pair itself: a few tens of
 * millivolts tips it right over, which is why inputs are divided down to
 * millivolts, and why driving it harder rounds a triangle into a sine.
 *
 * The bias pin sits two diode drops above V−. The output is a current, drawn
 * from V+ and returned to V− by the chip's mirrors, and it cannot leave the
 * rails. Each half also has two linearising diodes from a common pin to its
 * inputs, and a Darlington emitter follower (two drops down, fed from V+)
 * that needs a resistor from its output to V−.
 *
 * Pins, for each half: IN+, IN−, D (diode bias), IABC, OUT, BUF IN, BUF OUT
 * (0–6 and 7–13), then V+ (14), V− (15).
 */
export class OtaModel implements ComponentModel {
  readonly type = 'lm13700';
  readonly nonlinear = true;
  readonly ignoresUnconnectedPins = true;

  private nPos = -1;
  private nNeg = -1;
  private halves: Half[] = [];
  private readonly terms = new Float64Array(12);

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[], _internalNodeStart: number, _branchStart: number,
    _params: Record<string, number>, pinConnected?: boolean[],
  ): void {
    this.nPos = pinNodes[2 * PINS_PER_HALF];
    this.nNeg = pinNodes[2 * PINS_PER_HALF + 1];
    this.halves = [0, 1].map((h) => {
      const nodes = pinNodes.slice(h * PINS_PER_HALF, (h + 1) * PINS_PER_HALF);
      const wired = nodes.map((_, i) => !pinConnected || pinConnected[h * PINS_PER_HALF + i]);
      return {
        nodes, wired,
        core: wired[BIAS] && wired[OUT],
        buffer: wired[BUF_IN] && wired[BUF_OUT],
        diodes: wired[DIODES],
        bias: new Junction(IS, TWO_DROPS),
        clampHigh: new Junction(IS, BOLTZMANN_VOLTAGE),
        clampLow: new Junction(IS, BOLTZMANN_VOLTAGE),
        follower: new Junction(IS, TWO_DROPS),
        diodeP: new Junction(IS, BOLTZMANN_VOLTAGE),
        diodeM: new Junction(IS, BOLTZMANN_VOLTAGE),
        vin: 0, vBias: 0, iAbc: 0, gAbc: 0, tip: 0, linearized: false,
      };
    });
  }

  stampMatrix(_G: Float64Array[], _dt: number, _be: boolean): void {}

  getNonlinearNodes(): number[] {
    const nodes = [this.nPos, this.nNeg];
    for (const half of this.halves) {
      if (half.core) nodes.push(half.nodes[IN_P], half.nodes[IN_M], half.nodes[BIAS], half.nodes[OUT]);
      if (half.buffer) nodes.push(half.nodes[BUF_IN], half.nodes[BUF_OUT]);
      if (half.diodes) nodes.push(half.nodes[DIODES], half.nodes[IN_P], half.nodes[IN_M]);
    }
    return nodes;
  }

  /** A junction from node a to node b, stamped as a diode. */
  private stampJunction(G: Float64Array[], b: Float64Array, junction: Junction, a: number, c: number, x: Float64Array): void {
    junction.linearize(nodeVoltage(x, a) - nodeVoltage(x, c));
    stampConductance(G, a, c, junction.gd);
    stampCurrentSource(b, c, a, junction.id - junction.gd * junction.vLin);
  }

  stampNonlinear(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const { nPos, nNeg, terms } = this;
    for (const half of this.halves) {
      const n = half.nodes;

      if (half.core) {
        // The bias pin: two junctions to V−. What flows in is the bias current.
        this.stampJunction(G, b, half.bias, n[BIAS], nNeg, x);
        const iAbc = Math.max(half.bias.id, 0);
        const gAbc = half.bias.id > 0 ? half.bias.gd : 0;

        // The input pair, linearized no further than PAIR_STEP from where it was
        const vNow = nodeVoltage(x, n[IN_P]) - nodeVoltage(x, n[IN_M]);
        const vin = half.linearized ? Math.max(half.vin - PAIR_STEP, Math.min(half.vin + PAIR_STEP, vNow)) : vNow;
        const tip = Math.tanh(vin / PAIR_VOLTS);
        const slope = (1 - tip * tip) / PAIR_VOLTS;
        half.vin = vin; half.vBias = half.bias.vLin; half.iAbc = iAbc; half.gAbc = gAbc; half.tip = tip;
        half.linearized = true;

        // The two mirrors: I·(1 + tanh)/2 from V+ into the output, I·(1 − tanh)/2 from the output to V−.
        // Both depend on the input difference and, through the bias current, on (BIAS − V−).
        const vP = nodeVoltage(x, n[IN_P]);
        // The pair was linearized at `vin`, which may not be where the iterate is: keep the difference right
        const vMUsed = vP - vin;
        for (const up of [true, false]) {
          const share = up ? (1 + tip) / 2 : (1 - tip) / 2;
          const gIn = (up ? 0.5 : -0.5) * iAbc * slope;
          terms[0] = n[IN_P]; terms[1] = gIn; terms[2] = vP;
          terms[3] = n[IN_M]; terms[4] = -gIn; terms[5] = vMUsed;
          terms[6] = n[BIAS]; terms[7] = gAbc * share; terms[8] = half.bias.vLin + nodeVoltage(x, nNeg);
          terms[9] = nNeg; terms[10] = -gAbc * share; terms[11] = nodeVoltage(x, nNeg);
          if (up) stampDependentCurrent(G, b, nPos, n[OUT], iAbc * share, terms);
          else stampDependentCurrent(G, b, n[OUT], nNeg, iAbc * share, terms);
        }

        // The output cannot be pushed past either rail
        this.stampJunction(G, b, half.clampHigh, n[OUT], nPos, x);
        this.stampJunction(G, b, half.clampLow, nNeg, n[OUT], x);
      }

      if (half.buffer) {
        // Emitter follower: the current is set by (BUF IN − BUF OUT), comes from V+,
        // and all but a five-thousandth of it bypasses the input
        const follower = half.follower;
        const vIn = nodeVoltage(x, n[BUF_IN]), vOut = nodeVoltage(x, n[BUF_OUT]);
        follower.linearize(vIn - vOut);
        const vOutUsed = vIn - follower.vLin;
        for (const base of [true, false]) {
          const part = base ? 1 / BUFFER_BETA : 1 - 1 / BUFFER_BETA;
          terms[0] = n[BUF_IN]; terms[1] = follower.gd * part; terms[2] = vIn;
          terms[3] = n[BUF_OUT]; terms[4] = -follower.gd * part; terms[5] = vOutUsed;
          terms[6] = -1; terms[7] = 0; terms[8] = 0;
          terms[9] = -1; terms[10] = 0; terms[11] = 0;
          stampDependentCurrent(G, b, base ? n[BUF_IN] : nPos, n[BUF_OUT], follower.id * part, terms);
        }
      }

      if (half.diodes) {
        this.stampJunction(G, b, half.diodeP, n[DIODES], n[IN_P], x);
        this.stampJunction(G, b, half.diodeM, n[DIODES], n[IN_M], x);
      }
    }
  }

  postStep(x: Float64Array, _dt: number): void { this.syncState(x); }

  syncState(x: Float64Array): void {
    const vNeg = nodeVoltage(x, this.nNeg), vPos = nodeVoltage(x, this.nPos);
    for (const half of this.halves) {
      const n = half.nodes;
      const at = (pin: number) => nodeVoltage(x, n[pin]);
      if (half.core) {
        half.bias.sync(at(BIAS) - vNeg);
        half.clampHigh.sync(at(OUT) - vPos);
        half.clampLow.sync(vNeg - at(OUT));
        half.vin = at(IN_P) - at(IN_M);
      }
      if (half.buffer) half.follower.sync(at(BUF_IN) - at(BUF_OUT));
      if (half.diodes) {
        half.diodeP.sync(at(DIODES) - at(IN_P));
        half.diodeM.sync(at(DIODES) - at(IN_M));
      }
    }
  }

  convergenceError(_xOld: Float64Array, xNew: Float64Array): number {
    const vNeg = nodeVoltage(xNew, this.nNeg), vPos = nodeVoltage(xNew, this.nPos);
    let worst = 0;
    for (const half of this.halves) {
      const n = half.nodes;
      const at = (pin: number) => nodeVoltage(xNew, n[pin]);
      let ok = true;
      let moved = 0;
      if (half.core && half.linearized) {
        const vBias = at(BIAS) - vNeg, vin = at(IN_P) - at(IN_M);
        const iNow = Math.max(half.bias.currentAt(vBias), 0);
        const slope = (1 - half.tip * half.tip) / PAIR_VOLTS;
        const guess = half.iAbc * half.tip + half.iAbc * slope * (vin - half.vin) + half.gAbc * half.tip * (vBias - half.vBias);
        ok = currentConverged(guess, iNow * Math.tanh(vin / PAIR_VOLTS))
          && half.bias.predicts(vBias) && half.clampHigh.predicts(at(OUT) - vPos) && half.clampLow.predicts(vNeg - at(OUT));
        moved = Math.max(Math.abs(vin - half.vin), Math.abs(vBias - half.vBias));
      }
      if (ok && half.buffer) {
        ok = half.follower.predicts(at(BUF_IN) - at(BUF_OUT));
        moved = Math.max(moved, Math.abs(at(BUF_IN) - at(BUF_OUT) - half.follower.vLin));
      }
      if (ok && half.diodes) ok = half.diodeP.predicts(at(DIODES) - at(IN_P)) && half.diodeM.predicts(at(DIODES) - at(IN_M));
      if (!ok) worst = Math.max(worst, moved, 1e-3);
    }
    return worst;
  }

  reset(): void {
    for (const half of this.halves) {
      for (const junction of [half.bias, half.clampHigh, half.clampLow, half.follower, half.diodeP, half.diodeM]) junction.reset();
      half.linearized = false;
      half.vin = 0;
    }
  }
}
