import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';
import { crossingFraction, PwlClamp } from './eventUtils';

const NUM_GATES = 6;
// CD40106 datasheet typical thresholds at Vdd=9V (interpolated from 5V/10V data)
const VT_POS_RATIO = 0.59;  // VT+ ≈ 5.3V at 9V supply
const VT_NEG_RATIO = 0.40;  // VT- ≈ 3.6V at 9V supply
const ROUT = 280;
const ROFF = 1e9;
const G_CLAMP = 0.1;   // 10Ω output protection diode on-conductance
const V_CLAMP = 0.3;   // conducts once the output is this far beyond a rail

/**
 * CD40106 hex Schmitt-trigger inverter.
 *
 * Each gate output is a 280Ω switch to one rail. The gate flips at the exact
 * instant its input crosses a threshold (reported to the solver as an event),
 * not at the next sample boundary. Output protection diodes are
 * piecewise-linear clamps, also event-driven, so the model stays linear.
 */
export class SchmittTriggerModel implements ComponentModel {
  readonly type = 'cd40106';
  readonly nonlinear = false;
  readonly ignoresUnconnectedPins = true;
  private pins: number[] = [];
  private gateStates: boolean[] = [true, true, true, true, true, true];
  private gateFraction: number[] = [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity];
  private clampHigh: PwlClamp[] = [];
  private clampLow: PwlClamp[] = [];
  private clampsOn = 0;
  /** Gates whose output is wired to something; the rest cannot affect the circuit. */
  private activeGates: number[] = [0, 1, 2, 3, 4, 5];

  constructor() {
    for (let g = 0; g < NUM_GATES; g++) {
      this.clampHigh.push(new PwlClamp(G_CLAMP, V_CLAMP));
      this.clampLow.push(new PwlClamp(G_CLAMP, V_CLAMP));
    }
  }

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[], _internalNodeStart: number, _branchStart: number,
    _params: Record<string, number>, pinConnected?: boolean[]
  ): void {
    this.pins = [...pinNodes];
    this.activeGates = [];
    for (let g = 0; g < NUM_GATES; g++) {
      if (pinNodes[g + 6] >= 0 && (!pinConnected || pinConnected[g + 6])) this.activeGates.push(g);
    }
    this.reset();
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
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

      // Protection diodes: output → VDD and VSS → output
      this.clampHigh[g].stampMatrix(G, nOut, nVdd);
      this.clampLow[g].stampMatrix(G, nVss, nOut);
    }
  }

  stampRhs(b: Float64Array, _dt: number, _be: boolean): void {
    if (this.clampsOn === 0) return;
    const nVdd = this.pins[12];
    const nVss = this.pins[13];
    for (let g = 0; g < NUM_GATES; g++) {
      const nOut = this.pins[g + 6];
      if (nOut < 0) continue;
      if (this.clampHigh[g].on) this.clampHigh[g].stampRhs(b, nOut, nVdd);
      if (this.clampLow[g].on) this.clampLow[g].stampRhs(b, nVss, nOut);
    }
  }


  getDiscreteState(): number {
    let s = 0;
    for (let g = 0; g < NUM_GATES; g++) {
      if (this.gateStates[g]) s |= 1 << g;
      if (this.clampHigh[g].on) s |= 1 << (g + 6);
      if (this.clampLow[g].on) s |= 1 << (g + 12);
    }
    return s;
  }

  findEvent(x0: Float64Array, x1: Float64Array): number {
    const nVdd = this.pins[12];
    const nVss = this.pins[13];
    const vdd0 = nVdd >= 0 ? x0[nVdd] : 0, vdd1 = nVdd >= 0 ? x1[nVdd] : 0;
    const vss0 = nVss >= 0 ? x0[nVss] : 0, vss1 = nVss >= 0 ? x1[nVss] : 0;
    const range0 = vdd0 - vss0, range1 = vdd1 - vss1;
    const powered = range0 >= 0.1 && range1 >= 0.1;
    const vtPos0 = vss0 + range0 * VT_POS_RATIO, vtPos1 = vss1 + range1 * VT_POS_RATIO;
    const vtNeg0 = vss0 + range0 * VT_NEG_RATIO, vtNeg1 = vss1 + range1 * VT_NEG_RATIO;
    const active = this.activeGates;
    let first = Infinity;

    for (let a = 0; a < active.length; a++) {
      const g = active[a];
      let f = Infinity;
      const nIn = this.pins[g];
      if (powered && nIn >= 0) {
        // Output high → goes low when the input rises through VT+;
        // output low → goes high when the input falls through VT−
        f = this.gateStates[g]
          ? crossingFraction(x0[nIn] - vtPos0, x1[nIn] - vtPos1)
          : crossingFraction(vtNeg0 - x0[nIn], vtNeg1 - x1[nIn]);
      }
      this.gateFraction[g] = f;
      if (f < first) first = f;

      const nOut = this.pins[g + 6];
      if (nOut < 0) continue;
      const hi = this.clampHigh[g], lo = this.clampLow[g];
      const o0 = x0[nOut], o1 = x1[nOut];
      if (!hi.on && !lo.on
        && o0 <= vdd0 + V_CLAMP && o1 <= vdd1 + V_CLAMP
        && o0 >= vss0 - V_CLAMP && o1 >= vss1 - V_CLAMP) {
        // Output stayed between the rails: neither protection diode can switch
        hi.noEvent();
        lo.noEvent();
        continue;
      }
      const fh = hi.findEvent(x0, x1, nOut, nVdd);
      if (fh < first) first = fh;
      const fl = lo.findEvent(x0, x1, nVss, nOut);
      if (fl < first) first = fl;
    }
    return first;
  }

  applyEvent(fraction: number): void {
    for (let g = 0; g < NUM_GATES; g++) {
      if (this.gateFraction[g] <= fraction) {
        this.gateStates[g] = !this.gateStates[g];
        this.gateFraction[g] = Infinity;
      }
      if (this.clampHigh[g].applyEvent(fraction)) this.clampsOn += this.clampHigh[g].on ? 1 : -1;
      if (this.clampLow[g].applyEvent(fraction)) this.clampsOn += this.clampLow[g].on ? 1 : -1;
    }
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.clampsOn = 0;
    for (let g = 0; g < NUM_GATES; g++) {
      this.gateStates[g] = true;
      this.gateFraction[g] = Infinity;
      this.clampHigh[g].reset();
      this.clampLow[g].reset();
    }
  }

  getGateState(gateIndex: number): boolean {
    return this.gateStates[gateIndex] ?? true;
  }
}
