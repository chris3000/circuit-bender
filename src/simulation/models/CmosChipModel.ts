import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';
import { crossingFraction, PwlClamp } from './eventUtils';

/** Schmitt-trigger input thresholds as fractions of the supply (CD4000B data, interpolated to 9 V). */
export const SCHMITT: readonly [number, number] = [0.40, 0.59];
/** An ordinary CMOS input: switches about half way, with a little hysteresis so a slow edge cannot chatter. */
export const PLAIN: readonly [number, number] = [0.47, 0.53];

const ROUT = 280;      // output switch on-resistance
const ROFF = 1e9;
const G_CLAMP = 0.1;   // 10 Ω output protection diode on-conductance
const V_CLAMP = 0.3;   // conducts once the output is this far beyond a rail
/** Below this the chip is not powered and its inputs are not read. */
const MIN_SUPPLY = 0.1;

export interface CmosLayout {
  /** Pin index of each input, and its [low, high] thresholds as fractions of the supply. */
  inputs: number[];
  thresholds: ReadonlyArray<readonly [number, number]>;
  /** Pin index of each output. */
  outputs: number[];
  vdd: number;
  vss: number;
}

/**
 * A CD4000-series logic chip: Schmitt (or plain) inputs, some logic, and
 * outputs that are 280 Ω switches to one rail or the other, each with its
 * protection diodes.
 *
 * Everything electrical is here; a chip says what its pins are and what its
 * outputs do when an input changes. An input changes at the exact instant its
 * voltage crosses a threshold (reported to the solver as an event), so a
 * counter clocked by an oscillator divides its pitch exactly.
 *
 * Pins with nothing wired to them get no node. An unwired input reads low:
 * a floating CMOS input cannot be relied on for anything.
 */
export abstract class CmosChipModel implements ComponentModel {
  abstract readonly type: string;
  readonly nonlinear = false;
  readonly ignoresUnconnectedPins = true;

  /** What each input reads as. */
  protected level: boolean[];
  /** What each output drives. */
  protected high: boolean[];

  private pins: number[] = [];
  private inputFraction: number[];
  private clampHigh: PwlClamp[] = [];
  private clampLow: PwlClamp[] = [];
  private clampsOn = 0;
  /** Outputs wired to something; the rest cannot affect the circuit. */
  private wired: number[] = [];

  constructor(private readonly layout: CmosLayout) {
    this.level = layout.inputs.map(() => false);
    this.high = layout.outputs.map(() => false);
    this.inputFraction = layout.inputs.map(() => Infinity);
    for (let o = 0; o < layout.outputs.length; o++) {
      this.clampHigh.push(new PwlClamp(G_CLAMP, V_CLAMP));
      this.clampLow.push(new PwlClamp(G_CLAMP, V_CLAMP));
    }
  }

