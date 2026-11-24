import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';
import { NoiseSource } from './deviceUtils';

/** What it can play. A part's `wave` parameter is a number: the place in this list. */
export const SIGNAL_WAVES = ['sine', 'triangle', 'square', 'saw', 'guitar', 'noise'] as const;
export type SignalWave = typeof SIGNAL_WAVES[number];

/** What is behind the socket: the output resistance of whatever is plugged in. */
const SOURCE_OHMS = 600;
/** A plucked string: how often it is plucked again, how long its fundamental rings, and how many harmonics it has. */
const PLUCK_EVERY = 1.6;
const PLUCK_RING = 0.7;
const PLUCK_HARMONICS = 6;
const PLUCK_ATTACK = 0.002;
const TWO_PI = 2 * Math.PI;

const unit = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/**
 * Audio in: a signal coming into the circuit from outside, as from a socket
 * with something plugged into it: a tone to test with, a plucked string to
 * stand for a guitar, hiss.
 *
 * It is a voltage source to ground with 600 Ω in series, like a line output.
 * `wave` says what it plays (its place in `SIGNAL_WAVES`), `volts` is its
 * peak at full level and `level` (0 to 1) turns it down; `frequency` is its
 * pitch.
 *
 * The edges of the square and the saw are events: the step they fall in is
 * cut at the edge, so they are as sharp and as exactly timed as a gate's.
 *
 * Pin: OUT (0).
 */
export class SignalSourceModel implements ComponentModel {
  readonly type = 'audio-input';
  readonly nonlinear = false;

  private node = -1;
  private wave: SignalWave = 'sine';
  private frequency = 220;
  private volts = 1;
  private level = 1;

  /** Where in its cycle it is (0 to 1), and how long it has been playing. */
  private phase = 0;
  private time = 0;
  /** A square is high for the first half of its cycle. */
  private high = true;
  /** The step being solved, for placing an edge inside it. */
  private stepSeconds = 0;
  private edge = Infinity;
  private readonly hiss = new NoiseSource(0x1f123bb5);
  private roll = 0;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(pinNodes: number[], _internalNodeStart: number, _branchStart: number, params: Record<string, number>): void {
    this.node = pinNodes[0];
    this.reset();
    this.wave = 'sine';
    this.updateParam('wave', params.wave);
    this.updateParam('frequency', params.frequency);
    this.updateParam('volts', params.volts);
    this.level = params.level === undefined ? 1 : unit(params.level);
  }

  updateParam(key: string, value: number): void {
    if (!Number.isFinite(value)) return;
    if (key === 'wave') {
      const wave = SIGNAL_WAVES[Math.round(value)];
      if (!wave || wave === this.wave) return;
      this.wave = wave;
      // Wherever the last wave had got to, this one starts inside its cycle
      this.phase -= Math.floor(this.phase);
      this.high = this.phase < 0.5;
    } else if (key === 'frequency') this.frequency = Math.max(0.01, Math.min(20000, value));
    else if (key === 'volts') this.volts = Math.max(0, Math.min(20, value));
    else if (key === 'level') this.level = unit(value);
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    stampConductance(G, this.node, -1, 1 / SOURCE_OHMS);
  }

  stampRhs(b: Float64Array, dt: number, _be: boolean): void {
    this.stepSeconds = dt;
    if (this.node < 0) return;
    // Where the signal will be at the end of this step (at the start, for the
    // endless step that finds the circuit's resting point)
    const ahead = Number.isFinite(dt) ? dt : 0;
    b[this.node] += this.value(this.phase + ahead * this.frequency, this.time + ahead) / SOURCE_OHMS;
  }

  /** The open-circuit voltage at `phase` cycles and `time` seconds, in the half-cycle it is in now. */
  private value(phase: number, time: number): number {
    const peak = this.volts * this.level;
    switch (this.wave) {
      case 'sine': return peak * Math.sin(TWO_PI * phase);
      case 'triangle': {
        const p = phase - Math.floor(phase);
        return peak * (p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4);
      }
      // Until its edge has happened a square stays where it is, and a saw keeps climbing
      case 'square': return this.high ? peak : -peak;
      case 'saw': return peak * (2 * phase - 1);
      case 'noise': return peak * this.roll / Math.sqrt(3);
      case 'guitar': {
        const since = time % PLUCK_EVERY;
        const attack = Math.min(1, since / PLUCK_ATTACK);
        let sum = 0;
        for (let h = 1; h <= PLUCK_HARMONICS; h++) {
          sum += Math.exp(-since * h / PLUCK_RING) * Math.sin(TWO_PI * h * phase) / h;
        }
        return peak * attack * sum * 0.62;
      }
    }
  }

  getDiscreteState(): number { return 0; }

  /** Where in the step being solved the square turns over or the saw falls back. */
  findEvent(_x0: Float64Array, _x1: Float64Array): number {
    this.edge = Infinity;
    if ((this.wave !== 'square' && this.wave !== 'saw') || !Number.isFinite(this.stepSeconds) || this.stepSeconds <= 0) return Infinity;
    const next = this.wave === 'square' ? (this.high ? 0.5 : 1) : 1;
    const cycles = next - this.phase;
    const fraction = cycles <= 0 ? 0 : cycles / (this.frequency * this.stepSeconds);
    if (fraction <= 1) this.edge = fraction;
    return this.edge;
  }

  applyEvent(fraction: number): void {
    if (this.edge > fraction) return;
    this.edge = Infinity;
    if (this.wave === 'square') {
      this.high = !this.high;
      if (this.high) this.phase -= 1;
    } else {
      this.phase -= 1;
    }
    if (this.phase < 0) this.phase = 0;
  }

  postStep(_x: Float64Array, dt: number): void {
    this.advance(dt);
    this.roll = this.hiss.next();
  }

  syncState(_x: Float64Array, elapsed?: number): void {
    if (elapsed) this.advance(elapsed);
  }

  private advance(seconds: number): void {
    this.time += seconds;
    this.phase += seconds * this.frequency;
    // The smooth waves have no edge to wrap them
    if (this.wave !== 'square' && this.wave !== 'saw' && this.phase >= 1) this.phase -= Math.floor(this.phase);
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.phase = 0;
    this.time = 0;
    this.high = true;
    this.edge = Infinity;
    this.stepSeconds = 0;
    this.roll = 0;
    this.hiss.reset();
  }
}
