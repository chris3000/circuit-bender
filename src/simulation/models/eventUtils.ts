import { stampConductance } from './stampUtils';

/**
 * Fraction in [0, 1) at which a quantity moving linearly from f0 to f1 first
 * becomes positive. 0 if it already is; Infinity if it never does.
 */
export function crossingFraction(f0: number, f1: number): number {
  if (f0 > 0) return 0;
  if (f1 > 0) return f0 / (f0 - f1);
  return Infinity;
}

/** Hysteresis (volts) that keeps a clamp from flip-flopping on rounding noise. */
const CLAMP_TOL = 1e-7;

/**
 * Piecewise-linear clamp: an ideal diode with on-conductance g and forward
 * drop vOn, from node a (anode) to node b (cathode). While on it carries
 * i = g·(Va − Vb − vOn); it switches exactly where that current crosses zero,
 * so the element is continuous and needs no Newton iteration — the switching
 * is handled by the solver's event mechanism.
 */
export class PwlClamp {
  on = false;
  private fraction = Infinity;

  constructor(private readonly g: number, private readonly vOn: number) {}

  stampMatrix(G: Float64Array[], a: number, b: number): void {
    if (this.on) stampConductance(G, a, b, this.g);
  }

  stampRhs(rhs: Float64Array, a: number, b: number): void {
    if (!this.on || this.vOn === 0) return;
    const i = this.g * this.vOn;
    if (a >= 0) rhs[a] += i;
    if (b >= 0) rhs[b] -= i;
  }

  findEvent(x0: Float64Array, x1: Float64Array, a: number, b: number): number {
    const f0 = (a >= 0 ? x0[a] : 0) - (b >= 0 ? x0[b] : 0) - this.vOn;
    const f1 = (a >= 0 ? x1[a] : 0) - (b >= 0 ? x1[b] : 0) - this.vOn;
    this.fraction = this.on
      ? crossingFraction(-f0 - CLAMP_TOL, -f1 - CLAMP_TOL)
      : crossingFraction(f0 - CLAMP_TOL, f1 - CLAMP_TOL);
    return this.fraction;
  }

  /** Record that the last step held no event for this clamp. */
  noEvent(): void {
    this.fraction = Infinity;
  }

  /** Returns true if the clamp changed state. */
  applyEvent(fraction: number): boolean {
    if (this.fraction > fraction) return false;
    this.on = !this.on;
    this.fraction = Infinity;
    return true;
  }

  reset(): void {
    this.on = false;
    this.fraction = Infinity;
  }
}