  /** Put the chip as it powers up (every input reads low) and set `high` to match. */
  protected abstract powerUp(): void;
  /** Input `index` has just changed to `level[index]`: update the chip and `high`. */
  protected abstract inputChanged(index: number): void;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[], _internalNodeStart: number, _branchStart: number,
    _params: Record<string, number>, pinConnected?: boolean[],
  ): void {
    this.pins = [...pinNodes];
    this.wired = [];
    this.layout.outputs.forEach((pin, o) => {
      if (pinNodes[pin] >= 0 && (!pinConnected || pinConnected[pin])) this.wired.push(o);
    });
    this.reset();
  }

  stampMatrix(G: Float64Array[], _dt: number, _be: boolean): void {
    const nVdd = this.pins[this.layout.vdd];
    const nVss = this.pins[this.layout.vss];
    for (const o of this.wired) {
      const nOut = this.pins[this.layout.outputs[o]];
      stampConductance(G, nOut, nVdd, 1 / (this.high[o] ? ROUT : ROFF));
      stampConductance(G, nOut, nVss, 1 / (this.high[o] ? ROFF : ROUT));
      // Protection diodes: output → VDD and VSS → output
      this.clampHigh[o].stampMatrix(G, nOut, nVdd);
      this.clampLow[o].stampMatrix(G, nVss, nOut);
    }
  }

  stampRhs(b: Float64Array, _dt: number, _be: boolean): void {
    if (this.clampsOn === 0) return;
    const nVdd = this.pins[this.layout.vdd];
    const nVss = this.pins[this.layout.vss];
    for (const o of this.wired) {
      const nOut = this.pins[this.layout.outputs[o]];
      if (this.clampHigh[o].on) this.clampHigh[o].stampRhs(b, nOut, nVdd);
      if (this.clampLow[o].on) this.clampLow[o].stampRhs(b, nVss, nOut);
    }
  }

  /**
   * Only the wired outputs: an output nothing is wired to changes nothing in
   * the circuit, and counting it would have the solver keep a matrix for
   * every count of a counter with one output in use.
   */
  getDiscreteState(): number {
    let highs = 0, clampsHigh = 0, clampsLow = 0;
    this.wired.forEach((o, i) => {
      if (this.high[o]) highs += 2 ** i;
      if (this.clampHigh[o].on) clampsHigh += 2 ** i;
      if (this.clampLow[o].on) clampsLow += 2 ** i;
    });
    const span = 2 ** this.wired.length;
    return highs + span * (clampsHigh + span * clampsLow);
  }

  findEvent(x0: Float64Array, x1: Float64Array): number {
    const { layout, pins } = this;
    const nVdd = pins[layout.vdd], nVss = pins[layout.vss];
    const vdd0 = nVdd >= 0 ? x0[nVdd] : 0, vdd1 = nVdd >= 0 ? x1[nVdd] : 0;
    const vss0 = nVss >= 0 ? x0[nVss] : 0, vss1 = nVss >= 0 ? x1[nVss] : 0;
    const range0 = vdd0 - vss0, range1 = vdd1 - vss1;
    const powered = range0 >= MIN_SUPPLY && range1 >= MIN_SUPPLY;
    let first = Infinity;

    for (let i = 0; i < layout.inputs.length; i++) {
      let f = Infinity;
      if (powered) {
        const nIn = pins[layout.inputs[i]];
        const v0 = nIn >= 0 ? x0[nIn] : 0, v1 = nIn >= 0 ? x1[nIn] : 0;
        const [low, up] = layout.thresholds[i];
        // Reading high → goes low when the input falls through the lower
        // threshold; reading low → goes high when it rises through the upper
        f = this.level[i]
          ? crossingFraction(vss0 + range0 * low - v0, vss1 + range1 * low - v1)
          : crossingFraction(v0 - (vss0 + range0 * up), v1 - (vss1 + range1 * up));
      }
      this.inputFraction[i] = f;
      if (f < first) first = f;
    }

    for (const o of this.wired) {
      const nOut = pins[layout.outputs[o]];
      const hi = this.clampHigh[o], lo = this.clampLow[o];
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
    // Inputs that change at the same instant are all read before the chip
    // acts on any of them: a counter whose clock and reset rise together
    // (as they do when the power comes on) sees the reset.
    const changed: number[] = [];
    for (let i = 0; i < this.level.length; i++) {
      if (this.inputFraction[i] > fraction) continue;
      this.inputFraction[i] = Infinity;
      this.level[i] = !this.level[i];
      changed.push(i);
    }
    for (const i of changed) this.inputChanged(i);
    for (let o = 0; o < this.high.length; o++) {
      if (this.clampHigh[o].applyEvent(fraction)) this.clampsOn += this.clampHigh[o].on ? 1 : -1;
      if (this.clampLow[o].applyEvent(fraction)) this.clampsOn += this.clampLow[o].on ? 1 : -1;
    }
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.clampsOn = 0;
    this.level.fill(false);
    this.inputFraction.fill(Infinity);
    for (let o = 0; o < this.high.length; o++) {
      this.clampHigh[o].reset();
      this.clampLow[o].reset();
    }
    this.powerUp();
  }

  /** Whether output `index` is driving high. */
  isHigh(index: number): boolean {
    return this.high[index] ?? false;
  }
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

/**
 * CD4093: four 2-input NAND gates with Schmitt-trigger inputs.
 * Pins: A1 B1 A2 B2 A3 B3 A4 B4 (0–7), Y1–Y4 (8–11), VDD (12), VSS (13).
 */
export class NandSchmittModel extends CmosChipModel {
  readonly type = 'cd4093';

  constructor() {
    super({ inputs: range(0, 8), thresholds: range(0, 8).map(() => SCHMITT), outputs: range(8, 4), vdd: 12, vss: 13 });
  }

  protected powerUp(): void {
    for (let g = 0; g < 4; g++) this.high[g] = true;
  }

  protected inputChanged(index: number): void {
    const g = index >> 1;
    this.high[g] = !(this.level[2 * g] && this.level[2 * g + 1]);
  }
}

/**
 * CD4013: two D-type flip-flops. Each takes the level on D at the moment its
 * clock rises and holds it on Q (with the opposite on Q̄) until the next.
 * SET high forces Q high and RESET high forces it low, whatever the clock is
 * doing; with both high, Q and Q̄ are both high, as on the real chip.
 * Pins: D1 CLK1 SET1 RST1 D2 CLK2 SET2 RST2 (0–7), Q1 Q̄1 Q2 Q̄2 (8–11), VDD (12), VSS (13).
 */
export class DFlipFlopModel extends CmosChipModel {
  readonly type = 'cd4013';
  private q = [false, false];

  constructor() {
    super({ inputs: range(0, 8), thresholds: range(0, 8).map(() => PLAIN), outputs: range(8, 4), vdd: 12, vss: 13 });
  }

  protected powerUp(): void {
    this.q = [false, false];
    this.show(0);
    this.show(1);
  }

  protected inputChanged(index: number): void {
    const half = index >> 2;
    const [data, clock, set, reset] = this.level.slice(half * 4, half * 4 + 4);
    if (set || reset) this.q[half] = set;
    else if (index % 4 === 1 && clock) this.q[half] = data;
    this.show(half);
  }

  private show(half: number): void {
    const [, , set, reset] = this.level.slice(half * 4, half * 4 + 4);
    this.high[half * 2] = this.q[half];
    this.high[half * 2 + 1] = set && reset ? true : !this.q[half];
  }

  isSet(half: number): boolean { return this.q[half]; }
}

/**
 * CD4040: 12-stage binary ripple counter. It counts on the falling edge of
 * the clock; RESET high holds it at zero.
 * Pins: CLK (0), RST (1), Q1–Q12 (2–13), VDD (14), VSS (15).
 */
export class BinaryCounterModel extends CmosChipModel {
  readonly type = 'cd4040';
  private count = 0;

  constructor() {
    super({ inputs: [0, 1], thresholds: [SCHMITT, PLAIN], outputs: range(2, 12), vdd: 14, vss: 15 });
  }

  protected powerUp(): void {
    this.count = 0;
    this.show();
  }

  protected inputChanged(index: number): void {
    const [clock, reset] = this.level;
    if (reset) this.count = 0;
    else if (index === 0 && !clock) this.count = (this.count + 1) & 0xfff;
    this.show();
  }

  private show(): void {
    for (let q = 0; q < 12; q++) this.high[q] = ((this.count >> q) & 1) === 1;
  }

  getCount(): number { return this.count; }
}

/**
 * CD4017: decade counter with ten decoded outputs, one high at a time. It
 * steps on the rising edge of the clock while CLOCK INHIBIT is low (or on the
 * falling edge of CLOCK INHIBIT while the clock is high, as the real one
 * does); RESET high returns it to Q0. CARRY OUT is high for counts 0–4.
 * Pins: CLK (0), INH (1), RST (2), Q0–Q9 (3–12), CO (13), VDD (14), VSS (15).
 */
export class DecadeCounterModel extends CmosChipModel {
  readonly type = 'cd4017';
  private count = 0;
  private clocked = false;

  constructor() {
    super({ inputs: [0, 1, 2], thresholds: [SCHMITT, PLAIN, PLAIN], outputs: range(3, 11), vdd: 14, vss: 15 });
  }

  protected powerUp(): void {
    this.count = 0;
    this.clocked = false;
    this.show();
  }

  protected inputChanged(_index: number): void {
    const [clock, inhibit, reset] = this.level;
    const clocked = clock && !inhibit;
    if (reset) this.count = 0;
    else if (clocked && !this.clocked) this.count = (this.count + 1) % 10;
    this.clocked = clocked;
    this.show();
  }

  private show(): void {
    for (let q = 0; q < 10; q++) this.high[q] = this.count === q;
    this.high[10] = this.count < 5;
  }

  getCount(): number { return this.count; }
}
