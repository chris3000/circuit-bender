/**
 * Turns the solver's continuous-time output into band-limited audio samples.
 *
 * The solver hands over its solution as a sequence of straight-line segments
 * of arbitrary length (steps are cut short at discrete events, so they do not
 * line up with the sample grid). Converting that to samples takes two stages:
 *
 *  1. Each segment is integrated exactly against a triangular kernel one
 *     oversampled period wide. This is an analytic anti-alias prefilter
 *     (sinc² response), so an edge that lands between two sample instants
 *     contributes to both in proportion to where it fell, instead of being
 *     snapped to one of them.
 *  2. The oversampled stream is low-passed by a Kaiser-windowed sinc FIR and
 *     decimated to the audio rate.
 *
 * Extra "tap" signals (oscilloscope probes) are point-sampled at the audio
 * instants and delayed by the FIR's group delay so they stay aligned with
 * the audio.
 */

const STOPBAND_DB = 80;
/** FIR group delay in audio samples (for oversampling > 1). */
const FIR_DELAY = 16;

function besselI0(x: number): number {
  let sum = 1, term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 40; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

function designLowpass(oversampling: number): Float64Array {
  if (oversampling <= 1) return new Float64Array([1]);
  const half = FIR_DELAY * oversampling;
  const taps = new Float64Array(2 * half + 1);
  const beta = 0.1102 * (STOPBAND_DB - 8.7);
  const i0Beta = besselI0(beta);
  let sum = 0;
  for (let k = 0; k <= 2 * half; k++) {
    const m = k - half;
    const t = m / oversampling;
    const sinc = m === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const r = m / half;
    const w = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0Beta;
    taps[k] = sinc * w;
    sum += taps[k];
  }
  for (let k = 0; k < taps.length; k++) taps[k] /= sum;
  return taps;
}

export class OutputSampler {
  private os = 1;
  private taps: Float64Array = new Float64Array([1]);
  /** FIR history, written twice so a contiguous window is always available. */
  private hist = new Float64Array(2);
  private histPos = 0;

  /** Position inside the current oversampled cell, in [0, 1). */
  private pos = 0;
  /** Kernel-weighted integrals for the sample at the start / end of the cell. */
  private accCur = 0;
  private accNext = 0;
  /** Oversampled samples emitted since the last audio sample. */
  private phase = 0;

  private audioOut = 0;
  private ready = 0;

  private tapCount = 0;
  private tapDelay = 0;
  private tapLines: Float64Array[] = [];
  private tapPos = 0;
  private tapOut = new Float64Array(0);
  /** Tap values at the start of the current cell — the instant the emitted sample is centred on. */
  private tapHold = new Float64Array(0);

  constructor(oversampling: number) {
    this.configure(oversampling);
  }

  /** Set the oversampling factor. Clears all filter state. */
  configure(oversampling: number): void {
    this.os = oversampling;
    this.taps = designLowpass(oversampling);
    this.hist = new Float64Array(this.taps.length * 2);
    this.tapDelay = oversampling > 1 ? FIR_DELAY : 0;
    this.setTapCount(this.tapCount);
    this.reset();
  }

  /** Change the number of tap signals without disturbing the audio filter. */
  setTapCount(tapCount: number): void {
    this.tapCount = tapCount;
    this.tapLines = [];
    for (let i = 0; i < tapCount; i++) this.tapLines.push(new Float64Array(this.tapDelay + 1));
    this.tapOut = new Float64Array(tapCount);
    this.tapHold = new Float64Array(tapCount);
    this.tapPos = 0;
  }

  reset(): void {
    this.hist.fill(0);
    this.histPos = 0;
    this.pos = 0;
    this.accCur = 0;
    this.accNext = 0;
    this.phase = 0;
    this.audioOut = 0;
    this.ready = 0;
    this.tapPos = 0;
    for (const line of this.tapLines) line.fill(0);
    this.tapOut.fill(0);
    this.tapHold.fill(0);
  }

  /**
   * Start as if the signals had been sitting at these values forever, so a
   * circuit that begins at its DC operating point does not produce a start-up
   * thump while the filter fills.
   */
  prime(audio: number, taps: Float64Array): void {
    this.reset();
    this.hist.fill(audio);
    // Half of the sample at the cell boundary comes from the cell before it
    this.accCur = audio * 0.5;
    this.audioOut = audio;
    for (let i = 0; i < this.tapCount; i++) {
      this.tapLines[i].fill(taps[i]);
      this.tapOut[i] = taps[i];
      this.tapHold[i] = taps[i];
    }
  }

  /** Number of audio samples completed and not yet consumed. */
  pending(): number { return this.ready; }
  /** Consume the most recent audio sample. */
  take(): number { this.ready = 0; return this.audioOut; }
  tapValue(i: number): number { return this.tapOut[i]; }

  /**
   * Feed one linear segment. `du` is its length in cells (any length),
   * a0→a1 the audio signal across it, tap0→tap1 the tap signals. tap0 is
   * overwritten.
   */
  addSegment(du: number, a0: number, a1: number, tap0: Float64Array, tap1: Float64Array): void {
    while (du > 0) {
      const u0 = this.pos;
      const room = 1 - u0;
      if (du < room) {
        this.integrate(u0, u0 + du, a0, a1);
        this.pos = u0 + du;
        return;
      }
      // Segment reaches the end of the cell: split it there
      const frac = room / du;
      const aMid = a0 + (a1 - a0) * frac;
      this.integrate(u0, 1, a0, aMid);
      for (let i = 0; i < this.tapCount; i++) tap0[i] += (tap1[i] - tap0[i]) * frac;
      this.emit(tap0);
      a0 = aMid;
      du -= room;
      this.pos = 0;
    }
  }

  /** ∫ v(u)·(1−u) du → sample at cell start, ∫ v(u)·u du → sample at cell end. */
  private integrate(ua: number, ub: number, va: number, vb: number): void {
    const d = ub - ua;
    if (d <= 0) return;
    const total = d * 0.5 * (va + vb);
    const next = d * (va * (2 * ua + ub) + vb * (ua + 2 * ub)) / 6;
    this.accNext += next;
    this.accCur += total - next;
  }

  private emit(tapsNow: Float64Array): void {
    const n = this.taps.length;
    const value = this.accCur;
    this.accCur = this.accNext;
    this.accNext = 0;

    this.hist[this.histPos] = value;
    this.hist[this.histPos + n] = value;
    this.histPos = (this.histPos + 1) % n;

    const tapCount = this.tapCount;
    if (++this.phase < this.os) {
      for (let i = 0; i < tapCount; i++) this.tapHold[i] = tapsNow[i];
      return;
    }
    this.phase = 0;

    // hist[histPos .. histPos+n) is the last n inputs, oldest first
    let acc = 0;
    const h = this.hist, t = this.taps, base = this.histPos;
    for (let k = 0; k < n; k++) acc += t[k] * h[base + k];
    this.audioOut = acc;
    this.ready++;

    if (tapCount === 0) return;
    const len = this.tapDelay + 1;
    for (let i = 0; i < tapCount; i++) {
      const line = this.tapLines[i];
      line[this.tapPos] = this.tapHold[i];
      this.tapOut[i] = line[(this.tapPos + 1) % len];
      this.tapHold[i] = tapsNow[i];
    }
    this.tapPos = (this.tapPos + 1) % len;
  }
}
