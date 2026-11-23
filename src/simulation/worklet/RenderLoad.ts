/**
 * How hard the simulation is working: the time it takes to compute a stretch
 * of sound, as a fraction of the time that sound takes to play. At 1 the
 * audio thread has no time left over, and past it the sound breaks up.
 *
 * An audio worklet has no fine clock — only `Date.now()`, to the millisecond,
 * when a block of 128 samples lasts under three — so one block cannot be
 * timed. Summed over a few hundred blocks the rounding mostly averages out.
 *
 * Mostly: at 48 kHz three blocks last exactly 8 ms, so blocks keep step with
 * the clock and the rounding does not fully cancel. A reading is good to a
 * few points of load (an eighth at the very worst, on a machine with no
 * timing jitter at all). That is enough to say "light", "heavy" or "too
 * much", which is all it is used for; it is not a profiler.
 */
export class RenderLoad {
  private busyMs = 0;
  private frames = 0;
  private startedAt = 0;

  constructor(
    private readonly sampleRate: number,
    /** How much sound goes into one reading, in seconds. */
    private readonly period = 0.5,
    private readonly now: () => number = Date.now,
  ) {}

  /** Call as a block starts being computed. */
  begin(): void {
    this.startedAt = this.now();
  }

  /** Call when the block is done. Returns a reading once enough sound has gone by, otherwise null. */
  end(frames: number): number | null {
    this.busyMs += this.now() - this.startedAt;
    this.frames += frames;
    if (this.frames < this.period * this.sampleRate) return null;
    const load = this.busyMs / 1000 / (this.frames / this.sampleRate);
    this.reset();
    return load;
  }

  reset(): void {
    this.busyMs = 0;
    this.frames = 0;
  }
}
