import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';

/** Series resistance with the starve knob all the way round. */
const STARVE_MAX_OHMS = 1e6;
/** How many decades the knob sweeps on its way there. */
const STARVE_DECADES = 4;

/**
 * What the starve knob puts in series with the supply: nothing at 0, then
 * rising a decade for every quarter turn (about 900 Ω, 10 kΩ, 100 kΩ) to
 * 1 MΩ at 1. A logic chip draws microamps and needs the top of the range to
 * notice; an amplifier that draws milliamps sags within the first quarter.
 */
export function starveOhms(starve: number): number {
  const s = Number.isFinite(starve) ? Math.max(0, Math.min(1, starve)) : 0;
  return STARVE_MAX_OHMS * (Math.pow(10, STARVE_DECADES * s) - 1) / (Math.pow(10, STARVE_DECADES) - 1);
}

/** The decoupling capacitor every board has across its supply. */
const DECOUPLING_FARADS = 100e-9;

/**
 * The supply: an ideal voltage source, the starve resistance in series with
 * it, and the board's decoupling capacitor across what comes out.
 *
 * Starving a circuit is the oldest bend there is: a pot between the battery
 * and the board. The supply the chips see then sags with every milliamp they
 * draw and recovers as fast as the capacitor refills, so everything on the
 * rail gets quieter, oscillators pull on each other through it, and anything
 * that draws real current gives up. Nothing here knows about any of that —
 * it is a resistor and a capacitor, and the rest follows from the circuit.
 *
 * With the knob at rest the capacitor sits across an ideal source, where it
 * does nothing, and is left out.
 */
export class PowerSourceModel implements ComponentModel {
  readonly type = 'power';
  readonly nonlinear = false;
  private nPos = -1;
  private nNeg = -1;
  private br = -1;
  private voltage = 9;
  private series = 0;
  private vPrev = 0;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 1; }

  init(pinNodes: number[], _internalNodeStart: number, branchStart: number, params: Record<string, number>): void {
    this.nPos = pinNodes[0];
    this.nNeg = pinNodes[1];
    this.br = branchStart;
    this.voltage = params.voltage ?? 9;
    this.series = starveOhms(params.starve ?? 0);
  }

  stampMatrix(G: Float64Array[], dt: number, _be: boolean): void {
    const { nPos, nNeg, br } = this;
    // Branch equation: V(pos) − V(neg) − R·i = V, with i the branch current
    if (nPos >= 0) {
      G[br][nPos] += 1;
      G[nPos][br] += 1;
    }
    if (nNeg >= 0) {
      G[br][nNeg] -= 1;
      G[nNeg][br] -= 1;
    }
    G[br][br] -= this.series;
    // Decoupling capacitor, always backward Euler: it is there to hold the
    // rail still, and must not ring when a chip switches
    if (this.series > 0) stampConductance(G, nPos, nNeg, DECOUPLING_FARADS / dt);
  }

  stampRhs(b: Float64Array, dt: number, _be: boolean): void {
    b[this.br] += this.voltage;
    if (this.series > 0) stampCurrentSource(b, this.nPos, this.nNeg, (DECOUPLING_FARADS / dt) * this.vPrev);
  }

  postStep(x: Float64Array): void { this.remember(x); }
  syncState(x: Float64Array): void { this.remember(x); }

  private remember(x: Float64Array): void {
    this.vPrev = (this.nPos >= 0 ? x[this.nPos] : 0) - (this.nNeg >= 0 ? x[this.nNeg] : 0);
  }

  updateParam(key: string, value: number): void {
    if (!Number.isFinite(value)) return;
    if (key === 'voltage') this.voltage = value;
    else if (key === 'starve') this.series = starveOhms(value);
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void { this.vPrev = 0; }
}
