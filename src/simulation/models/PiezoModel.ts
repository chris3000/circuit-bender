import type { ComponentModel } from './ComponentModel';
import { CapacitorModel } from './CapacitorModel';
import { stampConductance, stampCurrentSource } from './stampUtils';

/** A 27 mm disc is about this much capacitor. */
const FARADS = 22e-9;
/** What leaks across it. */
const LEAK_OHMS = 10e6;
/** A knock rings the disc and whatever it is stuck to: two notes that die away, in volts with nothing connected. */
const KNOCK = [
  { hertz: 310, seconds: 0.045, volts: 0.22 },
  { hertz: 2350, seconds: 0.006, volts: 0.14 },
];
const KNOCK_OVER = 0.4;
const TWO_PI = 2 * Math.PI;

/**
 * A piezo disc: a slice of ceramic on a brass plate. It works both ways. A
 * voltage across it bends it, which is a (thin, bright) loudspeaker; and
 * bending it makes a voltage, which is a contact microphone.
 *
 * Electrically it is a capacitor, and that is how it is stamped. What is
 * heard is the voltage across it. Tapping it (`tap` going from 0 to 1) is a
 * knock: a brief ringing voltage in series with the capacitor, for whatever
 * it is plugged into to amplify.
 *
 * Pins: + (the ceramic, 0), − (the brass, 1).
 */
export class PiezoModel implements ComponentModel {
  readonly type = 'piezo';
  readonly nonlinear = false;

  private nPos = -1;
  private nNeg = -1;
  private readonly disc = new CapacitorModel();
  /** Seconds since the last knock. */
  private since = Infinity;
  private held = false;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], internalNodeStart: number, branchStart: number, _params: Record<string, number>): void {
    [this.nPos, this.nNeg] = pinNodes;
    this.disc.init(pinNodes, internalNodeStart, branchStart, { capacitance: FARADS });
    this.reset();
  }

  updateParam(key: string, value: number): void {
    if (key !== 'tap') return;
    const down = value >= 0.5;
    if (down && !this.held) this.since = 0;
    this.held = down;
  }

  stampMatrix(G: Float64Array[], dt: number, be: boolean): void {
    this.disc.stampMatrix(G, dt, be);
    stampConductance(G, this.nPos, this.nNeg, 1 / LEAK_OHMS);
  }

  stampRhs(b: Float64Array, dt: number, be: boolean): void {
    this.disc.stampRhs(b, dt, be);
    if (this.since >= KNOCK_OVER || !Number.isFinite(dt)) return;
    // A voltage v in series with a capacitor is a current C·dv/dt in parallel with it
    stampCurrentSource(b, this.nPos, this.nNeg, FARADS * this.knockSlope(this.since + dt));
  }

  /** How fast the knock's voltage is changing, `t` seconds after it. */
  private knockSlope(t: number): number {
    let slope = 0;
    for (const { hertz, seconds, volts } of KNOCK) {
      const w = TWO_PI * hertz;
      slope += volts * Math.exp(-t / seconds) * (w * Math.cos(w * t) - Math.sin(w * t) / seconds);
    }
    return slope;
  }

  postStep(x: Float64Array, dt: number, be?: boolean): void {
    this.disc.postStep(x, dt, be);
    if (this.since < KNOCK_OVER) this.since += dt;
  }

  syncState(x: Float64Array, elapsed?: number): void {
    this.disc.syncState(x);
    if (elapsed && this.since < KNOCK_OVER) this.since += elapsed;
  }

  /** What is heard: the voltage across the disc. */
  audioTap(): { positive: number; negative: number } {
    return { positive: this.nPos, negative: this.nNeg };
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.disc.reset();
    this.since = Infinity;
    this.held = false;
  }
}
