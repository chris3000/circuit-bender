import { computeVcrit, currentConverged, limitJunctionVoltage, linearizeJunction } from './junctionUtils';

/**
 * Pieces that the transistor-level models are put together from: a p-n
 * junction, a square-law channel, and the stamp for a current that depends on
 * the voltages of several nodes.
 */

/**
 * A p-n junction inside a bigger model. It is limited against the previous
 * iteration, linearized and checked exactly as `DiodeModel` does it; the
 * model it is part of reads its voltage and stamps its current.
 */
export class Junction {
  /** The voltage it was last linearized at, and its current and conductance there. */
  vLin = 0;
  id = 0;
  gd = 0;
  private readonly vcrit: number;

  /** `nVt` is the emission coefficient times the thermal voltage: 26 mV for one junction, twice that for two in series. */
  constructor(private readonly is: number, private readonly nVt: number) {
    this.vcrit = computeVcrit(is, 1, nVt);
  }

  /** Linearize at `v`, the voltage the iterate has it at. */
  linearize(v: number): void {
    const vd = limitJunctionVoltage(v, this.vLin, this.nVt, this.vcrit);
    const point = linearizeJunction(vd, this.is, 1, this.nVt);
    this.vLin = vd;
    this.id = point.Id;
    this.gd = point.Gd;
  }

  /** What it passes at `v`. */
  currentAt(v: number): number {
    return linearizeJunction(v, this.is, 1, this.nVt).Id;
  }

  /** Whether the last linearization gives the right current at `v`. */
  predicts(v: number): boolean {
    return currentConverged(this.id + this.gd * (v - this.vLin), this.currentAt(v));
  }

  /** The solution is `v` here now: the next iteration starts from it. */
  sync(v: number): void {
    this.vLin = v;
  }

  reset(): void {
    this.vLin = 0;
    this.id = 0;
    this.gd = 0;
  }
}

/** A channel's current, drain to source, and how it changes with the gate and drain voltages (both from the source). */
export interface ChannelPoint {
  id: number;
  gm: number;
  gds: number;
}

/** Enough conductance to keep a channel that is off from leaving its nodes adrift. */
const G_OFF = 1e-9;

/**
 * The square law of a field-effect channel (Shichman and Hodges): nothing
 * below the threshold `vt`, a resistor that the gate sets while the drain is
 * low (the triode region), a current that the gate sets once it is not.
 * `lambda` tilts the flat part, which is what gives an amplifier made of it
 * a finite gain.
 *
 * A channel is the same from either end, so with the drain below the source
 * the two change places.
 */
export function channelCurrent(vgs: number, vds: number, k: number, vt: number, lambda: number): ChannelPoint {
  if (vds < 0) {
    const r = forwardChannel(vgs - vds, -vds, k, vt, lambda);
    return { id: -r.id + G_OFF * vds, gm: -r.gm, gds: r.gm + r.gds + G_OFF };
  }
  const f = forwardChannel(vgs, vds, k, vt, lambda);
  return { id: f.id + G_OFF * vds, gm: f.gm, gds: f.gds + G_OFF };
}

function forwardChannel(vgs: number, vds: number, k: number, vt: number, lambda: number): ChannelPoint {
  const over = vgs - vt;
  if (over <= 0) return { id: 0, gm: 0, gds: 0 };
  const tilt = 1 + lambda * vds;
  if (vds < over) {
    const core = k * (over * vds - 0.5 * vds * vds);
    return { id: core * tilt, gm: k * vds * tilt, gds: k * (over - vds) * tilt + core * lambda };
  }
  const core = 0.5 * k * over * over;
  return { id: core * tilt, gm: k * over * tilt, gds: core * lambda };
}

/**
 * Stamp a current that flows from node `from` to node `to` inside a device
 * and depends on up to four node voltages, linearized where the iterate is:
 *
 *   I ≈ i0 + Σ g·(V(node) − v)
 *
 * `terms` is a flat list of node, g, v for each voltage it depends on. Every
 * node named here must be among the model's `getNonlinearNodes`.
 */
export function stampDependentCurrent(
  G: Float64Array[], b: Float64Array, from: number, to: number, i0: number, terms: ArrayLike<number>,
): void {
  let rest = i0;
  for (let t = 0; t < terms.length; t += 3) {
    const node = terms[t], g = terms[t + 1];
    rest -= g * terms[t + 2];
    if (node < 0) continue;
    if (from >= 0) G[from][node] += g;
    if (to >= 0) G[to][node] -= g;
  }
  if (from >= 0) b[from] -= rest;
  if (to >= 0) b[to] += rest;
}

/**
 * White noise that is the same every time: a small generator with a seed, so
 * a circuit that hisses hisses the same way in a test as it did yesterday.
 * Values are spread evenly over ±√3, which makes their power 1.
 */
export class NoiseSource {
  private state: number;

  constructor(private readonly seed = 0x2545f491) {
    this.state = seed;
  }

  next(): number {
    // xorshift32
    let s = this.state;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    this.state = s;
    return (s / 0xffffffff * 2 - 1) * Math.sqrt(3);
  }

  reset(): void {
    this.state = this.seed;
  }
}
