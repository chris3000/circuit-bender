import type { ComponentModel } from './ComponentModel';
import { nodeVoltage, stampConductance, stampCurrentSource } from './stampUtils';
import { BOLTZMANN_VOLTAGE, currentConverged } from './junctionUtils';
import { channelCurrent, Junction, stampDependentCurrent } from './deviceUtils';

export interface JFETParams {
  /** Pinch-off voltage: the gate voltage (from the source) at which the channel closes. Negative. */
  VTO: number;
  /** Transconductance coefficient (A/V²): the current with gate and source together is BETA·VTO². */
  BETA: number;
  LAMBDA: number;
  /** Saturation current of the gate junction (A). */
  IS: number;
}

/** 2N5457: closes at about −1.4 V, passes about 2 mA with its gate at its source. */
export const JFET_2N5457_PARAMS: JFETParams = { VTO: -1.372, BETA: 1.125e-3, LAMBDA: 2.3e-3, IS: 2.05e-13 };

/**
 * N-channel junction field-effect transistor.
 *
 * Its channel follows the square law: with little voltage across it, it is a
 * resistor that the gate sets (which is how a synthesizer uses it, as a
 * voltage-controlled resistor and as a switch), and with more it passes a
 * current that the gate sets (a source follower, an amplifier). The gate is a
 * diode to each end of the channel; it is normally reverse-biased, and
 * conducts if the gate is driven above them.
 *
 * Pins: G (0), D (1), S (2). Drain and source are interchangeable, as they
 * are in a real one.
 */
export class JFETModel implements ComponentModel {
  readonly type = 'jfet';
  readonly nonlinear = true;

  private nG = -1; private nD = -1; private nS = -1;
  private readonly k: number;
  private readonly gateSource: Junction;
  private readonly gateDrain: Junction;
  // Where the channel was last linearized
  private vgs = 0; private vds = 0;
  private iLin = 0; private gmLin = 0; private gdsLin = 0;
  private linearized = false;
  private readonly terms = new Float64Array(9);

  constructor(private readonly params: JFETParams) {
    this.k = 2 * params.BETA;
    this.gateSource = new Junction(params.IS, BOLTZMANN_VOLTAGE);
    this.gateDrain = new Junction(params.IS, BOLTZMANN_VOLTAGE);
  }

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, _params: Record<string, number>): void {
    [this.nG, this.nD, this.nS] = pinNodes;
    this.reset();
  }

  stampMatrix(_G: Float64Array[], _dt: number, _be: boolean): void {}

  getNonlinearNodes(): number[] {
    return [this.nG, this.nD, this.nS];
  }

  stampNonlinear(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const { nG, nD, nS, params, terms } = this;
    const vg = nodeVoltage(x, nG), vd = nodeVoltage(x, nD), vs = nodeVoltage(x, nS);

    const channel = channelCurrent(vg - vs, vd - vs, this.k, params.VTO, params.LAMBDA);
    this.vgs = vg - vs; this.vds = vd - vs;
    this.iLin = channel.id; this.gmLin = channel.gm; this.gdsLin = channel.gds;
    this.linearized = true;
    terms[0] = nG; terms[1] = channel.gm; terms[2] = vg;
    terms[3] = nD; terms[4] = channel.gds; terms[5] = vd;
    terms[6] = nS; terms[7] = -channel.gm - channel.gds; terms[8] = vs;
    stampDependentCurrent(G, b, nD, nS, channel.id, terms);

    // The gate junctions
    this.gateSource.linearize(vg - vs);
    stampConductance(G, nG, nS, this.gateSource.gd);
    stampCurrentSource(b, nS, nG, this.gateSource.id - this.gateSource.gd * this.gateSource.vLin);
    this.gateDrain.linearize(vg - vd);
    stampConductance(G, nG, nD, this.gateDrain.gd);
    stampCurrentSource(b, nD, nG, this.gateDrain.id - this.gateDrain.gd * this.gateDrain.vLin);
  }

  postStep(x: Float64Array, _dt: number): void { this.syncState(x); }

  syncState(x: Float64Array): void {
    const vg = nodeVoltage(x, this.nG);
    this.gateSource.sync(vg - nodeVoltage(x, this.nS));
    this.gateDrain.sync(vg - nodeVoltage(x, this.nD));
  }

  convergenceError(_xOld: Float64Array, xNew: Float64Array): number {
    if (!this.linearized) return 0;
    const vg = nodeVoltage(xNew, this.nG), vd = nodeVoltage(xNew, this.nD), vs = nodeVoltage(xNew, this.nS);
    const dGs = vg - vs - this.vgs, dDs = vd - vs - this.vds;
    const now = channelCurrent(vg - vs, vd - vs, this.k, this.params.VTO, this.params.LAMBDA).id;
    if (currentConverged(this.iLin + this.gmLin * dGs + this.gdsLin * dDs, now)
      && this.gateSource.predicts(vg - vs) && this.gateDrain.predicts(vg - vd)) return 0;
    return Math.max(Math.abs(dGs), Math.abs(dDs), 1e-3);
  }

  /** Drain to source through the channel, at the solution x. */
  channelAmps(x: Float64Array): number {
    const vs = nodeVoltage(x, this.nS);
    return channelCurrent(nodeVoltage(x, this.nG) - vs, nodeVoltage(x, this.nD) - vs, this.k, this.params.VTO, this.params.LAMBDA).id;
  }

  reset(): void {
    this.gateSource.reset();
    this.gateDrain.reset();
    this.linearized = false;
  }
}
