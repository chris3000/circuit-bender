/**
 * Reading a signal the way a meter does: its level, how far it swings, and
 * how often it repeats. Used on the running circuit (SignalMeter, a sample at
 * a time) and on a finished run (measureSignal, the whole trace at once).
 */

export interface SignalReading {
  mean: number;
  min: number;
  max: number;
  /** How often it repeats, or null when it is steady or has no regular beat. */
  hertz: number | null;
}

/** A swing smaller than this is a steady level, not a wave. */
const MIN_SWING = 0.02;
/** A cycle is counted when the signal has been this far (as a fraction of its swing) either side of its middle. */
const HYSTERESIS = 0.15;

/** Level, swing and frequency of a recorded trace. */
export function measureSignal(samples: ArrayLike<number>, sampleRate: number): SignalReading {
  const n = samples.length;
  if (n === 0) return { mean: 0, min: 0, max: 0, hertz: null };
  let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const reading: SignalReading = { mean: sum / n, min, max, hertz: null };
  const swing = max - min;
  if (!(swing >= MIN_SWING)) return reading;

  // Rising crossings of the upper threshold, each placed between two samples
  const middle = (min + max) / 2;
  const upper = middle + swing * HYSTERESIS, lower = middle - swing * HYSTERESIS;
  let high = samples[0] > upper;
  let first = -1, second = -1, last = -1, edges = 0;
  for (let i = 1; i < n; i++) {
    const v = samples[i];
    if (!high && v > upper) {
      high = true;
      const before = samples[i - 1];
      const at = before < upper ? i - 1 + (upper - before) / (v - before) : i;
      if (first < 0) first = at;
      else if (second < 0) second = at;
      last = at;
      edges++;
    } else if (high && v < lower) {
      high = false;
    }
  }
  // A trace usually begins with the circuit starting up, and its first cycle
  // is then not like the rest: with cycles to spare, it is left out
  if (edges >= 3 && last > second) reading.hertz = ((edges - 2) / (last - second)) * sampleRate;
  else if (edges === 2 && last > first) reading.hertz = (1 / (last - first)) * sampleRate;
  return reading;
}

/** How many reporting periods the swing is judged over: long enough to hold both halves of a slow blink. */
const ENVELOPE_WINDOWS = 16;

/**
 * The same reading, kept up to date on a signal as it arrives. `read` gives
 * the level and swing since it was last called, and the frequency from the
 * cycles seen in that time (or, for something slower than that, from the
 * last full cycle, for as long as the next one is not overdue; its swing is
 * then that of the last couple of seconds).
 */
export class SignalMeter {
  private count = 0;
  private sum = 0;
  private min = Infinity;
  private max = -Infinity;
  private last = 0;

  private lows: number[] = [];
  private highs: number[] = [];
  private upper = Infinity;
  private lower = -Infinity;

  private time = 0;
  private high = false;
  private lastEdge = -1;
  private lastPeriod = 0;
  private periodSum = 0;
  private periods = 0;
  private hertz: number | null = null;

  constructor(private readonly sampleRate: number) {}

  add(value: number): void {
    this.time++;
    this.count++;
    this.sum += value;
    this.last = value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
    if (!this.high && value > this.upper) {
      this.high = true;
      if (this.lastEdge >= 0) {
        this.lastPeriod = this.time - this.lastEdge;
        this.periodSum += this.lastPeriod;
        this.periods++;
      }
      this.lastEdge = this.time;
    } else if (this.high && value < this.lower) {
      this.high = false;
    }
  }

  read(): SignalReading {
    const empty = this.count === 0;
    const min = empty ? this.last : this.min, max = empty ? this.last : this.max;
    const reading: SignalReading = { mean: empty ? this.last : this.sum / this.count, min, max, hertz: null };

    // Where a cycle is counted from follows the swing of the last couple of seconds
    this.lows.push(min);
    this.highs.push(max);
    if (this.lows.length > ENVELOPE_WINDOWS) { this.lows.shift(); this.highs.shift(); }
    const low = Math.min(...this.lows), top = Math.max(...this.highs);
    const swing = top - low;
    if (swing >= MIN_SWING) {
      const watching = this.upper !== Infinity;
      this.upper = (low + top) / 2 + swing * HYSTERESIS;
      this.lower = (low + top) / 2 - swing * HYSTERESIS;
      // Starting to watch a signal that is already up: that is not it rising
      if (!watching) this.high = this.last > this.upper;
    } else {
      this.upper = Infinity;
      this.lower = -Infinity;
      this.high = false;
      this.lastEdge = -1;
      this.hertz = null;
    }

    if (this.periods > 0) {
      this.hertz = (this.periods / this.periodSum) * this.sampleRate;
    } else if (this.lastEdge < 0 || this.time - this.lastEdge > 1.5 * this.lastPeriod + this.count) {
      this.hertz = null; // the next cycle is overdue: it has stopped
    }
    reading.hertz = this.hertz;
    // Something slower than the readings themselves (a blink) is in only one
    // half of its cycle at a time: its swing is the swing of the last cycles
    if (this.hertz !== null && this.sampleRate / this.hertz > this.count) {
      reading.min = low;
      reading.max = top;
    }

    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
    this.periodSum = 0;
    this.periods = 0;
    return reading;
  }
}
