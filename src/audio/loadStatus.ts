/**
 * Whether the simulation is keeping up with the sound it has to make.
 *
 * Two things are known about each half second of playing: how much of the
 * time available the simulation took (its load, from the worklet), and, in
 * browsers that say, how much of the sound was lost because it was not ready
 * in time (a dropout).
 */
export interface LoadReport {
  /** Time taken to compute the sound over the time it takes to play; 1 is all of it. */
  load: number;
  /** Seconds of sound lost since the last report; 0 where the browser does not say. */
  dropout: number;
}

/** `high`: little room to spare. `over`: the sound is breaking up. */
export type LoadLevel = 'ok' | 'high' | 'over';

/** What is to blame for the sound breaking up: the size of the circuit, or a computer busy with other things. */
export type OverloadCause = 'circuit' | 'computer';

export interface LoadStatus {
  load: number;
  level: LoadLevel;
  /** Set when the level is `over`. */
  cause: OverloadCause | null;
}

/** From here up there is little room left for anything else on the audio thread. */
export const HIGH_LOAD = 0.7;
/** From here up the simulation cannot be relied on to finish in time. */
export const OVER_LOAD = 0.95;
/** How many reports back the level looks: three seconds. */
const WINDOW = 6;

const isOver = (report: LoadReport) => report.load >= OVER_LOAD || report.dropout > 0;

/**
 * Turns the reports into a level that does not flicker. A load at the limit
 * is trouble at once (it is already half a second's average). A dropout on
 * its own may be one busy moment on the computer and only counts as `high`;
 * it takes two bad reports within three seconds to call the sound broken
 * for that, and as long without them to clear it.
 */
export class LoadWatch {
  private recent: LoadReport[] = [];

  add(report: LoadReport): LoadStatus {
    this.recent.push(report);
    if (this.recent.length > WINDOW) this.recent.shift();
    const overs = this.recent.filter(isOver).length;
    if (report.load >= OVER_LOAD || overs >= 2) {
      const heaviest = Math.max(...this.recent.map((r) => r.load));
      return { load: report.load, level: 'over', cause: heaviest >= HIGH_LOAD ? 'circuit' : 'computer' };
    }
    return { load: report.load, level: overs === 1 || report.load >= HIGH_LOAD ? 'high' : 'ok', cause: null };
  }

  reset(): void {
    this.recent = [];
  }
}
