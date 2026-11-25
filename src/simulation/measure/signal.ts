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

/**
 * Level, swing and frequency of a recorded trace. `minSwing` is the smallest
 * swing that counts as a wave: the default suits volts and sound; a trace of
 * a small current (an LED's, in amps) needs a smaller one.
 */
export function measureSignal(samples: ArrayLike<number>, sampleRate: number, minSwing = MIN_SWING): SignalReading {
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
  if (!(swing >= minSwing)) return reading;

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

/** Where a recorded trace rises through `level`, in samples, each placed between two samples. A cycle counts once it has also been below `rearm`. */
export function risings(samples: ArrayLike<number>, level: number, rearm: number): number[] {
  const at: number[] = [];
  let high = samples[0] > level;
  for (let i = 1; i < samples.length; i++) {
    const v = samples[i];
    if (!high && v > level) {
      high = true;
      const before = samples[i - 1];
      at.push(before < level ? i - 1 + (level - before) / (v - before) : i);
    } else if (high && v < rearm) {
      high = false;
    }
  }
  return at;
}

/**
 * How large each harmonic of a recorded wave is: the size (peak, in the
 * trace's own units) of the pure tone at `hertz`, at twice that, three times
 * and so on, `count` of them. A square wave swinging ±0.5 reads 0.64, 0,
 * 0.21, 0, 0.13: it has only the odd ones. Read over a whole number of cycles.
 */
export function harmonics(samples: ArrayLike<number>, sampleRate: number, hertz: number, count: number): number[] {
  const period = sampleRate / hertz;
  const cycles = Math.floor(samples.length / period);
  if (!(hertz > 0) || cycles < 1) return new Array(count).fill(0);
  // The last whole cycles: the start of a trace may still be settling
  const length = Math.round(cycles * period);
  const start = samples.length - length;
  let mean = 0;
  for (let i = 0; i < length; i++) mean += samples[start + i];
  mean /= length;
  const sizes: number[] = [];
  for (let k = 1; k <= count; k++) {
    const step = (2 * Math.PI * k * hertz) / sampleRate;
    let re = 0, im = 0;
    for (let i = 0; i < length; i++) {
      const v = samples[start + i] - mean;
      re += v * Math.cos(step * i);
      im += v * Math.sin(step * i);
    }
    sizes.push((2 * Math.hypot(re, im)) / length);
  }
  return sizes;
}

/**
 * The part of the time a recorded wave spends in the upper half of its swing:
 * 0.5 for a square wave, null for a steady level. It is read over whole
 * cycles when the trace holds any, so a slow blink is not thrown off by where
 * the trace happens to begin and end. `minSwing` as for `measureSignal`.
 */
export function dutyCycle(samples: ArrayLike<number>, minSwing = MIN_SWING): number | null {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] < min) min = samples[i];
    if (samples[i] > max) max = samples[i];
  }
  const swing = max - min;
  if (!(swing >= minSwing)) return null;
  const middle = (min + max) / 2;
  const edges = risings(samples, middle + swing * HYSTERESIS, middle - swing * HYSTERESIS);
  const from = edges.length >= 2 ? Math.ceil(edges[0]) : 0;
  const to = edges.length >= 2 ? Math.ceil(edges[edges.length - 1]) : samples.length;
  let high = 0;
  for (let i = from; i < to; i++) if (samples[i] > middle) high++;
  return high / (to - from);
}

/** A tone that comes in bursts: a beeper, a gated oscillator. */
export interface BurstReading {
  /** Bursts a second. */
  perSecond: number;
  /** The pitch of the tone inside a burst. */
  hertz: number;
  /** The part of the time it sounds. */
  on: number;
}

/**
 * Reads a recorded tone that is switched on and off: how often, at what
 * pitch, and for how much of the time. Null for a steady tone, for silence,
 * and for a trace too short to hold two whole bursts.
 */
export function measureBursts(samples: ArrayLike<number>, sampleRate: number): BurstReading | null {
  const whole = measureSignal(samples, sampleRate);
  const swing = whole.max - whole.min;
  if (!(swing >= MIN_SWING)) return null;
  const middle = (whole.min + whole.max) / 2;
  const edges = risings(samples, middle + swing * HYSTERESIS, middle - swing * HYSTERESIS);
  if (edges.length < 4) return null;
  const gaps = edges.slice(1).map((at, i) => at - edges[i]);
  const period = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  // A silence is a gap several cycles long: the edge after one starts a burst
  const SILENCE = 3;
  const starts: number[] = [];
  for (let i = 0; i < gaps.length; i++) if (gaps[i] > period * SILENCE) starts.push(edges[i + 1]);
  if (starts.length < 2) return null;
  // Only the whole bursts, from the first start to the last, are counted
  const first = starts[0], last = starts[starts.length - 1];
  let sounding = 0;
  for (let i = 0; i < gaps.length; i++) {
    if (edges[i] < first || edges[i + 1] > last) continue;
    // The cycle that ends a burst is as long as the others, then the silence
    sounding += gaps[i] > period * SILENCE ? period : gaps[i];
  }
  return {
    perSecond: ((starts.length - 1) / (last - first)) * sampleRate,
    hertz: sampleRate / period,
    on: Math.min(1, sounding / (last - first)),
  };
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
